"use client";
// Renders a slide the same way the PPTX exporter lays it out: sizes are in
// points relative to the 540pt slide height (container query units).
import { AlertTriangle, Loader2 } from "lucide-react";
import { emphasisSegments, LINE_HEIGHT, resolvedFontSize, SAFE } from "@/lib/layout";
import { MOOD_DEFS } from "@/lib/moods";
import { Slide, SlideSize } from "@/lib/types";

const SERIF = new Set(["Georgia", "Palatino Linotype", "Garamond"]);

export function fontStack(font: string) {
  return `"${font}", ${SERIF.has(font) ? 'Georgia, "Times New Roman", serif' : '"Segoe UI", Arial, ui-sans-serif, sans-serif'}`;
}

function hexToRgba(hex: string, a: number) {
  const v = hex.replace("#", "");
  return `rgba(${parseInt(v.slice(0, 2), 16)},${parseInt(v.slice(2, 4), 16)},${parseInt(v.slice(4, 6), 16)},${a})`;
}

export default function SlideView({
  slide,
  size,
  projectId,
  showStatus = true,
  className = "",
  rounded = "rounded-lg",
  slideNumber,
}: {
  slide: Slide;
  size: SlideSize;
  projectId: string;
  showStatus?: boolean;
  className?: string;
  rounded?: string;
  slideNumber?: number;
}) {
  const pt = resolvedFontSize(slide, size);
  const cq = (p: number) => `${(p / 540) * 100}cqh`;
  const proc = MOOD_DEFS[slide.mood].procedural;
  const bg = slide.background;
  const src = bg.file ? `/api/assets/${projectId}/${bg.file}` : undefined;
  const justify = slide.text.vAlign === "top" ? "flex-start" : slide.text.vAlign === "bottom" ? "flex-end" : "center";

  return (
    <div
      className={`slide-frame relative w-full overflow-hidden ${rounded} ${className}`}
      style={{ aspectRatio: size === "4:3" ? "4 / 3" : "16 / 9", background: `linear-gradient(180deg, ${proc.top}, ${proc.bottom})` }}
    >
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
      )}
      <div className="absolute inset-0" style={{ background: hexToRgba(slide.overlay.color, slide.overlay.opacity) }} />

      <div
        className="absolute flex flex-col"
        style={{
          left: `${SAFE.x * 100}%`,
          right: `${SAFE.x * 100}%`,
          top: `${SAFE.y * 100}%`,
          bottom: `${SAFE.y * 100}%`,
          justifyContent: justify,
          textAlign: slide.text.align,
          fontFamily: fontStack(slide.text.font),
          color: slide.text.color,
          fontWeight: slide.text.bold ? 700 : 400,
          lineHeight: LINE_HEIGHT,
          textShadow: slide.text.shadow ? "0 0.04em 0.2em rgba(0,0,0,.65)" : "none",
          fontSize: cq(pt),
        }}
      >
        {slide.kind === "title" ? (
          <>
            <div style={{ fontWeight: 700 }}>{slide.lines[0] || " "}</div>
            {slide.lines.slice(1).map((l, i) => (
              <div key={i} style={{ fontSize: cq(Math.max(16, Math.round(pt * 0.45))), color: slide.accent, fontWeight: 400 }}>
                {l}
              </div>
            ))}
          </>
        ) : (
          slide.lines.map((line, i) => (
            <div key={i} style={{ overflowWrap: "anywhere" }}>
              {emphasisSegments(line || " ", slide.text.emphasis).map((seg, j) =>
                seg.em ? (
                  <span key={j} style={{ color: slide.accent, fontWeight: 700 }}>
                    {seg.text}
                  </span>
                ) : (
                  <span key={j}>{seg.text}</span>
                ),
              )}
            </div>
          ))
        )}
      </div>

      {slideNumber !== undefined && (
        <span className="absolute bottom-[4%] right-[4%] text-white/80" style={{ fontSize: cq(11) }}>
          {slideNumber}
        </span>
      )}

      {showStatus && (bg.status === "generating" || bg.status === "pending") && (
        <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-medium text-white">
          <Loader2 size={11} className="spin" /> {bg.status === "pending" ? "Queued" : "Painting"}
        </span>
      )}
      {showStatus && bg.status === "failed" && (
        <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-cue/85 px-2 py-0.5 text-[10px] font-medium text-white">
          <AlertTriangle size={11} /> No background
        </span>
      )}
    </div>
  );
}
