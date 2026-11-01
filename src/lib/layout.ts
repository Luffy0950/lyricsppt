// Text layout maths shared by the browser preview and the PPTX exporter,
// so what the user sees in the editor matches the exported file.
import { Slide, SlideSize, slideDims } from "./types";

export const SAFE = { x: 0.07, y: 0.09 }; // safe margins as a fraction of slide size
export const LINE_HEIGHT = 1.22;

const WIDTH_FACTOR: Record<string, number> = {
  Georgia: 0.53,
  "Palatino Linotype": 0.5,
  Garamond: 0.46,
  "Segoe UI": 0.52,
  Calibri: 0.48,
  Arial: 0.53,
  "Trebuchet MS": 0.52,
  "Century Gothic": 0.58,
  "Franklin Gothic Medium": 0.5,
  Verdana: 0.6,
};

export function textBox(size: SlideSize) {
  const d = slideDims(size);
  return {
    x: d.w * SAFE.x,
    y: d.h * SAFE.y,
    w: d.w * (1 - SAFE.x * 2),
    h: d.h * (1 - SAFE.y * 2),
  };
}

/** Largest font size (pt) that fits every line on one row inside the safe box. */
export function autoFontSize(lines: string[], size: SlideSize, font: string, kind: Slide["kind"], bold = false): number {
  const box = textBox(size);
  const maxPt = kind === "title" ? 60 : size === "4:3" ? 42 : 48;
  const minPt = 16;
  const visible = lines.length ? lines : [" "];
  const longest = Math.max(...visible.map((l) => l.length), 1);
  const factor = (WIDTH_FACTOR[font] ?? 0.53) * (bold ? 1.07 : 1);
  const byWidth = (box.w * 0.96) / (longest * factor);
  const byHeight = box.h / (visible.length * LINE_HEIGHT);
  return Math.max(minPt, Math.min(maxPt, Math.floor(Math.min(byWidth, byHeight))));
}

export function resolvedFontSize(slide: Slide, size: SlideSize): number {
  if (typeof slide.text.size === "number") return slide.text.size;
  const lines = slide.kind === "title" ? slide.lines.slice(0, 1) : slide.lines;
  return autoFontSize(lines, size, slide.text.font, slide.kind, slide.text.bold);
}

/** Split a line into segments, flagging the emphasised words/phrases. */
export function emphasisSegments(line: string, emphasis: string[]): { text: string; em: boolean }[] {
  const terms = emphasis.map((e) => e.trim()).filter(Boolean);
  if (!terms.length) return [{ text: line, em: false }];
  const escaped = terms
    .sort((a, b) => b.length - a.length)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(${escaped.join("|")})`, "gi");
  const out: { text: string; em: boolean }[] = [];
  let last = 0;
  for (const m of line.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > last) out.push({ text: line.slice(last, i), em: false });
    out.push({ text: m[0], em: true });
    last = i + m[0].length;
  }
  if (last < line.length) out.push({ text: line.slice(last), em: false });
  return out.length ? out : [{ text: line, em: false }];
}
