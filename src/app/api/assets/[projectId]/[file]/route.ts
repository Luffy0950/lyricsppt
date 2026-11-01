import { readAsset } from "@/lib/storage";

import { withErrors } from "@/lib/http";

export const runtime = "nodejs";

async function handleGET(_req: Request, { params: paramsP }: { params: Promise<{ projectId: string; file: string }> }) {
  const params = await paramsP;
  const buf = await readAsset(params.projectId, params.file);
  if (!buf) return new Response("Not found", { status: 404 });
  const type = params.file.endsWith(".png") ? "image/png" : "image/jpeg";
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": type,
      // file names are unique per version, so they can be cached
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export const GET = withErrors(handleGET);
