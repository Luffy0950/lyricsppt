// End-to-end smoke test of the pipeline without the web server.
// Usage: npm run smoke  (or: npx tsx scripts/smoke.ts samples/sample-lyrics.txt 4:3)
import { readFileSync, writeFileSync } from "fs";
import { nanoid } from "nanoid";
import { extractLyrics } from "../src/lib/extract";
import { startGeneration, isRunning } from "../src/lib/pipeline";
import { buildPptx } from "../src/lib/pptx";
import { getProject, saveProject } from "../src/lib/storage";
import { DEFAULT_SETTINGS, Project } from "../src/lib/types";

async function main() {
  const file = process.argv[2] ?? "samples/sample-lyrics.txt";
  const size = (process.argv[3] as "16:9" | "4:3") ?? "16:9";
  const lyrics = await extractLyrics(file, readFileSync(file));
  const now = new Date().toISOString();
  const p: Project = {
    id: nanoid(12),
    title: "The Light Breaks Through",
    artist: "Sample Song",
    lyrics,
    settings: { ...DEFAULT_SETTINGS, title: "The Light Breaks Through", artist: "Sample Song", size, endingSlide: true, slideNumbers: true },
    slides: [],
    status: { state: "queued", stage: "input", message: "Queued", progress: { done: 0, total: 0 } },
    warnings: [],
    createdAt: now,
    updatedAt: now,
  };
  await saveProject(p);
  startGeneration(p.id, "full");
  while (isRunning(p.id)) await new Promise((r) => setTimeout(r, 200));
  const done = (await getProject(p.id))!;
  console.log("status:", done.status);
  console.log("analysis:", done.analysis);
  for (const s of done.slides) console.log(`- [${s.section}] ${s.mood} ${s.background.source} | ${s.lines.join(" / ")}`);
  // verify lyrics preserved in order
  const joined = done.slides.filter((s) => s.kind === "lyrics").flatMap((s) => s.lines);
  const orig = lyrics.split("\n").filter((l) => l.trim() && !/^\[.*\]$/.test(l));
  console.log("lyrics preserved:", JSON.stringify(joined) === JSON.stringify(orig));
  const buf = await buildPptx(done);
  const out = `smoke-${size.replace(":", "x")}.pptx`;
  writeFileSync(out, buf);
  console.log("wrote", out);
  console.log("pptx bytes:", buf.length);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
