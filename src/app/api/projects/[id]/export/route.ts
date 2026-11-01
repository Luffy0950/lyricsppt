import { buildPptx, exportFileName } from "@/lib/pptx";
import { getProject, isValidId, updateProject } from "@/lib/storage";
import { jsonError } from "@/lib/validation";

import { withErrors } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Builds, validates and returns the .pptx. Nothing is sent until the file is complete.
async function handleGET(_req: Request, { params: paramsP }: { params: Promise<{ id: string }> }) {
  const params = await paramsP;
  if (!isValidId(params.id)) return jsonError("Project not found.", 404);
  const p = await getProject(params.id);
  if (!p) return jsonError("Project not found.", 404);
  try {
    const buf = await buildPptx(p);
    const name = exportFileName(p);
    await updateProject(p.id, (pp) => {
      pp.lastExport = { file: name, at: new Date().toISOString(), bytes: buf.length };
    });
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`,
        "Content-Length": String(buf.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("export failed", e);
    return jsonError(`Export failed: ${(e as Error).message}`, 500);
  }
}

export const GET = withErrors(handleGET);
