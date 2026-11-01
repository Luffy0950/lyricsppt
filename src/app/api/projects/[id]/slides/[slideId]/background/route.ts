import { NextResponse } from "next/server";
import { z } from "zod";
import { renderProceduralBackground } from "@/lib/images/procedural";
import { isSlideRunning, regenerateSlide } from "@/lib/pipeline";
import { getProject, isValidId, updateProject, writeAsset } from "@/lib/storage";
import { jsonError, zodMessage } from "@/lib/validation";

import { withErrors } from "@/lib/http";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string; slideId: string }> };

const schema = z.object({
  action: z.enum(["regenerate", "gradient", "remove"]),
  mode: z.enum(["auto", "ai", "stock"]).default("auto"),
  visualPrompt: z.string().min(3).max(1200).optional(),
  stockQuery: z.string().min(2).max(120).optional(),
});

const fileName = (slideId: string, ext: string) => `${slideId}-${Date.now().toString(36)}.${ext}`;

/**
 * JSON body: regenerate (AI/stock, async), gradient (offline, immediate) or remove.
 * multipart body with "file": use the user's own image as the background.
 * Lyrics and formatting are never modified here.
 */
async function handlePOST(req: Request, { params: paramsP }: Ctx) {
  const params = await paramsP;
  const { id, slideId } = params;
  if (!isValidId(id)) return jsonError("Project not found.", 404);
  const project = await getProject(id);
  const slide = project?.slides.find((s) => s.id === slideId);
  if (!project || !slide) return jsonError("Slide not found. Save your changes and try again.", 404);
  if (isSlideRunning(id, slideId)) return jsonError("A background is already being generated for this slide.", 409);

  const type = req.headers.get("content-type") ?? "";
  if (type.startsWith("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) return jsonError("No image was uploaded.");
    if (file.size > 8 * 1024 * 1024) return jsonError("Images must be 8 MB or smaller.", 413);
    const buf = Buffer.from(await file.arrayBuffer());
    const isJpg = buf[0] === 0xff && buf[1] === 0xd8;
    const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e;
    if (!isJpg && !isPng) return jsonError("Upload a JPG or PNG image (PowerPoint can't use other formats reliably).", 415);
    const name = fileName(slideId, isPng ? "png" : "jpg");
    await writeAsset(id, name, buf);
    const updated = await updateProject(id, (p) => {
      const t = p.slides.find((s) => s.id === slideId);
      if (t) t.background = { status: "ready", source: "upload", file: name, updatedAt: new Date().toISOString() };
    });
    return NextResponse.json({ project: updated });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(zodMessage(parsed.error));
  const { action, mode, visualPrompt, stockQuery } = parsed.data;

  if (action === "remove") {
    const updated = await updateProject(id, (p) => {
      const t = p.slides.find((s) => s.id === slideId);
      if (t) t.background = { status: "failed", error: "Background removed." };
    });
    return NextResponse.json({ project: updated });
  }

  if (action === "gradient") {
    const buf = renderProceduralBackground(slide.mood, project.settings.size, `${slideId}:${Date.now()}`);
    const name = fileName(slideId, "jpg");
    await writeAsset(id, name, buf);
    const updated = await updateProject(id, (p) => {
      const t = p.slides.find((s) => s.id === slideId);
      if (t) t.background = { status: "ready", source: "procedural", file: name, updatedAt: new Date().toISOString() };
    });
    return NextResponse.json({ project: updated });
  }

  if (visualPrompt || stockQuery) {
    await updateProject(id, (p) => {
      const t = p.slides.find((s) => s.id === slideId);
      if (t && visualPrompt) t.visualPrompt = visualPrompt;
      if (t && stockQuery) t.stockQuery = stockQuery;
    });
  }
  regenerateSlide(id, slideId, mode);
  const updated = await getProject(id);
  return NextResponse.json({ project: updated }, { status: 202 });
}

export const POST = withErrors(handlePOST);
