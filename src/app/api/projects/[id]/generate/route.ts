import { NextResponse } from "next/server";
import { z } from "zod";
import { normalizeLyrics, parseLyrics } from "@/lib/lyrics";
import { GenerateMode, isRunning, startGeneration } from "@/lib/pipeline";
import { getProject, isValidId, updateProject } from "@/lib/storage";
import { jsonError, settingsSchema, zodMessage } from "@/lib/validation";

import { withErrors } from "@/lib/http";

export const runtime = "nodejs";

const schema = z.object({
  mode: z.enum(["full", "resume", "backgrounds"]),
  lyrics: z.string().min(1).max(20000).optional(),
  settings: settingsSchema.partial().optional(),
});

// full = re-analyse lyrics and rebuild slides; resume = only finish missing/failed
// backgrounds; backgrounds = new backgrounds for every slide, keeping lyrics and formatting.
async function handlePOST(req: Request, { params: paramsP }: { params: Promise<{ id: string }> }) {
  const params = await paramsP;
  if (!isValidId(params.id)) return jsonError("Project not found.", 404);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(zodMessage(parsed.error));
  const { mode, lyrics, settings } = parsed.data;
  if (isRunning(params.id)) return jsonError("Generation is already running for this project.", 409);
  if (!(await getProject(params.id))) return jsonError("Project not found.", 404);

  if (lyrics !== undefined && !parseLyrics(normalizeLyrics(lyrics)).lines.length) return jsonError("No lyric lines were found.");

  await updateProject(params.id, (p) => {
    if (lyrics !== undefined) p.lyrics = normalizeLyrics(lyrics);
    if (settings) Object.assign(p.settings, settings);
    p.status = { state: "queued", stage: mode === "full" ? "analysis" : "backgrounds", message: "Starting…", progress: { done: 0, total: p.slides.length } };
  });
  const started = startGeneration(params.id, mode as GenerateMode);
  if (!started) return jsonError("Generation is already running for this project.", 409);
  return NextResponse.json({ started: true }, { status: 202 });
}

export const POST = withErrors(handlePOST);
