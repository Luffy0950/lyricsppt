import { NextResponse } from "next/server";
import { reconcile } from "@/lib/pipeline";
import { assetExists, deleteProject, getProject, isValidId, updateProject } from "@/lib/storage";
import { Slide } from "@/lib/types";
import { jsonError, patchSchema, zodMessage } from "@/lib/validation";

import { withErrors } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function handleGET(_req: Request, { params: paramsP }: Ctx) {
  const params = await paramsP;
  if (!isValidId(params.id)) return jsonError("Project not found.", 404);
  const p = await getProject(params.id);
  if (!p) return jsonError("Project not found.", 404);
  return NextResponse.json({ project: reconcile(p) });
}

/**
 * Saves editor changes. Backgrounds are owned by the server: for slides the
 * server already knows, the server's background wins (so a save never undoes
 * a background that finished generating meanwhile). For new slides (added,
 * duplicated, restored by undo) the client's background is accepted only if
 * it points at an image that exists in this project.
 */
async function handlePATCH(req: Request, { params: paramsP }: Ctx) {
  const params = await paramsP;
  if (!isValidId(params.id)) return jsonError("Project not found.", 404);
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(zodMessage(parsed.error));
  const body = parsed.data;

  const fileChecks = new Map<string, boolean>();
  if (body.slides) {
    for (const s of body.slides) {
      if (s.background.file) fileChecks.set(s.background.file, await assetExists(params.id, s.background.file));
    }
  }

  const updated = await updateProject(params.id, (p) => {
    if (body.title !== undefined) p.title = p.settings.title = body.title.trim() || "Untitled song";
    if (body.artist !== undefined) p.artist = p.settings.artist = body.artist.trim();
    if (body.settings) Object.assign(p.settings, body.settings);
    if (body.slides) {
      const existing = new Map(p.slides.map((s) => [s.id, s]));
      p.slides = body.slides.map((incoming) => {
        const server = existing.get(incoming.id);
        let background: Slide["background"];
        if (server) background = server.background;
        else if (incoming.background.file && fileChecks.get(incoming.background.file)) background = { ...incoming.background, status: "ready" };
        else background = { status: "failed", error: "No background yet. Generate one for this slide." };
        return { ...(incoming as Slide), background };
      });
    }
  });
  if (!updated) return jsonError("Project not found.", 404);
  return NextResponse.json({ project: reconcile(updated) });
}

async function handleDELETE(_req: Request, { params: paramsP }: Ctx) {
  const params = await paramsP;
  if (!isValidId(params.id)) return jsonError("Project not found.", 404);
  const ok = await deleteProject(params.id);
  return ok ? NextResponse.json({ deleted: true }) : jsonError("Project not found.", 404);
}

export const GET = withErrors(handleGET);
export const PATCH = withErrors(handlePATCH);
export const DELETE = withErrors(handleDELETE);
