"use client";
import { Sparkles } from "lucide-react";
import Link from "next/link";
import SlideView from "@/components/SlideView";
import { STYLES } from "@/lib/moods";
import { Mood, ResolvedStyle, Slide } from "@/lib/types";

const SAMPLE: Record<ResolvedStyle, { mood: Mood; lines: string[] }> = {
  cinematic: { mood: "longing", lines: ["I sat alone by the window, waiting", "for a morning I could not see"] },
  minimalist: { mood: "peace", lines: ["Be still", "and breathe"] },
  worship: { mood: "faith", lines: ["Hold on, hold on", "the dawn is new"] },
  romantic: { mood: "love", lines: ["Every road I walk", "still leads me back to you"] },
  nature: { mood: "nature", lines: ["Over the hills", "where the dark once grew"] },
  modern: { mood: "joy", lines: ["Sing out, sing out", "the shadows are fading"] },
  dramatic: { mood: "struggle", lines: ["I walked the road", "where the storm was raging"] },
};

function sampleSlide(style: ResolvedStyle): Slide {
  const d = STYLES[style];
  const s = SAMPLE[style];
  return {
    id: `tpl-${style}`,
    kind: "lyrics",
    section: "",
    lines: s.lines,
    mood: s.mood,
    visualPrompt: "",
    stockQuery: "",
    overlay: { color: d.overlay, opacity: d.overlayOpacity * 0.5 },
    text: { font: d.font, size: "auto", color: d.text, align: "center", vAlign: "middle", shadow: true, bold: d.bold, emphasis: [] },
    accent: d.accent,
    background: { status: "ready" },
  };
}

export default function TemplatesPage() {
  return (
    <div className="mx-auto max-w-6xl px-5 pb-20 pt-8 md:px-10 md:pt-12">
      <h1 className="font-display text-3xl font-extrabold tracking-tight md:text-4xl">Templates</h1>
      <p className="mt-2 max-w-2xl text-house/70">
        A style sets the type, colours and the kind of imagery the backgrounds use. Every slide still gets its own background based on
        its lyrics. These previews use the app&apos;s offline art; with AI images on, you get real scenes.
      </p>

      <div className="mt-8 flex flex-wrap items-center gap-4 rounded-2xl border border-spot/40 bg-spot/[0.07] p-5">
        <Sparkles className="text-spot" />
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg font-bold">Automatic</h2>
          <p className="text-sm text-house/75">The default. The style is chosen from the song itself: worship songs get the projection style, love songs the romantic one, and so on.</p>
        </div>
        <Link href="/create?style=auto" className="btn-primary">
          Use automatic
        </Link>
      </div>

      <div className="mt-10 grid gap-x-6 gap-y-10 md:grid-cols-2">
        {(Object.keys(STYLES) as ResolvedStyle[]).map((k) => (
          <article key={k}>
            <SlideView slide={sampleSlide(k)} size="16:9" projectId="templates" showStatus={false} rounded="rounded-xl" />
            <div className="mt-3 flex items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-lg font-bold">{STYLES[k].label}</h2>
                <p className="text-sm text-house/70">{STYLES[k].blurb}</p>
                <p className="mt-1 text-xs text-haze">Font: {STYLES[k].font}</p>
              </div>
              <Link href={`/create?style=${k}`} className="btn-ghost shrink-0 py-1.5">
                Use style
              </Link>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
