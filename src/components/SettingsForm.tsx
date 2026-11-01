"use client";
import { Sparkles } from "lucide-react";
import { STYLES } from "@/lib/moods";
import { GenerationSettings, STYLE_PRESETS, StylePreset } from "@/lib/types";

const TAGS: Record<string, string> = {
  cinematic: "Atmospheric light",
  minimalist: "Clean and quiet",
  worship: "Bold, projector-ready",
  romantic: "Warm and soft",
  nature: "Landscapes",
  modern: "Gradients, new type",
  dramatic: "High contrast",
};

type Opt<T extends string> = { v: T; label: string };

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Opt<T>[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="seg flex-wrap" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.v} type="button" aria-pressed={value === o.v} onClick={() => onChange(o.v)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function StylePicker({ value, onChange }: { value: StylePreset; onChange: (s: StylePreset) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      {STYLE_PRESETS.map((s) => {
        const active = value === s;
        const def = s === "auto" ? null : STYLES[s];
        return (
          <button
            key={s}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(s)}
            className={`overflow-hidden rounded-xl border text-left transition-colors ${
              active ? "border-spot bg-rail/60" : "border-rail hover:border-haze/50"
            }`}
          >
            <div
              className="flex h-14 items-center justify-center"
              style={{
                background: def
                  ? `linear-gradient(135deg, ${def.swatch[0]}, ${def.swatch[1]} 60%, ${def.swatch[2]})`
                  : "conic-gradient(from 200deg at 50% 60%, #142142, #b5566a, #f3d08b, #5f8d64, #142142)",
              }}
            >
              {def ? (
                <span className="text-[15px] text-white drop-shadow" style={{ fontFamily: `"${def.font}", serif`, fontWeight: def.bold ? 700 : 400 }}>
                  Aa
                </span>
              ) : (
                <Sparkles size={18} className="text-white drop-shadow" />
              )}
            </div>
            <div className="px-2.5 py-2">
              <p className="text-[13px] font-semibold leading-tight">{def ? def.label.replace(" & lyrics projection", "") : "Automatic"}</p>
              <p className="mt-0.5 text-[11px] leading-snug text-haze">{s === "auto" ? "Picked from the song" : TAGS[s]}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export default function SettingsForm({
  value,
  onChange,
  showStyle = true,
}: {
  value: GenerationSettings;
  onChange: (v: GenerationSettings) => void;
  showStyle?: boolean;
}) {
  const set = <K extends keyof GenerationSettings>(k: K, v: GenerationSettings[K]) => onChange({ ...value, [k]: v });
  return (
    <div className="space-y-6">
      {showStyle && (
        <div>
          <span className="label">Visual style</span>
          <StylePicker value={value.style} onChange={(s) => set("style", s)} />
        </div>
      )}
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <span className="label">Slide size</span>
          <Segmented
            label="Slide size"
            value={value.size}
            onChange={(v) => set("size", v)}
            options={[
              { v: "16:9", label: "16:9 wide" },
              { v: "4:3", label: "4:3" },
            ]}
          />
        </div>
        <div>
          <span className="label">Lyrics per slide</span>
          <Segmented
            label="Lyrics per slide"
            value={value.density}
            onChange={(v) => set("density", v)}
            options={[
              { v: "auto", label: "Auto" },
              { v: "few", label: "Few" },
              { v: "balanced", label: "Balanced" },
              { v: "more", label: "More" },
            ]}
          />
        </div>
        <div>
          <span className="label">Text alignment</span>
          <Segmented
            label="Text alignment"
            value={value.align}
            onChange={(v) => set("align", v)}
            options={[
              { v: "left", label: "Left" },
              { v: "center", label: "Center" },
              { v: "right", label: "Right" },
            ]}
          />
        </div>
        <div>
          <span className="label">Backgrounds</span>
          <Segmented
            label="Background source"
            value={value.backgroundMode}
            onChange={(v) => set("backgroundMode", v)}
            options={[
              { v: "auto", label: "Auto" },
              { v: "ai", label: "AI" },
              { v: "stock", label: "Stock" },
              { v: "gradient", label: "Offline" },
            ]}
          />
          <p className="mt-1.5 text-xs text-haze">
            {
              {
                auto: "Stock photo or AI image, then offline art if a service fails.",
                ai: "Generated by Pollinations AI for each slide (adds a logo without a token).",
                stock: "Free photos with no watermark (Openverse, or Pexels with a key).",
                gradient: "Drawn by the app. Instant, works without internet.",
              }[value.backgroundMode]
            }
          </p>
        </div>
        <div>
          <label className="label" htmlFor="bg-theme">
            Background theme
          </label>
          <input
            id="bg-theme"
            className="field"
            maxLength={60}
            placeholder="Optional, e.g. ocean, mountains, sky"
            value={value.theme ?? ""}
            onChange={(e) => set("theme", e.target.value)}
          />
          <p className="mt-1.5 text-xs text-haze">Every background follows this subject. Leave empty to match each section&apos;s mood.</p>
        </div>
        <div>
          <span className="label">Transition</span>
          <Segmented
            label="Transition"
            value={value.transition}
            onChange={(v) => set("transition", v)}
            options={[
              { v: "none", label: "None" },
              { v: "fade", label: "Fade" },
              { v: "push", label: "Push" },
            ]}
          />
        </div>
        <div className="flex flex-col gap-2 pt-1 text-sm">
          {(
            [
              ["titleSlide", "Add a title slide"],
              ["endingSlide", "Add an ending slide"],
              ["slideNumbers", "Show slide numbers"],
            ] as const
          ).map(([k, l]) => (
            <label key={k} className="inline-flex cursor-pointer items-center gap-2.5">
              <input type="checkbox" className="h-4 w-4" checked={value[k]} onChange={(e) => set(k, e.target.checked)} />
              {l}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
