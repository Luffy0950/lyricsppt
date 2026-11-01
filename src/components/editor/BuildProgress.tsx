"use client";
import { AlertTriangle, Check, Loader2 } from "lucide-react";
import { Project, StageKey } from "@/lib/types";

const STAGES: { key: StageKey; label: string }[] = [
  { key: "input", label: "Lyrics received" },
  { key: "analysis", label: "Reading the meaning and mood" },
  { key: "planning", label: "Arranging slides" },
  { key: "backgrounds", label: "Creating backgrounds" },
  { key: "done", label: "Ready to edit" },
];

const order = (k: StageKey) => (k === "rendering" ? 3.5 : STAGES.findIndex((s) => s.key === k));

/** Real progress from the server; nothing here advances on a timer. */
export default function BuildProgress({ project, onRetry }: { project: Project; onRetry: () => void }) {
  const st = project.status;
  const current = order(st.stage);
  const failed = st.state === "failed" || st.state === "interrupted";
  return (
    <div className="mx-auto max-w-lg px-6 py-16">
      <h1 className="font-display text-3xl font-extrabold tracking-tight">{project.title}</h1>
      <p className="mt-2 text-house/70">{failed ? "Generation stopped." : "Building your presentation. You can leave this page; it keeps going."}</p>
      <ol className="mt-8 space-y-4">
        {STAGES.map((s, n) => {
          const done = n < current || st.state === "ready";
          const active = n === Math.floor(current) && !done;
          return (
            <li key={s.key} className="flex items-center gap-3">
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full border ${
                  done ? "border-go bg-go/15 text-go" : active ? (failed ? "border-cue text-cue" : "border-spot text-spot") : "border-rail text-haze/50"
                }`}
              >
                {done ? <Check size={15} /> : active ? failed ? <AlertTriangle size={14} /> : <Loader2 size={15} className="spin" /> : <span className="text-xs">{n + 1}</span>}
              </span>
              <span className={done || active ? "text-house" : "text-haze/60"}>{s.label}</span>
            </li>
          );
        })}
      </ol>
      <p className="mt-8 text-sm text-haze" aria-live="polite">
        {st.message}
        {st.progress.total > 0 && st.stage === "backgrounds" ? ` ${st.progress.done} of ${st.progress.total} done.` : ""}
      </p>
      {st.error && <p className="mt-3 rounded-lg border border-cue/40 bg-cue/10 px-3 py-2 text-sm text-[#ffb3aa]">{st.error}</p>}
      {failed && (
        <button className="btn-primary mt-6" onClick={onRetry}>
          {st.state === "interrupted" ? "Resume generation" : "Try again"}
        </button>
      )}
    </div>
  );
}
