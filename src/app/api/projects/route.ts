import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { normalizeLyrics, parseLyrics } from "@/lib/lyrics";
import { startGeneration } from "@/lib/pipeline";
import { deleteProject, listProjects, saveProject } from "@/lib/storage";
import { Project } from "@/lib/types";
import { createSchema, jsonError, zodMessage } from "@/lib/validation";

import { withErrors } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleGET() {
  return NextResponse.json({ projects: await listProjects() });
}

// Creates a project from confirmed lyrics and starts generation in the background.
async function handlePOST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return jsonError(zodMessage(parsed.error));
  const lyrics = normalizeLyrics(parsed.data.lyrics);
  if (!parseLyrics(lyrics).lines.length) return jsonError("No lyric lines were found. Section labels alone can't be turned into slides.");
  const now = new Date().toISOString();
  const s = parsed.data.settings;
  const project: Project = {
    id: nanoid(12),
    title: s.title.trim() || lyrics.split("\n").find((l) => l.trim() && !l.startsWith("["))?.slice(0, 60) || "Untitled song",
    artist: s.artist.trim(),
    lyrics,
    settings: s,
    slides: [],
    status: { state: "queued", stage: "input", message: "Lyrics received.", progress: { done: 0, total: 0 } },
    warnings: [],
    createdAt: now,
    updatedAt: now,
  };
  project.settings.title = project.title;
  await saveProject(project);
  startGeneration(project.id, "full");
  return NextResponse.json({ id: project.id }, { status: 201 });
}

// Privacy control: delete every saved project and its images.
async function handleDELETE(req: Request) {
  if (new URL(req.url).searchParams.get("all") !== "1") return jsonError("Add ?all=1 to delete every project.");
  const all = await listProjects();
  for (const p of all) await deleteProject(p.id);
  return NextResponse.json({ deleted: all.length });
}

export const GET = withErrors(handleGET);
export const POST = withErrors(handlePOST);
export const DELETE = withErrors(handleDELETE);
