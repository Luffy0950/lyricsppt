// The generation pipeline: analysis → slide planning → backgrounds → ready.
// Runs in the background inside the Node server; every step is persisted so
// the UI can poll progress and failed/interrupted work can be resumed.
import { nanoid } from "nanoid";
import { analyzeWithLlm, llmAvailable } from "./ai/llm";
import { createBackground } from "./images";
import { groupSlides, parseLyrics, rangesToGroups, SlideGroup, validateRanges } from "./lyrics";
import { buildPrompt, buildStockQuery, MOOD_DEFS, offlineAnalyze, STYLES } from "./moods";
import { getProject, updateProject } from "./storage";
import { Analysis, BackgroundMode, Mood, Project, ProjectStatus, ResolvedStyle, Slide, StageKey, VAlign } from "./types";

type JobGlobals = { jobs: Set<string>; slideJobs: Set<string> };
const g = globalThis as unknown as { __l2p?: JobGlobals };
const state: JobGlobals = (g.__l2p ??= { jobs: new Set(), slideJobs: new Set() });

export const isRunning = (id: string) => state.jobs.has(id);
export const isSlideRunning = (id: string, slideId: string) => state.slideJobs.has(`${id}:${slideId}`);

function status(stage: StageKey, message: string, done = 0, total = 0, s: ProjectStatus["state"] = "running"): ProjectStatus {
  return { state: s, stage, message, progress: { done, total } };
}

async function setStatus(id: string, st: ProjectStatus) {
  await updateProject(id, (p) => {
    p.status = st;
  });
}

/** Marks projects whose job died with the server process as interrupted. */
export function reconcile(p: Project): Project {
  if ((p.status.state === "running" || p.status.state === "queued") && !isRunning(p.id)) {
    p.status = { ...p.status, state: "interrupted", message: "Generation stopped before finishing. Resume to continue." };
  }
  for (const s of p.slides) {
    if (s.background.status === "generating" && !isRunning(p.id) && !isSlideRunning(p.id, s.id)) {
      s.background = { ...s.background, status: s.background.file ? "ready" : "failed", error: s.background.file ? undefined : "Interrupted" };
    }
  }
  return p;
}

export function makeSlide(partial: Partial<Slide> & Pick<Slide, "lines" | "mood">, analysis: Analysis, project: Project): Slide {
  const def = STYLES[analysis.style];
  const text = partial.lines.join("\n");
  const visualPrompt = partial.visualPrompt || buildPrompt(text || project.title, partial.mood, analysis.style, 0);
  // A user theme leads every prompt and replaces the photo search, so backgrounds stay on theme
  // even when the offline analyser picked an unrelated scene.
  const theme = project.settings.theme?.trim();
  return {
    id: partial.id ?? nanoid(10),
    kind: partial.kind ?? "lyrics",
    section: partial.section ?? "",
    lines: partial.lines,
    mood: partial.mood,
    visualPrompt: theme && !visualPrompt.toLowerCase().startsWith(theme.toLowerCase()) ? `${theme} theme, ${visualPrompt}` : visualPrompt,
    stockQuery: theme || partial.stockQuery || buildStockQuery(text, partial.mood, 0),
    overlay: { color: analysis.palette.overlay, opacity: def.overlayOpacity },
    text: {
      font: analysis.font,
      size: "auto",
      color: analysis.palette.text,
      align: project.settings.align,
      vAlign: partial.text?.vAlign ?? "middle",
      shadow: true,
      bold: def.bold || partial.kind === "title",
      emphasis: partial.text?.emphasis ?? [],
    },
    accent: analysis.palette.accent,
    background: { status: "pending" },
  };
}

async function analyzeAndPlan(p: Project): Promise<{ analysis: Analysis; slides: Slide[]; warnings: string[] }> {
  const parsed = parseLyrics(p.lyrics);
  if (!parsed.lines.length) throw new Error("No lyric lines were found. Add lyrics and try again.");
  const warnings: string[] = [];
  const preferred: ResolvedStyle | null = p.settings.style === "auto" ? null : p.settings.style;
  let groups: SlideGroup[] = groupSlides(parsed, p.settings.density);
  const lineInfo = parsed.lines.map((l) => ({ index: l.index, text: l.text, section: parsed.stanzas[l.stanza]?.label ?? "" }));
  const textOf = (gr: SlideGroup) => gr.lineIdx.map((i) => parsed.lines[i].text).join("\n");
  const offlineFor = (grs: SlideGroup[]) => offlineAnalyze(grs.map((gr) => ({ section: gr.section, text: textOf(gr) })), preferred);

  let analysis: Analysis;
  let plans: { mood: Mood; visualPrompt: string; stockQuery: string; vAlign: VAlign; emphasis: string[] }[];

  if (llmAvailable()) {
    try {
      await setStatus(p.id, status("analysis", "Reading the lyrics with AI…"));
      const wantRanges = p.settings.density === "auto";
      let result = await analyzeWithLlm(lineInfo, wantRanges ? null : groups, p.settings, (n) => offlineFor(groups).moods.slice(0, n));
      if (wantRanges) {
        const ranges = validateRanges(result.ranges, parsed.lines.length);
        if (ranges && result.slides.length === ranges.length) {
          groups = rangesToGroups(ranges, parsed);
        } else {
          // AI division didn't cover the lyrics exactly; keep our structural division and ask again
          result = await analyzeWithLlm(lineInfo, groups, p.settings, (n) => offlineFor(groups).moods.slice(0, n));
        }
      }
      analysis = result.analysis;
      const off = offlineFor(groups);
      plans = groups.map((gr, i) => {
        const s = result.slides[i];
        const mood = s?.mood ?? off.moods[i];
        const text = textOf(gr);
        return {
          mood,
          visualPrompt: s?.visualPrompt || buildPrompt(text, mood, analysis.style, i),
          stockQuery: s?.stockQuery || buildStockQuery(text, mood, i),
          vAlign: s?.vAlign ?? "middle",
          emphasis: (s?.emphasis ?? []).filter((e) => text.toLowerCase().includes(e.toLowerCase())),
        };
      });
    } catch (e) {
      warnings.push(`AI analysis failed (${(e as Error).message}). Used offline keyword analysis instead.`);
      const off = offlineFor(groups);
      analysis = { engine: "Offline keyword analysis (AI fallback)", ...off.analysis };
      plans = groups.map((gr, i) => ({
        mood: off.moods[i],
        visualPrompt: buildPrompt(textOf(gr), off.moods[i], analysis.style, i),
        stockQuery: buildStockQuery(textOf(gr), off.moods[i], i),
        vAlign: "middle",
        emphasis: [],
      }));
    }
  } else {
    await setStatus(p.id, status("analysis", "Analysing the lyrics offline…"));
    const off = offlineFor(groups);
    analysis = { engine: "Offline keyword analysis", ...off.analysis };
    plans = groups.map((gr, i) => ({
      mood: off.moods[i],
      visualPrompt: buildPrompt(textOf(gr), off.moods[i], analysis.style, i),
      stockQuery: buildStockQuery(textOf(gr), off.moods[i], i),
      vAlign: "middle",
      emphasis: [],
    }));
  }

  await setStatus(p.id, status("planning", "Arranging lyrics into slides…"));

  // Repeated choruses reuse one background prompt so repetition reads as intentional.
  const chorusPrompt = new Map<string, { visualPrompt: string; stockQuery: string; mood: Mood }>();
  const slides: Slide[] = [];
  if (p.settings.titleSlide) {
    const lines = [p.title || "Untitled song", ...(p.artist ? [p.artist] : [])];
    slides.push(
      makeSlide(
        {
          kind: "title",
          section: "Title",
          lines,
          mood: analysis.overallMood,
          visualPrompt: buildPrompt(MOOD_DEFS[analysis.overallMood].scenes[0], analysis.overallMood, analysis.style, 99),
        },
        analysis,
        p,
      ),
    );
  }
  groups.forEach((gr, i) => {
    const lines = gr.lineIdx.map((ix) => parsed.lines[ix].text);
    let plan = plans[i];
    const key = `${gr.section}|${lines.join("|").toLowerCase()}`;
    if (/chorus|refrain|koro/i.test(gr.section)) {
      const seen = chorusPrompt.get(key);
      if (seen) plan = { ...plan, ...seen };
      else chorusPrompt.set(key, { visualPrompt: plan.visualPrompt, stockQuery: plan.stockQuery, mood: plan.mood });
    }
    slides.push(
      makeSlide(
        {
          section: gr.section,
          lines,
          mood: plan.mood,
          visualPrompt: plan.visualPrompt,
          stockQuery: plan.stockQuery,
          text: { vAlign: plan.vAlign, emphasis: plan.emphasis } as Slide["text"],
        },
        analysis,
        p,
      ),
    );
  });
  if (p.settings.endingSlide) {
    const lastMood = slides[slides.length - 1]?.mood ?? analysis.overallMood;
    slides.push(makeSlide({ kind: "ending", section: "Ending", lines: ["Thank you"], mood: lastMood }, analysis, p));
  }
  return { analysis, slides, warnings };
}

/** Reuses an already generated background when two slides share a prompt (e.g. repeated chorus). */
async function runBackgrounds(id: string, mode: BackgroundMode, salt: number) {
  const p = await getProject(id);
  if (!p) return;
  const todo = p.slides.filter((s) => s.background.status !== "ready");
  const total = p.slides.length;
  let done = total - todo.length;
  await setStatus(id, status("backgrounds", `Creating backgrounds (${done}/${total})…`, done, total));
  const byPrompt = new Map<string, Slide["background"]>();
  p.slides.forEach((s) => {
    if (s.background.status === "ready" && s.background.source !== "upload") byPrompt.set(s.visualPrompt, s.background);
  });

  for (const s of todo) {
    const fresh = await getProject(id);
    const current = fresh?.slides.find((x) => x.id === s.id);
    if (!fresh || !current) continue; // slide deleted meanwhile
    if (current.background.status === "ready") {
      done++;
      continue;
    }
    let bg = byPrompt.get(current.visualPrompt);
    if (!bg) {
      await updateProject(id, (pp) => {
        const t = pp.slides.find((x) => x.id === s.id);
        if (t) t.background = { status: "generating" };
      });
      try {
        bg = await createBackground({ projectId: id, slide: current, size: fresh.settings.size, mode, salt });
      } catch (e) {
        bg = { status: "failed", error: (e as Error).message };
      }
      if (bg.status === "ready") byPrompt.set(current.visualPrompt, bg);
    }
    done++;
    await updateProject(id, (pp) => {
      const t = pp.slides.find((x) => x.id === s.id);
      if (t) t.background = bg!;
      pp.status = status("backgrounds", `Creating backgrounds (${done}/${total})…`, done, total);
    });
  }
}

export type GenerateMode = "full" | "resume" | "backgrounds";

export function startGeneration(id: string, mode: GenerateMode): boolean {
  if (state.jobs.has(id)) return false;
  state.jobs.add(id);
  void (async () => {
    try {
      const p = await getProject(id);
      if (!p) return;
      if (mode === "full" || !p.analysis || !p.slides.length) {
        const { analysis, slides, warnings } = await analyzeAndPlan(p);
        await updateProject(id, (pp) => {
          pp.analysis = analysis;
          pp.slides = slides;
          pp.warnings = warnings;
        });
      } else if (mode === "backgrounds") {
        await updateProject(id, (pp) => {
          pp.slides.forEach((s) => {
            if (s.background.source !== "upload") s.background = { status: "pending" };
          });
        });
      }
      const fresh = await getProject(id);
      if (!fresh) return;
      await runBackgrounds(id, fresh.settings.backgroundMode, mode === "full" ? 0 : Date.now() % 997);
      await setStatus(id, status("rendering", "Preparing the preview…"));
      await updateProject(id, (pp) => {
        const failed = pp.slides.filter((s) => s.background.status !== "ready").length;
        pp.status = failed
          ? status("done", `${failed} background(s) failed. Retry them from the editor.`, pp.slides.length - failed, pp.slides.length, "partial")
          : status("done", "Presentation ready.", pp.slides.length, pp.slides.length, "ready");
      });
    } catch (e) {
      await updateProject(id, (pp) => {
        pp.status = { ...pp.status, state: "failed", message: "Generation failed.", error: (e as Error).message };
      }).catch(() => undefined);
    } finally {
      state.jobs.delete(id);
    }
  })();
  return true;
}

/** Regenerates one slide's background without touching its lyrics or formatting. */
export function regenerateSlide(id: string, slideId: string, mode: BackgroundMode): boolean {
  const key = `${id}:${slideId}`;
  if (state.slideJobs.has(key)) return false;
  state.slideJobs.add(key);
  void (async () => {
    try {
      const p = await getProject(id);
      const slide = p?.slides.find((s) => s.id === slideId);
      if (!p || !slide) return;
      const previous = slide.background;
      await updateProject(id, (pp) => {
        const t = pp.slides.find((x) => x.id === slideId);
        if (t) t.background = { ...previous, status: "generating", error: undefined };
      });
      let bg: Slide["background"];
      try {
        bg = await createBackground({ projectId: id, slide, size: p.settings.size, mode, salt: Math.floor(Math.random() * 100000) });
      } catch (e) {
        bg = previous.file ? { ...previous, status: "ready", error: (e as Error).message } : { status: "failed", error: (e as Error).message };
      }
      await updateProject(id, (pp) => {
        const t = pp.slides.find((x) => x.id === slideId);
        if (t) t.background = bg;
      });
    } finally {
      state.slideJobs.delete(key);
    }
  })();
  return true;
}
