"use client";
import { CheckCircle2, CircleDashed, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import ProjectCover from "@/components/ProjectCover";
import { api } from "@/lib/client";
import { MOOD_DEFS } from "@/lib/moods";
import { Mood, ProjectSummary } from "@/lib/types";

// Original sample lines used only for the demo screen.
const CUES: { mood: Mood; lines: string[] }[] = [
  { mood: "sadness", lines: ["The night was long and the rain kept falling", "I sat alone by the window, waiting"] },
  { mood: "struggle", lines: ["I walked the road where the storm was raging", "Carried my fear like a heavy stone"] },
  { mood: "hope", lines: ["But the light breaks through", "Over the hills where the dark once grew"] },
  { mood: "faith", lines: ["Hold on, hold on", "the dawn is new"] },
];

function ProjectionScreen() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % CUES.length), 3800);
    return () => clearInterval(t);
  }, []);
  const cue = CUES[i];
  return (
    <div className="relative">
      {/* projector beam */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/2 h-40 w-[70%] -translate-x-1/2 opacity-60"
        style={{ background: "radial-gradient(closest-side, rgba(244,185,66,.25), transparent)", filter: "blur(10px)" }}
      />
      <div className="relative overflow-hidden rounded-[18px] border border-white/10 shadow-[0_40px_120px_-40px_rgba(244,185,66,.35)]">
        <div className="slide-frame relative aspect-video w-full">
          {CUES.map((c, n) => {
            const pp = MOOD_DEFS[c.mood].procedural;
            return (
              <div
                key={c.mood}
                aria-hidden
                className="absolute inset-0 transition-opacity duration-[1400ms]"
                style={{
                  opacity: n === i ? 1 : 0,
                  background: `radial-gradient(ellipse at ${pp.glowAt[0] * 100}% ${pp.glowAt[1] * 100}%, ${pp.glow}cc, transparent 55%), linear-gradient(180deg, ${pp.top}, ${pp.bottom})`,
                }}
              />
            );
          })}
          <div className="absolute inset-0 bg-black/25" />
          <div key={i} className="cue-in absolute inset-0 flex flex-col items-center justify-center px-[8%] text-center">
            {cue.lines.map((l) => (
              <p key={l} className="font-[Georgia,serif] text-white" style={{ fontSize: "6.2cqh", lineHeight: 1.25, textShadow: "0 2px 14px rgba(0,0,0,.6)" }}>
                {l}
              </p>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-haze">
        {CUES.map((c, n) => (
          <button
            key={c.mood}
            onClick={() => setI(n)}
            className={`inline-flex items-center gap-1.5 transition-colors ${n === i ? "text-house" : "hover:text-house/80"}`}
          >
            <span className="h-2 w-2 rounded-full" style={{ background: MOOD_DEFS[c.mood].procedural.glow, opacity: n === i ? 1 : 0.4 }} />
            {MOOD_DEFS[c.mood].label}
          </button>
        ))}
        <span className="text-haze/60">The background follows what each line means.</span>
      </div>
    </div>
  );
}

type Status = { llmLabel: string; llm: string; pollinations: boolean; pexels: boolean; stock: boolean };

export default function Dashboard() {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  useEffect(() => {
    api<{ projects: ProjectSummary[] }>("/api/projects").then((r) => setProjects(r.projects)).catch(() => setProjects([]));
    api<Status>("/api/status").then(setStatus).catch(() => undefined);
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-5 pb-20 pt-8 md:px-10 md:pt-14">
      <section className="grid items-center gap-10 lg:grid-cols-[1fr_1.15fr]">
        <div className="animate-rise">
          <h1 className="font-display text-[clamp(2.2rem,4.6vw,3.6rem)] font-extrabold leading-[1.02] tracking-tight">
            Paste the lyrics.
            <br />
            Get a deck that feels like the song.
          </h1>
          <p className="mt-5 max-w-md text-[17px] leading-relaxed text-house/75">
            The app reads what your song means, paints a background for each part, lays out the lyrics for projection, and hands you an
            editable PowerPoint.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/create" className="btn-primary px-5 py-3 text-base">
              <Plus size={18} /> Create new presentation
            </Link>
            <Link href="/templates" className="btn-ghost px-5 py-3 text-base">
              Browse styles
            </Link>
          </div>
        </div>
        <ProjectionScreen />
      </section>

      <section className="mt-20 grid gap-8 border-t border-rail/70 pt-10 md:grid-cols-3">
        {[
          ["Add your lyrics", "Paste them or upload a .txt, .docx or PDF. Review the text before anything is generated."],
          ["Let it read the song", "Theme, mood and imagery are interpreted per section, so a sad verse and a hopeful chorus look different."],
          ["Edit and export", "Adjust words, fonts and backgrounds, then download a .pptx where every lyric is still editable text."],
        ].map(([t, d], n) => (
          <div key={t} className="flex gap-4">
            <span className="font-display text-3xl font-extrabold text-spot/80">{n + 1}</span>
            <div>
              <h2 className="font-display text-lg font-bold">{t}</h2>
              <p className="mt-1 text-sm leading-relaxed text-house/70">{d}</p>
            </div>
          </div>
        ))}
      </section>

      <section className="mt-16">
        <div className="mb-5 flex items-end justify-between">
          <h2 className="font-display text-2xl font-bold">Recent projects</h2>
          {projects && projects.length > 0 && (
            <Link href="/projects" className="text-sm text-haze hover:text-house">
              See all projects
            </Link>
          )}
        </div>
        {projects === null ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((n) => (
              <div key={n} className="aspect-video animate-pulse rounded-xl bg-riser" />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-rail p-8 text-center">
            <p className="text-house/80">No presentations yet. Your first one takes about a minute.</p>
            <Link href="/create" className="btn-primary mt-4">
              <Plus size={16} /> Create new presentation
            </Link>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {projects.slice(0, 4).map((p) => (
              <ProjectCover key={p.id} p={p} />
            ))}
          </div>
        )}
      </section>

      {status && (
        <section className="mt-16 flex flex-wrap gap-x-6 gap-y-2 text-sm text-haze">
          <ServiceLine ok={status.llm !== "offline"} label={`Lyric analysis: ${status.llmLabel}`} />
          <ServiceLine ok={status.pollinations} label={status.pollinations ? "AI backgrounds: Pollinations" : "AI backgrounds: off"} />
          <ServiceLine ok={status.stock} label={status.pexels ? "Stock photos: Pexels" : status.stock ? "Stock photos: Openverse" : "Stock photos: off"} />
          <Link href="/settings" className="underline decoration-rail underline-offset-4 hover:text-house">
            Service settings
          </Link>
        </section>
      )}
    </div>
  );
}

function ServiceLine({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {ok ? <CheckCircle2 size={15} className="text-go" /> : <CircleDashed size={15} className="text-haze/70" />}
      {label}
    </span>
  );
}
