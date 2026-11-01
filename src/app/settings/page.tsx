"use client";
import { CheckCircle2, CircleDashed, Loader2, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import SettingsForm from "@/components/SettingsForm";
import { api, loadDefaults, saveDefaults } from "@/lib/client";
import { DEFAULT_SETTINGS, GenerationSettings } from "@/lib/types";

type Status = {
  llm: string;
  llmLabel: string;
  gemini: boolean;
  groq: boolean;
  pollinations: boolean;
  pollinationsAuthed: boolean;
  pexels: boolean;
  openverse: boolean;
  stock: boolean;
  passwordProtected: boolean;
  storage: "mysql" | "file";
  storageLabel: string;
};

function Service({ ok, name, detail, hint }: { ok: boolean; name: string; detail: string; hint?: React.ReactNode }) {
  return (
    <li className="flex gap-3 border-b border-rail/60 py-3.5 last:border-0">
      {ok ? <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-go" /> : <CircleDashed size={18} className="mt-0.5 shrink-0 text-haze" />}
      <div className="min-w-0">
        <p className="font-medium">{name}</p>
        <p className="text-sm text-house/70">{detail}</p>
        {!ok && hint && <p className="mt-1 text-xs leading-relaxed text-haze">{hint}</p>}
      </div>
    </li>
  );
}

export default function SettingsPage() {
  const [defaults, setDefaults] = useState<GenerationSettings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setDefaults(loadDefaults());
    api<Status>("/api/status").then(setStatus).catch(() => undefined);
  }, []);

  const change = (v: GenerationSettings) => {
    setDefaults(v);
    saveDefaults(v);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  async function deleteAll() {
    if (!window.confirm("Delete every saved project and background image on this server? This can't be undone.")) return;
    setDeleting(true);
    try {
      const r = await api<{ deleted: number }>("/api/projects?all=1", { method: "DELETE" });
      setMsg(`Deleted ${r.deleted} project${r.deleted === 1 ? "" : "s"}.`);
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setDeleting(false);
    }
  }

  const code = (s: string) => <code className="rounded bg-stage px-1 py-0.5 text-[11px] text-house">{s}</code>;

  return (
    <div className="mx-auto max-w-4xl px-5 pb-20 pt-8 md:px-10 md:pt-12">
      <h1 className="font-display text-3xl font-extrabold tracking-tight md:text-4xl">Settings</h1>

      <section className="mt-10">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-xl font-bold">Defaults for new presentations</h2>
          <span className="text-sm text-go" aria-live="polite">
            {saved ? "Saved" : ""}
          </span>
        </div>
        <p className="mb-4 mt-1 text-sm text-house/70">Stored in this browser and applied when you open Create.</p>
        <div className="panel p-5">
          <SettingsForm value={defaults} onChange={change} />
        </div>
      </section>

      <section className="mt-12">
        <h2 className="font-display text-xl font-bold">Services</h2>
        <p className="mb-2 mt-1 text-sm text-house/70">
          All of these have free tiers. Keys go in the server&apos;s {code(".env.local")} file and are never sent to the browser. Restart the app after
          changing them.
        </p>
        {status ? (
          <ul className="panel px-5">
            <Service
              ok={status.llm !== "offline"}
              name="Lyric analysis"
              detail={status.llm !== "offline" ? `Using ${status.llmLabel}.` : "Using the built-in offline keyword analysis."}
              hint={
                <>
                  For real AI interpretation, add a free {code("GEMINI_API_KEY")} from Google AI Studio (aistudio.google.com) or a free{" "}
                  {code("GROQ_API_KEY")} from console.groq.com.
                </>
              }
            />
            <Service
              ok={status.pollinations}
              name="AI backgrounds (Pollinations)"
              detail={
                status.pollinations
                  ? status.pollinationsAuthed
                    ? "On, with your Pollinations token (faster)."
                    : "On, anonymous free tier: one image every 45 seconds, with a Pollinations logo."
                  : "Turned off."
              }
              hint={<>Remove {code("POLLINATIONS_ENABLED=false")} to turn it back on.</>}
            />
            <Service
              ok={status.stock}
              name={status.pexels ? "Stock photos (Pexels)" : "Stock photos (Openverse)"}
              detail={
                status.pexels
                  ? "On. Photographers are credited in the slide notes."
                  : status.openverse
                    ? "On. Free Creative Commons photos, no key needed. Photographers are credited in the slide notes."
                    : "Turned off."
              }
              hint={<>Optional: a free {code("PEXELS_API_KEY")} from pexels.com/api switches to Pexels photos.</>}
            />
            <Service
              ok={status.storage === "mysql"}
              name="Database"
              detail={`Saving to ${status.storageLabel}.`}
              hint={
                <>
                  To use XAMPP or Laragon, start MySQL there and add {code("DB_DRIVER=mysql")} to .env.local. The database and tables are
                  created automatically.
                </>
              }
            />
            <Service
              ok={status.passwordProtected}
              name="Password protection"
              detail={status.passwordProtected ? "The app asks for a password." : "Off. Anyone who can reach this server can open your projects."}
              hint={<>Set {code("APP_PASSWORD")} before putting the app online.</>}
            />
          </ul>
        ) : (
          <Loader2 className="spin text-haze" />
        )}
        <p className="mt-3 text-xs leading-relaxed text-haze">
          If a service fails, the app falls back to the next one and finally to offline art, and tells you on the slide which source was
          used.
        </p>
      </section>

      <section className="mt-12">
        <h2 className="font-display text-xl font-bold">Privacy</h2>
        <p className="mt-1 text-sm text-house/70">
          Uploaded lyric files are read in memory and not kept. Projects (lyrics, slides and backgrounds) are saved on this server until you
          delete them: in the database you chose above, with images in the data/assets folder.
        </p>
        <button className="btn-danger mt-4" onClick={deleteAll} disabled={deleting}>
          {deleting ? <Loader2 size={15} className="spin" /> : <Trash2 size={15} />} Delete all projects
        </button>
        {msg && <p className="mt-2 text-sm text-house/80">{msg}</p>}
      </section>
    </div>
  );
}
