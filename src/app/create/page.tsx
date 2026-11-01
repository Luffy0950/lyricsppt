"use client";
import { FileText, Loader2, Upload, Wand2, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import SettingsForm from "@/components/SettingsForm";
import { api, jsonInit, loadDefaults } from "@/lib/client";
import { groupSlides, parseLyrics } from "@/lib/lyrics";
import { DEFAULT_SETTINGS, GenerationSettings, STYLE_PRESETS, StylePreset } from "@/lib/types";

const ACCEPT = ".txt,.docx,.pdf,.lrc";

function CreateInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [settings, setSettings] = useState<GenerationSettings>(DEFAULT_SETTINGS);
  const [lyrics, setLyrics] = useState("");
  const [file, setFile] = useState<{ name: string; lines: number } | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rights, setRights] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const d = loadDefaults();
    const s = params.get("style");
    if (s && (STYLE_PRESETS as readonly string[]).includes(s)) d.style = s as StylePreset;
    setSettings(d);
  }, [params]);

  const preview = useMemo(() => {
    if (!lyrics.trim()) return null;
    const parsed = parseLyrics(lyrics);
    const groups = groupSlides(parsed, settings.density === "auto" ? "auto" : settings.density);
    const sections = Array.from(new Set(parsed.stanzas.map((s) => s.label)));
    return { lines: parsed.lines.length, stanzas: parsed.stanzas.length, sections, slides: groups.length };
  }, [lyrics, settings.density]);

  async function handleFile(f: File) {
    setError(null);
    const ext = f.name.toLowerCase().split(".").pop();
    if (!["txt", "docx", "pdf", "lrc"].includes(ext ?? "")) {
      setError("That file type isn't supported. Upload a .txt, .docx or text-based .pdf file.");
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      setError("That file is larger than 5 MB.");
      return;
    }
    setExtracting(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const r = await api<{ fileName: string; lyrics: string; lineCount: number }>("/api/extract", { method: "POST", body: fd });
      setLyrics(r.lyrics);
      setFile({ name: r.fileName, lines: r.lineCount });
    } catch (e) {
      setError((e as Error).message);
      setFile(null);
    } finally {
      setExtracting(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function removeFile() {
    setFile(null);
    setLyrics("");
  }

  async function generate() {
    if (submitting) return;
    setError(null);
    if (!preview || preview.lines === 0) {
      setError("Add lyrics first. Section labels alone can't become slides.");
      return;
    }
    if (!rights) {
      setError("Confirm that you have the right to use these lyrics.");
      return;
    }
    setSubmitting(true);
    try {
      const r = await api<{ id: string }>("/api/projects", jsonInit("POST", { lyrics, settings }));
      router.push(`/editor/${r.id}`);
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-5 pb-24 pt-8 md:px-10 md:pt-12">
      <h1 className="font-display text-3xl font-extrabold tracking-tight md:text-4xl">Create a presentation</h1>
      <p className="mt-2 max-w-xl text-house/70">Add the lyrics, check them over, pick a look, and generate.</p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1.1fr_1fr]">
        {/* lyrics column */}
        <section aria-labelledby="lyrics-h">
          <h2 id="lyrics-h" className="mb-3 font-display text-xl font-bold">
            Lyrics
          </h2>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const f = e.dataTransfer.files?.[0];
              if (f) handleFile(f);
            }}
            className={`flex flex-wrap items-center gap-3 rounded-xl border border-dashed px-4 py-3.5 transition-colors ${
              dragging ? "border-spot bg-spot/10" : "border-rail bg-riser/40"
            }`}
          >
            {extracting ? (
              <span className="inline-flex items-center gap-2 text-sm text-house/80">
                <Loader2 size={16} className="spin" /> Reading the file…
              </span>
            ) : file ? (
              <>
                <FileText size={18} className="text-spot" />
                <span className="min-w-0 flex-1 truncate text-sm">
                  {file.name} <span className="text-haze">({file.lines} lines found)</span>
                </span>
                <button className="btn-quiet" onClick={() => inputRef.current?.click()}>
                  Replace
                </button>
                <button className="btn-quiet" onClick={removeFile} aria-label="Remove file">
                  <X size={16} />
                </button>
              </>
            ) : (
              <>
                <Upload size={18} className="text-haze" />
                <span className="flex-1 text-sm text-house/80">Drop a .txt, .docx or PDF here, or</span>
                <button className="btn-ghost py-1.5" onClick={() => inputRef.current?.click()}>
                  Browse files
                </button>
              </>
            )}
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
          </div>

          <label htmlFor="lyrics" className="label mt-4">
            {file ? "Extracted text. Fix anything that came through wrong before generating." : "Or paste the lyrics"}
          </label>
          <textarea
            id="lyrics"
            value={lyrics}
            onChange={(e) => setLyrics(e.target.value)}
            spellCheck={false}
            placeholder={"[Verse 1]\nFirst line of the song\nSecond line\n\n[Chorus]\n…"}
            className="field min-h-[420px] resize-y font-[Georgia,serif] text-[15px] leading-7"
          />
          <p className="mt-2 text-xs leading-relaxed text-haze">
            Leave a blank line between verses. Labels like [Chorus] or Verse 2: are optional and won&apos;t appear on slides. Your wording is
            kept exactly as written.
          </p>
          {preview && (
            <p className="mt-3 text-sm text-house/80">
              {preview.lines} lines in {preview.stanzas} {preview.stanzas === 1 ? "part" : "parts"}
              {preview.sections.length > 0 && <> ({preview.sections.slice(0, 6).join(", ")}{preview.sections.length > 6 ? "…" : ""})</>}. About{" "}
              {preview.slides + (settings.titleSlide ? 1 : 0) + (settings.endingSlide ? 1 : 0)} slides.
            </p>
          )}
        </section>

        {/* settings column */}
        <section aria-labelledby="settings-h" className="lg:sticky lg:top-6 lg:self-start">
          <h2 id="settings-h" className="mb-3 font-display text-xl font-bold">
            Song and look
          </h2>
          <div className="panel space-y-6 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="title" className="label">
                  Song title
                </label>
                <input id="title" className="field" value={settings.title} maxLength={140} onChange={(e) => setSettings({ ...settings, title: e.target.value })} placeholder="Optional" />
              </div>
              <div>
                <label htmlFor="artist" className="label">
                  Artist
                </label>
                <input id="artist" className="field" value={settings.artist} maxLength={140} onChange={(e) => setSettings({ ...settings, artist: e.target.value })} placeholder="Optional" />
              </div>
            </div>
            <SettingsForm value={settings} onChange={setSettings} />
          </div>

          <label className="mt-5 flex cursor-pointer items-start gap-2.5 text-sm text-house/85">
            <input type="checkbox" className="mt-0.5 h-4 w-4" checked={rights} onChange={(e) => setRights(e.target.checked)} />
            I wrote these lyrics or have permission to use them (for example, through a church copyright licence).
          </label>

          {error && (
            <p role="alert" className="mt-4 rounded-lg border border-cue/40 bg-cue/10 px-3 py-2 text-sm text-[#ffb3aa]">
              {error}
            </p>
          )}

          <button onClick={generate} disabled={submitting || extracting} className="btn-primary mt-5 w-full py-3 text-base">
            {submitting ? <Loader2 size={18} className="spin" /> : <Wand2 size={18} />}
            {submitting ? "Starting…" : "Generate PowerPoint"}
          </button>
        </section>
      </div>
    </div>
  );
}

export default function CreatePage() {
  return (
    <Suspense>
      <CreateInner />
    </Suspense>
  );
}
