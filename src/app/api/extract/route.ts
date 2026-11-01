import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { ExtractError, extractLyrics } from "@/lib/extract";
import { jsonError } from "@/lib/validation";

import { withErrors } from "@/lib/http";

export const runtime = "nodejs";

// Extracts lyric text from an uploaded file. The file is processed in memory and not stored.
async function handlePOST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonError("Send the file as multipart form data.");
  }
  const file = form.get("file");
  if (!(file instanceof File)) return jsonError("No file was uploaded.");
  if (file.size === 0) return jsonError("This file is empty.");
  if (file.size > config.maxUploadBytes) return jsonError("This file is larger than 5 MB.", 413);
  try {
    const lyrics = await extractLyrics(file.name, Buffer.from(await file.arrayBuffer()));
    if (lyrics.length > config.maxLyricsChars) {
      return jsonError(`The extracted text is ${lyrics.length.toLocaleString()} characters; the limit is 20,000. Trim it and try again.`);
    }
    return NextResponse.json({ fileName: file.name, lyrics, lineCount: lyrics.split("\n").filter((l) => l.trim()).length });
  } catch (e) {
    if (e instanceof ExtractError) return jsonError(e.message, 422);
    console.error("extract failed", e);
    return jsonError("The file couldn't be read. Check that it isn't corrupted, or paste the lyrics instead.", 422);
  }
}

export const POST = withErrors(handlePOST);
