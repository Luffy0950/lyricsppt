"use client";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  Download,
  Loader2,
  Play,
  Plus,
  Redo2,
  Trash2,
  Undo2,
} from "lucide-react";
import { nanoid } from "nanoid";
import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import BuildProgress from "@/components/editor/BuildProgress";
import { BackgroundPanel, ServiceStatus, SlidePatch, SongPanel, TextPanel } from "@/components/editor/Inspector";
import Presenter from "@/components/Presenter";
import SlideView from "@/components/SlideView";
import { api, ApiError, downloadExport, jsonInit } from "@/lib/client";
import { Project, Slide } from "@/lib/types";

type Tab = "text" | "background" | "song";
type Toast = { kind: "ok" | "err"; text: string } | null;

const BUILD_STAGES = ["input", "analysis", "planning"];
const isBuilding = (p: Project | null) =>
  !!p && (p.status.state === "queued" || p.status.state === "running") && BUILD_STAGES.includes(p.status.stage);
const isBusyServer = (p: Project | null) => !!p && (p.status.state === "queued" || p.status.state === "running");

/** Apply the server's backgrounds to a list of slides (the server owns backgrounds). */
function mergeBackgrounds(list: Slide[], server: Slide[]): Slide[] {
  const map = new Map(server.map((s) => [s.id, s.background]));
  let changed = false;
  const out = list.map((s) => {
    const bg = map.get(s.id);
    if (bg && JSON.stringify(bg) !== JSON.stringify(s.background)) {
      changed = true;
      return { ...s, background: bg };
    }
    return s;
  });
  return changed ? out : list;
}

export default function EditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [project, setProject] = useState<Project | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [past, setPast] = useState<Slide[][]>([]);
  const [future, setFuture] = useState<Slide[][]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("text");
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [saveState, setSaveState] = useState<"saved" | "dirty" | "saving" | "error">("saved");
  const [services, setServices] = useState<ServiceStatus | null>(null);
  const [exporting, setExporting] = useState(false);
  const [presenting, setPresenting] = useState<number | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [bgBusy, setBgBusy] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const editVersion = useRef(0);
  const lastCoalesce = useRef<{ key: string; at: number } | null>(null);
  const slidesRef = useRef(slides);
  slidesRef.current = slides;
  const wasBuilding = useRef(false);

  const flash = useCallback((t: Toast) => {
    setToast(t);
    if (t) setTimeout(() => setToast((cur) => (cur === t ? null : cur)), 5000);
  }, []);

  // ---------- loading & polling ----------
  const applyServer = useCallback((p: Project, opts: { replaceSlides?: boolean } = {}) => {
    setProject(p);
    if (opts.replaceSlides) {
      setSlides(p.slides);
      setPast([]);
      setFuture([]);
      setTitle(p.title);
      setArtist(p.artist);
      setSelected((cur) => (cur && p.slides.some((s) => s.id === cur) ? cur : p.slides[0]?.id ?? null));
      return;
    }
    setSlides((cur) => mergeBackgrounds(cur, p.slides));
    setPast((h) => h.map((snap) => mergeBackgrounds(snap, p.slides)));
    setFuture((h) => h.map((snap) => mergeBackgrounds(snap, p.slides)));
  }, []);

  useEffect(() => {
    let alive = true;
    api<{ project: Project }>(`/api/projects/${id}`)
      .then(({ project }) => {
        if (!alive) return;
        wasBuilding.current = isBuilding(project);
        applyServer(project, { replaceSlides: true });
      })
      .catch((e: ApiError) => alive && setLoadError(e.message));
    api<ServiceStatus>("/api/status").then(setServices).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [id, applyServer]);

  const needsPoll =
    !!project && (isBusyServer(project) || slides.some((s) => s.background.status === "pending" || s.background.status === "generating"));

  useEffect(() => {
    if (!needsPoll) return;
    const t = setInterval(async () => {
      try {
        const { project: p } = await api<{ project: Project }>(`/api/projects/${id}`);
        const building = isBuilding(p);
        // slides are rebuilt during analysis/planning; take them wholesale once that finishes
        const replace = wasBuilding.current && !building;
        wasBuilding.current = building;
        applyServer(p, { replaceSlides: replace || building });
      } catch {
        /* transient; keep polling */
      }
    }, 2000);
    return () => clearInterval(t);
  }, [needsPoll, id, applyServer]);

  // ---------- editing & history ----------
  const commit = useCallback((next: Slide[], coalesceKey?: string) => {
    const now = Date.now();
    const lc = lastCoalesce.current;
    const merge = coalesceKey && lc && lc.key === coalesceKey && now - lc.at < 1200;
    if (!merge) {
      setPast((h) => [...h.slice(-80), slidesRef.current]);
      setFuture([]);
    }
    lastCoalesce.current = coalesceKey ? { key: coalesceKey, at: now } : null;
    setSlides(next);
    editVersion.current++;
    setSaveState("dirty");
  }, []);

  const patchSlide = useCallback(
    (slideId: string, fn: SlidePatch, key?: string) => {
      commit(
        slidesRef.current.map((s) => (s.id === slideId ? fn(s) : s)),
        key,
      );
    },
    [commit],
  );

  const pastRef = useRef(past);
  pastRef.current = past;
  const futureRef = useRef(future);
  futureRef.current = future;

  const restore = useCallback((snap: Slide[]) => {
    setSlides(snap);
    setSelected((cur) => (cur && snap.some((s) => s.id === cur) ? cur : snap[0]?.id ?? null));
    editVersion.current++;
    setSaveState("dirty");
    lastCoalesce.current = null;
  }, []);

  const undo = useCallback(() => {
    const h = pastRef.current;
    if (!h.length) return;
    setPast(h.slice(0, -1));
    setFuture([slidesRef.current, ...futureRef.current]);
    restore(h[h.length - 1]);
  }, [restore]);

  const redo = useCallback(() => {
    const f = futureRef.current;
    if (!f.length) return;
    setFuture(f.slice(1));
    setPast([...pastRef.current, slidesRef.current]);
    restore(f[0]);
  }, [restore]);

  // ---------- saving ----------
  const save = useCallback(async () => {
    if (!project) return;
    const version = editVersion.current;
    setSaveState("saving");
    try {
      const { project: p } = await api<{ project: Project }>(
        `/api/projects/${id}`,
        jsonInit("PATCH", { slides: slidesRef.current, title, artist }),
      );
      applyServer(p);
      setSaveState(editVersion.current === version ? "saved" : "dirty");
    } catch (e) {
      setSaveState("error");
      flash({ kind: "err", text: `Couldn't save: ${(e as Error).message}` });
    }
  }, [project, id, title, artist, applyServer, flash]);

  useEffect(() => {
    if (saveState !== "dirty" || isBuilding(project)) return;
    const t = setTimeout(save, 1200);
    return () => clearTimeout(t);
  }, [saveState, slides, title, artist, save, project]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (saveState === "dirty" || saveState === "saving") e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saveState]);

  const flush = useCallback(async () => {
    if (saveState === "dirty" || saveState === "error") await save();
  }, [saveState, save]);

  // ---------- keyboard ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
        return;
      }
      if (typing || presenting !== null) return;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        const i = slidesRef.current.findIndex((s) => s.id === selected);
        const n = e.key === "ArrowDown" ? Math.min(slidesRef.current.length - 1, i + 1) : Math.max(0, i - 1);
        if (slidesRef.current[n]) {
          e.preventDefault();
          setSelected(slidesRef.current[n].id);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, save, selected, presenting]);

  // ---------- slide operations ----------
  const idx = slides.findIndex((s) => s.id === selected);
  const current = idx >= 0 ? slides[idx] : null;

  const insertAfter = (i: number, s: Slide) => {
    const next = [...slides];
    next.splice(i + 1, 0, s);
    commit(next);
    setSelected(s.id);
  };

  const addSlide = () => {
    const base = current ?? slides[slides.length - 1];
    if (!base) return;
    insertAfter(idx >= 0 ? idx : slides.length - 1, {
      ...structuredClone(base),
      id: nanoid(10),
      kind: "lyrics",
      section: base.kind === "lyrics" ? base.section : "Verse",
      lines: ["New line"],
      text: { ...base.text, size: "auto", emphasis: [] },
    });
    setTab("text");
  };

  const duplicateSlide = () => current && insertAfter(idx, { ...structuredClone(current), id: nanoid(10) });

  const deleteSlide = () => {
    if (!current || slides.length <= 1) return;
    const next = slides.filter((s) => s.id !== current.id);
    commit(next);
    setSelected(next[Math.min(idx, next.length - 1)].id);
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= slides.length || from === to) return;
    const next = [...slides];
    const [s] = next.splice(from, 1);
    next.splice(to, 0, s);
    commit(next);
  };

  const splitSlide = () => {
    if (!current || current.lines.length < 2) return;
    const half = Math.ceil(current.lines.length / 2);
    const a = { ...current, lines: current.lines.slice(0, half), text: { ...current.text, size: "auto" as const } };
    const b = { ...structuredClone(current), id: nanoid(10), lines: current.lines.slice(half), text: { ...current.text, size: "auto" as const } };
    const next = [...slides];
    next.splice(idx, 1, a, b);
    commit(next);
  };

  const nextSlide = slides[idx + 1];
  const canMerge = !!current && current.kind === "lyrics" && nextSlide?.kind === "lyrics" && current.lines.length + nextSlide.lines.length <= 16;
  const mergeNext = () => {
    if (!canMerge || !current) return;
    const merged = { ...current, lines: [...current.lines, ...nextSlide.lines], text: { ...current.text, size: "auto" as const } };
    const next = [...slides];
    next.splice(idx, 2, merged);
    commit(next);
  };

  const applyTextAll = () => {
    if (!current) return;
    const { font, color, bold, shadow, align, vAlign, size } = current.text;
    commit(
      slides.map((s) => ({
        ...s,
        accent: current.accent,
        text: { ...s.text, font, color, bold: s.kind === "title" ? true : bold, shadow, align, vAlign, size: typeof size === "number" && s.kind === current.kind ? size : "auto" },
      })),
    );
    flash({ kind: "ok", text: "Text style applied to every slide." });
  };

  const applyOverlayAll = () => {
    if (!current) return;
    commit(slides.map((s) => ({ ...s, overlay: { ...current.overlay } })));
    flash({ kind: "ok", text: "Background darkness applied to every slide." });
  };

  // ---------- server actions ----------
  const bgAction = async (body: Record<string, unknown> | FormData) => {
    if (!current) return;
    const slideId = current.id;
    setBgBusy(slideId);
    try {
      await flush();
      const init: RequestInit = body instanceof FormData ? { method: "POST", body } : jsonInit("POST", body);
      if (!(body instanceof FormData) && body.action === "regenerate") {
        // mark as generating right away so the poller starts
        setSlides((cur) => cur.map((s) => (s.id === slideId ? { ...s, background: { ...s.background, status: "generating" } } : s)));
      }
      const { project: p } = await api<{ project: Project }>(`/api/projects/${id}/slides/${slideId}/background`, init);
      if (p) applyServer(p);
    } catch (e) {
      flash({ kind: "err", text: (e as Error).message });
      const { project: p } = await api<{ project: Project }>(`/api/projects/${id}`).catch(() => ({ project: null as Project | null }));
      if (p) applyServer(p);
    } finally {
      setBgBusy(null);
    }
  };

  const regenerate = (mode: "auto" | "ai" | "stock") =>
    current && bgAction({ action: "regenerate", mode, visualPrompt: current.visualPrompt.trim() || undefined, stockQuery: current.stockQuery.trim() || undefined });

  const startJob = async (body: Record<string, unknown>, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    try {
      await flush();
      await api(`/api/projects/${id}/generate`, jsonInit("POST", body));
      const { project: p } = await api<{ project: Project }>(`/api/projects/${id}`);
      wasBuilding.current = isBuilding(p) || body.mode === "full";
      applyServer(p);
    } catch (e) {
      flash({ kind: "err", text: (e as Error).message });
    }
  };

  const updateSettings = async (patch: Partial<Project["settings"]>) => {
    if (!project) return;
    setProject({ ...project, settings: { ...project.settings, ...patch } });
    try {
      const { project: p } = await api<{ project: Project }>(`/api/projects/${id}`, jsonInit("PATCH", { settings: patch }));
      applyServer(p);
    } catch (e) {
      flash({ kind: "err", text: (e as Error).message });
    }
  };

  const doExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      await flush();
      const r = await downloadExport(id);
      flash({ kind: "ok", text: `Downloaded ${r.name} (${Math.round(r.bytes / 1024)} KB). Lyrics stay editable in PowerPoint.` });
    } catch (e) {
      flash({ kind: "err", text: (e as Error).message });
    } finally {
      setExporting(false);
    }
  };

  const failedCount = useMemo(() => slides.filter((s) => s.background.status === "failed").length, [slides]);
  const pendingCount = useMemo(() => slides.filter((s) => s.background.status === "pending" || s.background.status === "generating").length, [slides]);

  // ---------- render ----------
  if (loadError)
    return (
      <div className="mx-auto max-w-md px-6 py-20 text-center">
        <p className="text-lg">{loadError}</p>
        <Link href="/projects" className="btn-ghost mt-6">
          Back to my projects
        </Link>
      </div>
    );
  if (!project)
    return (
      <div className="flex h-[70vh] items-center justify-center text-haze">
        <Loader2 className="spin" />
      </div>
    );
  if (isBuilding(project) || (!slides.length && project.status.state !== "ready"))
    return <BuildProgress project={project} onRetry={() => startJob({ mode: project.status.state === "interrupted" ? "resume" : "full" })} />;

  const size = project.settings.size;
  const running = isBusyServer(project);

  return (
    <div className="flex flex-col lg:h-screen">
      {/* top bar */}
      <header className="flex flex-wrap items-center gap-2 border-b border-rail/70 bg-stage/80 px-3 py-2 md:px-4">
        <div className="mr-auto flex w-full min-w-0 items-center gap-2 sm:w-auto sm:flex-1">
          <input
            aria-label="Presentation title"
            value={title}
            maxLength={140}
            onChange={(e) => {
              setTitle(e.target.value);
              editVersion.current++;
              setSaveState("dirty");
            }}
            className="min-w-0 flex-1 rounded-md sm:max-w-[16rem] bg-transparent px-2 py-1 font-display text-lg font-bold hover:bg-white/5 focus:bg-white/5 focus:outline-none"
          />
          <input
            aria-label="Artist"
            value={artist}
            placeholder="Artist"
            maxLength={140}
            onChange={(e) => {
              setArtist(e.target.value);
              editVersion.current++;
              setSaveState("dirty");
            }}
            className="hidden w-36 rounded-md bg-transparent px-2 py-1 text-sm text-haze hover:bg-white/5 focus:bg-white/5 focus:outline-none sm:block"
          />
          <span className="hidden items-center gap-1 text-xs text-haze lg:inline-flex" aria-live="polite">
            {saveState === "saving" ? (
              <>
                <Loader2 size={12} className="spin" /> Saving
              </>
            ) : saveState === "saved" ? (
              <>
                <Check size={12} /> Saved
              </>
            ) : saveState === "error" ? (
              <span className="text-cue">Not saved</span>
            ) : (
              "Unsaved changes"
            )}
          </span>
        </div>
        {(running || pendingCount > 0) && (
          <span className="inline-flex items-center gap-1.5 text-xs text-spot">
            <Loader2 size={13} className="spin" /> {pendingCount} background{pendingCount === 1 ? "" : "s"} in progress
          </span>
        )}
        <button className="btn-quiet" onClick={undo} disabled={!past.length} aria-label="Undo" title="Undo (Ctrl+Z)">
          <Undo2 size={17} />
        </button>
        <button className="btn-quiet" onClick={redo} disabled={!future.length} aria-label="Redo" title="Redo (Ctrl+Shift+Z)">
          <Redo2 size={17} />
        </button>
        <button className="btn-ghost py-1.5" onClick={() => setPresenting(Math.max(0, idx))}>
          <Play size={15} /> Present
        </button>
        <button className="btn-primary py-1.5" onClick={doExport} disabled={exporting}>
          {exporting ? <Loader2 size={15} className="spin" /> : <Download size={15} />} {exporting ? "Exporting…" : "Export .pptx"}
        </button>
      </header>

      <div className="flex flex-col lg:min-h-0 lg:flex-1 lg:flex-row">
        {/* thumbnails */}
        <aside className="order-2 flex shrink-0 gap-2 overflow-x-auto border-t border-rail/70 bg-stage/50 p-2 lg:order-1 lg:w-56 lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden lg:border-r lg:border-t-0 lg:p-3">
          {slides.map((s, n) => (
            <div
              key={s.id}
              draggable
              onDragStart={(e) => {
                setDragId(s.id);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (dragId) move(slides.findIndex((x) => x.id === dragId), n);
                setDragId(null);
              }}
              onDragEnd={() => setDragId(null)}
              className={`group relative w-36 shrink-0 cursor-grab lg:w-full ${dragId === s.id ? "opacity-40" : ""}`}
            >
              <button
                onClick={() => setSelected(s.id)}
                aria-label={`Slide ${n + 1}${s.section ? `, ${s.section}` : ""}`}
                aria-current={s.id === selected}
                className={`block w-full rounded-lg p-0.5 text-left ring-2 transition ${s.id === selected ? "ring-spot" : "ring-transparent hover:ring-rail"}`}
              >
                <SlideView slide={s} size={size} projectId={id} rounded="rounded-md" />
              </button>
              <div className="mt-1 flex items-center justify-between px-1 text-[11px] text-haze">
                <span className="truncate">
                  {n + 1}. {s.section || (s.kind === "title" ? "Title" : "Slide")}
                </span>
              </div>
            </div>
          ))}
          <button onClick={addSlide} className="flex w-36 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-dashed border-rail py-3 text-xs text-haze hover:border-haze hover:text-house lg:w-full">
            <Plus size={14} /> Add slide
          </button>
        </aside>

        {/* stage */}
        <section className="order-1 flex min-w-0 flex-col items-center p-4 lg:order-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:p-8">
          {current && (
            <>
              <div className="w-full max-w-4xl">
                <SlideView slide={current} size={size} projectId={id} rounded="rounded-xl" className="shadow-[0_30px_80px_-30px_rgba(0,0,0,.8)]" slideNumber={project.settings.slideNumbers ? idx + 1 : undefined} />
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-1">
                <button className="btn-quiet text-xs" onClick={() => move(idx, idx - 1)} disabled={idx <= 0}>
                  <ArrowUp size={14} /> Move up
                </button>
                <button className="btn-quiet text-xs" onClick={() => move(idx, idx + 1)} disabled={idx >= slides.length - 1}>
                  <ArrowDown size={14} /> Move down
                </button>
                <button className="btn-quiet text-xs" onClick={duplicateSlide}>
                  <Copy size={14} /> Duplicate
                </button>
                <button className="btn-quiet text-xs" onClick={addSlide}>
                  <Plus size={14} /> Add after
                </button>
                <button className="btn-quiet text-xs text-cue hover:text-cue" onClick={deleteSlide} disabled={slides.length <= 1}>
                  <Trash2 size={14} /> Delete
                </button>
              </div>
              <p className="mt-2 text-xs text-haze">
                Slide {idx + 1} of {slides.length}. Drag thumbnails to reorder.
              </p>
            </>
          )}
        </section>

        {/* inspector */}
        <aside className="order-3 flex shrink-0 flex-col border-t border-rail/70 bg-riser/40 lg:w-[22rem] lg:border-l lg:border-t-0">
          <div className="flex border-b border-rail/70" role="tablist">
            {(
              [
                ["text", "Text"],
                ["background", "Background"],
                ["song", "Song"],
              ] as const
            ).map(([k, l]) => (
              <button
                key={k}
                role="tab"
                aria-selected={tab === k}
                onClick={() => setTab(k)}
                className={`flex-1 px-3 py-3 text-sm font-medium transition-colors ${tab === k ? "text-house shadow-[inset_0_-2px_0_#F4B942]" : "text-haze hover:text-house"}`}
              >
                {l}
                {k === "song" && failedCount > 0 && <span className="ml-1.5 rounded-full bg-cue px-1.5 text-[10px] text-white">{failedCount}</span>}
              </button>
            ))}
          </div>
          <div className="p-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
            {tab === "song" ? (
              <SongPanel
                project={project}
                analysis={project.analysis}
                services={services}
                running={running}
                failedCount={failedCount}
                onSettings={updateSettings}
                onResume={() => startJob({ mode: "resume" })}
                onAllBackgrounds={() => startJob({ mode: "backgrounds" }, "Create new backgrounds for every slide? Uploaded images are kept.")}
                onRebuild={(lyrics, style, density) =>
                  startJob(
                    { mode: "full", lyrics, settings: { style, density } },
                    "Rebuild the presentation? Current slides and your edits to them will be replaced.",
                  )
                }
              />
            ) : !current ? (
              <p className="text-sm text-haze">Select a slide to edit it.</p>
            ) : tab === "text" ? (
              <TextPanel
                slide={current}
                size={size}
                onChange={(fn, key) => patchSlide(current.id, fn, key)}
                onApplyAll={applyTextAll}
                onSplit={splitSlide}
                onMerge={mergeNext}
                canMerge={canMerge}
              />
            ) : (
              <BackgroundPanel
                slide={current}
                services={services}
                busy={bgBusy === current.id}
                onChange={(fn, key) => patchSlide(current.id, fn, key)}
                onRegenerate={regenerate}
                onGradient={() => bgAction({ action: "gradient" })}
                onUpload={(f) => {
                  const fd = new FormData();
                  fd.append("file", f);
                  void bgAction(fd);
                }}
                onRemove={() => bgAction({ action: "remove" })}
                onApplyOverlayAll={applyOverlayAll}
              />
            )}
          </div>
        </aside>
      </div>

      {toast && (
        <div
          role="status"
          className={`fixed bottom-5 left-1/2 z-50 max-w-[90vw] -translate-x-1/2 rounded-xl border px-4 py-2.5 text-sm shadow-xl ${
            toast.kind === "ok" ? "border-go/40 bg-[#163328] text-house" : "border-cue/50 bg-[#3a1a1a] text-[#ffd0ca]"
          }`}
        >
          {toast.text}
        </div>
      )}

      {presenting !== null && (
        <Presenter
          slides={slides}
          size={size}
          projectId={id}
          start={presenting}
          transition={project.settings.transition}
          slideNumbers={project.settings.slideNumbers}
          onClose={() => setPresenting(null)}
        />
      )}
    </div>
  );
}
