"use client";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  Columns2,
  ExternalLink,
  Image as ImageIcon,
  Images,
  Loader2,
  Merge,
  Paintbrush,
  RefreshCw,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { useRef } from "react";
import { autoFontSize } from "@/lib/layout";
import { MOOD_DEFS, STYLES } from "@/lib/moods";
import { Analysis, Mood, MOODS, Project, Slide, SLIDE_FONTS, SlideFont } from "@/lib/types";
import { Segmented } from "../SettingsForm";

export type SlidePatch = (s: Slide) => Slide;

export interface ServiceStatus {
  llmLabel: string;
  llm: string;
  pollinations: boolean;
  pexels: boolean;
  stock: boolean;
}

const SOURCE_LABEL: Record<string, string> = {
  "ai-pollinations": "AI-generated with Pollinations",
  "stock-pexels": "Stock photo from Pexels",
  "stock-openverse": "Free photo from Openverse",
  procedural: "Offline art made by the app",
  upload: "Your image",
};

function Row({ label, children, htmlFor }: { label: string; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
    </div>
  );
}

export function TextPanel({
  slide,
  size,
  onChange,
  onApplyAll,
  onSplit,
  onMerge,
  canMerge,
}: {
  slide: Slide;
  size: Project["settings"]["size"];
  onChange: (fn: SlidePatch, key?: string) => void;
  onApplyAll: () => void;
  onSplit: () => void;
  onMerge: () => void;
  canMerge: boolean;
}) {
  const t = slide.text;
  const setText = (patch: Partial<Slide["text"]>, key?: string) => onChange((s) => ({ ...s, text: { ...s.text, ...patch } }), key);
  const autoPt = autoFontSize(slide.kind === "title" ? slide.lines.slice(0, 1) : slide.lines, size, t.font, slide.kind, t.bold);

  return (
    <div className="space-y-5">
      <Row label={slide.kind === "title" ? "Title and subtitle (one per line)" : "Lyrics on this slide"} htmlFor="slide-lines">
        <textarea
          id="slide-lines"
          className="field min-h-[150px] resize-y font-[Georgia,serif] leading-6"
          value={slide.lines.join("\n")}
          spellCheck={false}
          onChange={(e) => {
            const lines = e.target.value.split("\n").slice(0, 16);
            onChange((s) => ({ ...s, lines }), `lines:${slide.id}`);
          }}
        />
        {slide.kind === "lyrics" && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button className="btn-quiet text-xs" onClick={onSplit} disabled={slide.lines.length < 2}>
              <Columns2 size={14} /> Split into two slides
            </button>
            <button className="btn-quiet text-xs" onClick={onMerge} disabled={!canMerge}>
              <Merge size={14} /> Merge with next slide
            </button>
          </div>
        )}
      </Row>

      <div className="grid grid-cols-2 gap-3">
        <Row label="Section" htmlFor="slide-section">
          <input
            id="slide-section"
            className="field"
            value={slide.section}
            maxLength={60}
            onChange={(e) => onChange((s) => ({ ...s, section: e.target.value }), `section:${slide.id}`)}
          />
        </Row>
        <Row label="Font" htmlFor="slide-font">
          <select id="slide-font" className="field" value={t.font} onChange={(e) => setText({ font: e.target.value as SlideFont })}>
            {SLIDE_FONTS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </Row>
      </div>

      <Row label={`Text size: ${t.size === "auto" ? `auto (${autoPt} pt)` : `${t.size} pt`}`} htmlFor="slide-size">
        <div className="flex items-center gap-3">
          <input
            id="slide-size"
            type="range"
            min={14}
            max={96}
            value={t.size === "auto" ? autoPt : t.size}
            onChange={(e) => setText({ size: Number(e.target.value) }, `size:${slide.id}`)}
            className="flex-1"
          />
          <button className="btn-quiet text-xs" disabled={t.size === "auto"} onClick={() => setText({ size: "auto" })}>
            Auto fit
          </button>
        </div>
      </Row>

      <div className="flex flex-wrap items-end gap-4">
        <Row label="Horizontal">
          <div className="seg" role="group" aria-label="Horizontal alignment">
            {(
              [
                ["left", AlignLeft],
                ["center", AlignCenter],
                ["right", AlignRight],
              ] as const
            ).map(([v, Icon]) => (
              <button key={v} aria-pressed={t.align === v} aria-label={`Align ${v}`} onClick={() => setText({ align: v })}>
                <Icon size={16} />
              </button>
            ))}
          </div>
        </Row>
        <Row label="Vertical">
          <div className="seg" role="group" aria-label="Vertical position">
            {(
              [
                ["top", AlignVerticalJustifyStart],
                ["middle", AlignVerticalJustifyCenter],
                ["bottom", AlignVerticalJustifyEnd],
              ] as const
            ).map(([v, Icon]) => (
              <button key={v} aria-pressed={t.vAlign === v} aria-label={`Place text at ${v}`} onClick={() => setText({ vAlign: v })}>
                <Icon size={16} />
              </button>
            ))}
          </div>
        </Row>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Row label="Text colour" htmlFor="slide-color">
          <div className="flex items-center gap-2">
            <input id="slide-color" type="color" value={t.color} onChange={(e) => setText({ color: e.target.value.toUpperCase() }, `color:${slide.id}`)} className="h-9 w-12 cursor-pointer rounded border border-rail bg-transparent" />
            <span className="font-mono text-xs text-haze">{t.color}</span>
          </div>
        </Row>
        <Row label="Highlight colour" htmlFor="slide-accent">
          <div className="flex items-center gap-2">
            <input id="slide-accent" type="color" value={slide.accent} onChange={(e) => onChange((s) => ({ ...s, accent: e.target.value.toUpperCase() }), `accent:${slide.id}`)} className="h-9 w-12 cursor-pointer rounded border border-rail bg-transparent" />
            <span className="font-mono text-xs text-haze">{slide.accent}</span>
          </div>
        </Row>
      </div>

      <div className="flex flex-wrap gap-4 text-sm">
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" className="h-4 w-4" checked={t.bold} onChange={(e) => setText({ bold: e.target.checked })} /> Bold
        </label>
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" className="h-4 w-4" checked={t.shadow} onChange={(e) => setText({ shadow: e.target.checked })} /> Text shadow
        </label>
      </div>

      {slide.kind === "lyrics" && (
        <Row label="Highlight words (comma separated, must appear on the slide)" htmlFor="slide-em">
          <input
            id="slide-em"
            className="field"
            value={t.emphasis.join(", ")}
            placeholder="e.g. light, dawn"
            onChange={(e) =>
              setText(
                {
                  emphasis: e.target.value
                    .split(",")
                    .map((x) => x.replace(/^\s+/, ""))
                    .filter((x, i, arr) => x || i === arr.length - 1)
                    .slice(0, 10),
                },
                `em:${slide.id}`,
              )
            }
            onBlur={() => setText({ emphasis: t.emphasis.map((x) => x.trim()).filter(Boolean) })}
          />
        </Row>
      )}

      <button className="btn-ghost w-full" onClick={onApplyAll}>
        <Paintbrush size={15} /> Use this text style on every slide
      </button>
    </div>
  );
}

export function BackgroundPanel({
  slide,
  services,
  busy,
  onChange,
  onRegenerate,
  onGradient,
  onUpload,
  onRemove,
  onApplyOverlayAll,
}: {
  slide: Slide;
  services: ServiceStatus | null;
  busy: boolean;
  onChange: (fn: SlidePatch, key?: string) => void;
  onRegenerate: (mode: "auto" | "ai" | "stock") => void;
  onGradient: () => void;
  onUpload: (f: File) => void;
  onRemove: () => void;
  onApplyOverlayAll: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const bg = slide.background;
  const generating = bg.status === "generating" || bg.status === "pending" || busy;
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-rail bg-stage/60 p-3 text-sm">
        {generating ? (
          <p className="inline-flex items-center gap-2 text-spot">
            <Loader2 size={15} className="spin" /> {bg.status === "pending" ? "Waiting in the queue…" : "Creating a new background…"}
          </p>
        ) : bg.status === "ready" && bg.source ? (
          <>
            <p className="font-medium">{SOURCE_LABEL[bg.source]}</p>
            {bg.credit && (
              <a href={bg.creditUrl} target="_blank" rel="noreferrer" className="mt-0.5 inline-flex items-center gap-1 text-xs text-haze underline-offset-2 hover:underline">
                {bg.credit} <ExternalLink size={11} />
              </a>
            )}
          </>
        ) : (
          <p className="text-cue">This slide has no background yet.</p>
        )}
        {bg.error && !generating && <p className="mt-1.5 text-xs leading-relaxed text-haze">{bg.error}</p>}
      </div>

      <Row label="Scene description (used for AI images)" htmlFor="bg-prompt">
        <textarea
          id="bg-prompt"
          className="field min-h-[110px] resize-y text-[13px] leading-5"
          value={slide.visualPrompt}
          onChange={(e) => onChange((s) => ({ ...s, visualPrompt: e.target.value }), `prompt:${slide.id}`)}
        />
      </Row>

      <div className="grid grid-cols-2 gap-3">
        <Row label="Stock search words" htmlFor="bg-stock">
          <input id="bg-stock" className="field" value={slide.stockQuery} onChange={(e) => onChange((s) => ({ ...s, stockQuery: e.target.value }), `stock:${slide.id}`)} />
        </Row>
        <Row label="Mood" htmlFor="bg-mood">
          <select id="bg-mood" className="field" value={slide.mood} onChange={(e) => onChange((s) => ({ ...s, mood: e.target.value as Mood }))}>
            {MOODS.map((m) => (
              <option key={m} value={m}>
                {MOOD_DEFS[m].label}
              </option>
            ))}
          </select>
        </Row>
      </div>

      <div className="grid gap-2">
        <button className="btn-primary" disabled={generating || !services?.pollinations} onClick={() => onRegenerate("ai")} title={services?.pollinations ? undefined : "AI images are turned off on the server"}>
          <Sparkles size={15} /> New AI background
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-ghost" disabled={generating || !services?.stock} onClick={() => onRegenerate("stock")} title={services?.stock ? undefined : "Stock photos are turned off on the server"}>
            <Images size={15} /> Stock photo
          </button>
          <button className="btn-ghost" disabled={generating} onClick={onGradient}>
            <RefreshCw size={15} /> Offline art
          </button>
          <button className="btn-ghost" disabled={generating} onClick={() => fileRef.current?.click()}>
            <Upload size={15} /> Upload image
          </button>
          <button className="btn-ghost" disabled={generating || !bg.file} onClick={onRemove}>
            <Trash2 size={15} /> Remove
          </button>
        </div>
        {!services?.stock && <p className="text-xs text-haze">Stock photos are turned off (see Settings).</p>}
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUpload(f);
            e.target.value = "";
          }}
        />
      </div>

      <div className="border-t border-rail pt-5">
        <Row label={`Darken background: ${Math.round(slide.overlay.opacity * 100)}%`} htmlFor="bg-overlay">
          <div className="flex items-center gap-3">
            <input
              id="bg-overlay"
              type="range"
              min={0}
              max={85}
              value={Math.round(slide.overlay.opacity * 100)}
              onChange={(e) => onChange((s) => ({ ...s, overlay: { ...s.overlay, opacity: Number(e.target.value) / 100 } }), `ov:${slide.id}`)}
              className="flex-1"
            />
            <input
              type="color"
              aria-label="Overlay colour"
              value={slide.overlay.color}
              onChange={(e) => onChange((s) => ({ ...s, overlay: { ...s.overlay, color: e.target.value.toUpperCase() } }), `ovc:${slide.id}`)}
              className="h-9 w-12 cursor-pointer rounded border border-rail bg-transparent"
            />
          </div>
        </Row>
        <button className="btn-quiet mt-2 text-xs" onClick={onApplyOverlayAll}>
          <ImageIcon size={14} /> Use this darkness on every slide
        </button>
      </div>
    </div>
  );
}

export function SongPanel({
  project,
  analysis,
  services,
  running,
  onSettings,
  onRebuild,
  onAllBackgrounds,
  onResume,
  failedCount,
}: {
  project: Project;
  analysis?: Analysis;
  services: ServiceStatus | null;
  running: boolean;
  onSettings: (patch: Partial<Project["settings"]>) => void;
  onRebuild: (lyrics: string, style: Project["settings"]["style"], density: Project["settings"]["density"]) => void;
  onAllBackgrounds: () => void;
  onResume: () => void;
  failedCount: number;
}) {
  const lyricsRef = useRef<HTMLTextAreaElement>(null);
  const styleRef = useRef<HTMLSelectElement>(null);
  const densityRef = useRef<HTMLSelectElement>(null);
  return (
    <div className="space-y-6">
      {analysis && (
        <section className="space-y-3 text-sm">
          <h3 className="font-display text-base font-bold">How the song was read</h3>
          <p className="leading-relaxed">{analysis.theme}</p>
          {analysis.summary && <p className="leading-relaxed text-house/75">{analysis.summary}</p>}
          {analysis.emotionalArc && (
            <p>
              <span className="text-haze">Emotional arc: </span>
              {analysis.emotionalArc}
            </p>
          )}
          <p>
            <span className="text-haze">Visual direction: </span>
            {analysis.visualDirection}
          </p>
          <p>
            <span className="text-haze">Style: </span>
            {STYLES[analysis.style].label}
          </p>
          <p className="text-xs text-haze">Analysed by {analysis.engine}.</p>
        </section>
      )}

      {project.warnings.length > 0 && (
        <div className="rounded-lg border border-spot/40 bg-spot/10 p-3 text-xs leading-relaxed text-house/90">
          {project.warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
        </div>
      )}

      <section className="space-y-4 border-t border-rail pt-5">
        <h3 className="font-display text-base font-bold">Presentation</h3>
        <div>
          <span className="label">Slide size</span>
          <Segmented
            label="Slide size"
            value={project.settings.size}
            onChange={(v) => onSettings({ size: v })}
            options={[
              { v: "16:9", label: "16:9" },
              { v: "4:3", label: "4:3" },
            ]}
          />
        </div>
        <div>
          <span className="label">Transition</span>
          <Segmented
            label="Transition"
            value={project.settings.transition}
            onChange={(v) => onSettings({ transition: v })}
            options={[
              { v: "none", label: "None" },
              { v: "fade", label: "Fade" },
              { v: "push", label: "Push" },
            ]}
          />
        </div>
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4" checked={project.settings.slideNumbers} onChange={(e) => onSettings({ slideNumbers: e.target.checked })} />
          Show slide numbers
        </label>
      </section>

      <section className="space-y-2 border-t border-rail pt-5">
        <h3 className="font-display text-base font-bold">Regenerate</h3>
        {failedCount > 0 && (
          <button className="btn-primary w-full" disabled={running} onClick={onResume}>
            <RefreshCw size={15} /> Retry {failedCount} missing background{failedCount > 1 ? "s" : ""}
          </button>
        )}
        <button className="btn-ghost w-full" disabled={running} onClick={onAllBackgrounds}>
          <Sparkles size={15} /> New backgrounds for every slide
        </button>
        <p className="text-xs text-haze">Keeps your lyrics and formatting. Uploaded images stay.</p>
      </section>

      <section className="space-y-3 border-t border-rail pt-5">
        <h3 className="font-display text-base font-bold">Rebuild from lyrics</h3>
        <p className="text-xs leading-relaxed text-haze">
          Re-reads the song and lays out new slides. This replaces the current slides and your edits to them.
        </p>
        <textarea ref={lyricsRef} defaultValue={project.lyrics} className="field min-h-[180px] font-[Georgia,serif] text-[13px] leading-6" aria-label="Original lyrics" spellCheck={false} />
        <div className="grid grid-cols-2 gap-2">
          <select ref={styleRef} defaultValue={project.settings.style} className="field" aria-label="Style">
            <option value="auto">Automatic style</option>
            {Object.entries(STYLES).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
          <select ref={densityRef} defaultValue={project.settings.density} className="field" aria-label="Lyrics per slide">
            <option value="auto">Auto lines</option>
            <option value="few">Few lines</option>
            <option value="balanced">Balanced</option>
            <option value="more">More lines</option>
          </select>
        </div>
        <button
          className="btn-danger w-full"
          disabled={running}
          onClick={() =>
            onRebuild(
              lyricsRef.current?.value ?? project.lyrics,
              (styleRef.current?.value ?? project.settings.style) as Project["settings"]["style"],
              (densityRef.current?.value ?? project.settings.density) as Project["settings"]["density"],
            )
          }
        >
          Rebuild presentation
        </button>
        {services && <p className="text-xs text-haze">Analysis uses {services.llmLabel}.</p>}
      </section>
    </div>
  );
}
