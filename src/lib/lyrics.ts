// Lyric parsing and slide division. This module never rewrites lyric text:
// lines are only trimmed of surrounding whitespace and grouped in order.
import { Density } from "./types";

export interface LyricLine {
  index: number; // index among lyric lines only (headers and blanks excluded)
  text: string;
  stanza: number;
}
export interface Stanza {
  index: number;
  label: string;
  lineIdx: number[];
}
export interface ParsedLyrics {
  lines: LyricLine[];
  stanzas: Stanza[];
}
export interface SlideGroup {
  section: string;
  lineIdx: number[];
}

const HEADER_WORDS =
  "verse|chorus|pre[- ]?chorus|post[- ]?chorus|bridge|outro|intro|refrain|hook|tag|coda|interlude|ending|vamp|instrumental|koro|berso|tulay";
const HEADER_RE = new RegExp(
  `^\\s*[\\[(]?\\s*(${HEADER_WORDS})\\s*(\\d+|[ivx]+)?\\s*[:\\])]?\\s*(x\\s*\\d+|\\d+\\s*x)?\\s*[:\\])]?\\s*$`,
  "i",
);
const BRACKET_ONLY_RE = /^\s*\[[^\]]{1,40}\]\s*$/;

/** Normalise whitespace only. Wording, punctuation and order are untouched. */
export function normalizeLyrics(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/[​-‍﻿]/g, "")
    .replace(/\t/g, " ")
    .split("\n")
    .map((l) => l.replace(/\s+$/g, "").replace(/^\s+/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function prettyLabel(raw: string): string {
  const cleaned = raw.replace(/[\[\]():]/g, "").replace(/\s+/g, " ").trim();
  const map: Record<string, string> = { koro: "Chorus", berso: "Verse", tulay: "Bridge" };
  const words = cleaned.split(" ");
  const first = map[words[0].toLowerCase()] ?? words[0];
  return [first.charAt(0).toUpperCase() + first.slice(1).toLowerCase(), ...words.slice(1)].join(" ");
}

export function isHeader(line: string): boolean {
  return HEADER_RE.test(line) || BRACKET_ONLY_RE.test(line);
}

export function parseLyrics(raw: string): ParsedLyrics {
  const text = normalizeLyrics(raw);
  const rows = text.split("\n");
  const lines: LyricLine[] = [];
  const stanzas: Stanza[] = [];
  let current: Stanza | null = null;
  let pendingLabel = "";

  const close = () => {
    if (current && current.lineIdx.length) stanzas.push(current);
    current = null;
  };

  for (const row of rows) {
    if (!row.trim()) {
      close();
      continue;
    }
    if (isHeader(row)) {
      close();
      pendingLabel = prettyLabel(row);
      continue;
    }
    if (!current) {
      current = { index: stanzas.length, label: pendingLabel, lineIdx: [] };
      pendingLabel = "";
    }
    const idx = lines.length;
    lines.push({ index: idx, text: row, stanza: current.index });
    current.lineIdx.push(idx);
  }
  close();
  stanzas.forEach((s, i) => (s.index = i));
  lines.forEach((l) => {
    const s = stanzas.findIndex((st) => st.lineIdx.includes(l.index));
    l.stanza = s;
  });
  labelUnlabeled(stanzas, lines);
  return { lines, stanzas };
}

/** Give unlabeled stanzas Verse/Chorus labels; repeated stanzas become the chorus. */
function labelUnlabeled(stanzas: Stanza[], lines: LyricLine[]) {
  const key = (s: Stanza) =>
    s.lineIdx
      .map((i) => lines[i].text.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, ""))
      .join("|");
  const counts = new Map<string, number>();
  stanzas.forEach((s) => counts.set(key(s), (counts.get(key(s)) ?? 0) + 1));
  let verse = 0;
  const labelFor = new Map<string, string>();
  stanzas.forEach((s) => {
    if (s.label) {
      labelFor.set(key(s), s.label);
      return;
    }
    const k = key(s);
    if (labelFor.has(k)) {
      s.label = labelFor.get(k)!;
    } else if ((counts.get(k) ?? 0) > 1) {
      s.label = "Chorus";
      labelFor.set(k, "Chorus");
    } else {
      verse += 1;
      s.label = `Verse ${verse}`;
    }
  });
}

function maxLinesFor(density: Density, stanzaLines: string[]): number {
  const avg = stanzaLines.reduce((a, l) => a + l.length, 0) / Math.max(1, stanzaLines.length);
  if (density === "few") return 2;
  if (density === "balanced") return avg > 48 ? 3 : 4;
  if (density === "more") return avg > 48 ? 4 : 6;
  // auto
  if (avg > 56) return 2;
  if (avg > 44) return 3;
  if (stanzaLines.length === 5 && avg <= 30) return 5;
  return 4;
}

const ENDS_THOUGHT = /[.!?;:,…)"'”]$/;

/** Split n lines into k nearly even chunks, nudging breaks to land after punctuation. */
function splitEven(idx: number[], texts: string[], max: number): number[][] {
  const n = idx.length;
  if (n <= max) return [idx];
  const k = Math.ceil(n / max);
  const chunks: number[][] = [];
  let start = 0;
  for (let c = 0; c < k; c++) {
    const remaining = n - start;
    const remainingChunks = k - c;
    if (remainingChunks === 1) {
      chunks.push(idx.slice(start));
      break;
    }
    let size = Math.ceil(remaining / remainingChunks);
    // prefer a break after a line that ends a thought (±1 line), staying within limits
    const candidates = [size, size - 1, size + 1].filter(
      (s) => s >= 1 && s <= max && remaining - s <= (remainingChunks - 1) * max && remaining - s >= remainingChunks - 1,
    );
    const good = candidates.find((s) => ENDS_THOUGHT.test(texts[start + s - 1] ?? ""));
    size = good ?? candidates[0] ?? size;
    chunks.push(idx.slice(start, start + size));
    start += size;
  }
  return chunks;
}

export function groupSlides(parsed: ParsedLyrics, density: Density): SlideGroup[] {
  const groups: SlideGroup[] = [];
  for (const s of parsed.stanzas) {
    const texts = s.lineIdx.map((i) => parsed.lines[i].text);
    const max = maxLinesFor(density, texts);
    for (const chunk of splitEven(s.lineIdx, texts, max)) {
      groups.push({ section: s.label, lineIdx: chunk });
    }
  }
  return groups;
}

/** Checks that AI-proposed [start,end] ranges cover every line exactly once, in order. */
export function validateRanges(ranges: unknown, total: number): [number, number][] | null {
  if (!Array.isArray(ranges) || !ranges.length) return null;
  let expect = 0;
  const out: [number, number][] = [];
  for (const r of ranges) {
    if (!Array.isArray(r) || r.length !== 2) return null;
    const [a, b] = r.map(Number);
    if (!Number.isInteger(a) || !Number.isInteger(b) || a !== expect || b < a || b - a > 7) return null;
    out.push([a, b]);
    expect = b + 1;
  }
  return expect === total ? out : null;
}

export function rangesToGroups(ranges: [number, number][], parsed: ParsedLyrics): SlideGroup[] {
  return ranges.map(([a, b]) => {
    const lineIdx = Array.from({ length: b - a + 1 }, (_, i) => a + i);
    const st = parsed.stanzas[parsed.lines[a].stanza];
    return { section: st?.label ?? "", lineIdx };
  });
}
