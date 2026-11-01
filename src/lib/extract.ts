// Text extraction for .txt, .docx and text-based .pdf uploads.
import { normalizeLyrics } from "./lyrics";

export class ExtractError extends Error {}

function decodeText(buf: Buffer): string {
  if (buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString("utf16le");
  if (buf[0] === 0xfe && buf[1] === 0xff) {
    const swapped = Buffer.from(buf.subarray(2));
    swapped.swap16();
    return swapped.toString("utf16le");
  }
  const utf8 = buf.toString("utf8").replace(/^﻿/, "");
  const bad = (utf8.match(/�/g) ?? []).length;
  return bad > utf8.length * 0.01 ? buf.toString("latin1") : utf8;
}

function looksBinary(text: string): boolean {
  if (!text) return false;
  const control = (text.match(/[\x00-\x08\x0E-\x1F]/g) ?? []).length;
  return control > text.length * 0.02;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

async function fromDocx(buf: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  try {
    // HTML keeps one paragraph per lyric line and empty paragraphs as stanza breaks
    const { value } = await mammoth.convertToHtml({ buffer: buf }, { ignoreEmptyParagraphs: false } as never);
    const text = value
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|h[1-6]|li)>/gi, "\n")
      .replace(/<[^>]+>/g, "");
    return decodeEntities(text);
  } catch {
    throw new ExtractError("This .docx file could not be read. It may be corrupted or password-protected.");
  }
}

async function fromPdf(buf: Buffer): Promise<string> {
  // import the library entry directly; the package index runs a debug self-test
  const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default as (b: Buffer) => Promise<{ text: string }>;
  try {
    const { text } = await pdfParse(buf);
    return text;
  } catch {
    throw new ExtractError("This PDF could not be read. It may be corrupted or password-protected.");
  }
}

export async function extractLyrics(fileName: string, buf: Buffer): Promise<string> {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  let text: string;
  if (ext === "txt" || ext === "text" || ext === "lrc") {
    text = decodeText(buf);
    if (looksBinary(text)) throw new ExtractError("This file doesn't look like plain text.");
  } else if (ext === "docx") {
    if (buf.subarray(0, 2).toString() !== "PK") throw new ExtractError("This isn't a valid .docx file.");
    text = await fromDocx(buf);
  } else if (ext === "pdf") {
    if (!buf.subarray(0, 5).toString().startsWith("%PDF")) throw new ExtractError("This isn't a valid PDF file.");
    text = await fromPdf(buf);
  } else {
    throw new ExtractError("Unsupported file type. Upload a .txt, .docx or text-based .pdf file.");
  }

  // strip LRC-style timestamps ([00:12.34]) which are timing data, not lyrics
  if (ext === "lrc") text = text.replace(/^\s*\[\d{1,2}:\d{2}(?:[.:]\d{1,3})?\]\s*/gm, "");

  const clean = normalizeLyrics(text);
  if (!clean.replace(/\s/g, "")) {
    throw new ExtractError(
      ext === "pdf"
        ? "No text was found in this PDF. Scanned PDFs (images of text) aren't supported — paste the lyrics instead."
        : "This file is empty.",
    );
  }
  return clean;
}
