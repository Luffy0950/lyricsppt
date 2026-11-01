import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { copyAssets, getProject, isValidId, saveProject } from "@/lib/storage";
import { isRunning } from "@/lib/pipeline";
import { jsonError } from "@/lib/validation";

import { withErrors } from "@/lib/http";

export const runtime = "nodejs";

async function handlePOST(_req: Request, { params: paramsP }: { params: Promise<{ id: string }> }) {
  const params = await paramsP;
  if (!isValidId(params.id)) return jsonError("Project not found.", 404);
  const p = await getProject(params.id);
  if (!p) return jsonError("Project not found.", 404);
  if (isRunning(p.id)) return jsonError("Wait for generation to finish before duplicating.", 409);
  const now = new Date().toISOString();
  const copy = structuredClone(p);
  copy.id = nanoid(12);
  copy.title = `${p.title} (copy)`;
  copy.settings.title = copy.title;
  copy.createdAt = now;
  copy.updatedAt = now;
  delete copy.lastExport;
  await saveProject(copy);
  await copyAssets(p.id, copy.id);
  return NextResponse.json({ id: copy.id }, { status: 201 });
}

export const POST = withErrors(handlePOST);
