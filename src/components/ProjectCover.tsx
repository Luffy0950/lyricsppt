"use client";
import { AlertTriangle, Loader2 } from "lucide-react";
import Link from "next/link";
import { timeAgo } from "@/lib/client";
import { STYLES } from "@/lib/moods";
import { ProjectSummary } from "@/lib/types";

export function StatusBadge({ status }: { status: ProjectSummary["status"] }) {
  if (status.state === "running" || status.state === "queued")
    return (
      <span className="inline-flex items-center gap-1 text-xs text-spot">
        <Loader2 size={12} className="spin" /> Generating
      </span>
    );
  if (status.state === "failed" || status.state === "interrupted" || status.state === "partial")
    return (
      <span className="inline-flex items-center gap-1 text-xs text-cue">
        <AlertTriangle size={12} /> {status.state === "partial" ? "Needs attention" : status.state === "failed" ? "Failed" : "Interrupted"}
      </span>
    );
  return null;
}

export default function ProjectCover({ p, children }: { p: ProjectSummary; children?: React.ReactNode }) {
  const sw = STYLES[p.resolvedStyle ?? "cinematic"].swatch;
  return (
    <div className="group">
      <Link href={`/editor/${p.id}`} className="block overflow-hidden rounded-xl border border-rail/80 bg-stage">
        <div className="relative aspect-video" style={{ background: `linear-gradient(160deg, ${sw[0]}, ${sw[1]} 60%, ${sw[2]})` }}>
          {p.cover && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.cover} alt="" className="absolute inset-0 h-full w-full object-cover opacity-90 transition-opacity group-hover:opacity-100" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
          <div className="absolute inset-x-3 bottom-2.5">
            <p className="truncate font-display text-base font-bold text-white">{p.title}</p>
            {p.artist && <p className="truncate text-xs text-white/75">{p.artist}</p>}
          </div>
        </div>
      </Link>
      <div className="mt-2 flex items-center justify-between gap-2 px-0.5 text-xs text-haze">
        <span>
          {p.slideCount} slides, edited {timeAgo(p.updatedAt)}
        </span>
        <StatusBadge status={p.status} />
      </div>
      {children}
    </div>
  );
}
