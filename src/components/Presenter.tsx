"use client";
// Full-screen slideshow preview. Arrow keys / space / click to move, Esc to leave.
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Slide, SlideSize, Transition } from "@/lib/types";
import SlideView from "./SlideView";

export default function Presenter({
  slides,
  size,
  projectId,
  start,
  transition,
  slideNumbers,
  onClose,
}: {
  slides: Slide[];
  size: SlideSize;
  projectId: string;
  start: number;
  transition: Transition;
  slideNumbers: boolean;
  onClose: () => void;
}) {
  const [i, setI] = useState(start);
  const ref = useRef<HTMLDivElement>(null);
  const next = useCallback(() => setI((n) => Math.min(slides.length - 1, n + 1)), [slides.length]);
  const prev = useCallback(() => setI((n) => Math.max(0, n - 1)), []);

  useEffect(() => {
    const el = ref.current;
    el?.requestFullscreen?.().catch(() => undefined);
    const onKey = (e: KeyboardEvent) => {
      if (["ArrowRight", "ArrowDown", "PageDown", " ", "Enter"].includes(e.key)) {
        e.preventDefault();
        next();
      } else if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace"].includes(e.key)) {
        e.preventDefault();
        prev();
      } else if (e.key === "Home") setI(0);
      else if (e.key === "End") setI(slides.length - 1);
      else if (e.key === "Escape") onClose();
    };
    const onFs = () => {
      if (!document.fullscreenElement) onClose();
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onFs);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    };
  }, [next, prev, onClose, slides.length]);

  const anim = transition === "fade" ? "animate-crossfade" : transition === "push" ? "animate-rise" : "";
  const ratio = size === "4:3" ? 4 / 3 : 16 / 9;

  return (
    <div ref={ref} className="fixed inset-0 z-[100] flex items-center justify-center bg-black" role="dialog" aria-label="Slideshow preview">
      <div
        className="group relative cursor-pointer"
        style={{ width: `min(100vw, calc(100vh * ${ratio}))` }}
        onClick={(e) => {
          const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
          if (e.clientX - r.left < r.width * 0.3) prev();
          else next();
        }}
      >
        <div key={i} className={anim}>
          <SlideView
            slide={slides[i]}
            size={size}
            projectId={projectId}
            showStatus={false}
            rounded="rounded-none"
            slideNumber={slideNumbers ? i + 1 : undefined}
          />
        </div>
      </div>
      <div className="fixed bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-white/10 px-2 py-1 text-sm text-white opacity-0 backdrop-blur transition-opacity hover:opacity-100 focus-within:opacity-100">
        <button className="rounded-full p-1.5 hover:bg-white/15" onClick={prev} aria-label="Previous slide">
          <ChevronLeft size={18} />
        </button>
        <span className="tabular-nums">
          {i + 1} / {slides.length}
        </span>
        <button className="rounded-full p-1.5 hover:bg-white/15" onClick={next} aria-label="Next slide">
          <ChevronRight size={18} />
        </button>
        <button className="rounded-full p-1.5 hover:bg-white/15" onClick={onClose} aria-label="Exit slideshow">
          <X size={18} />
        </button>
      </div>
    </div>
  );
}
