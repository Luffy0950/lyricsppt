"use client";
import { Copy, Download, Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import ProjectCover from "@/components/ProjectCover";
import { api, downloadExport, jsonInit } from "@/lib/client";
import { ProjectSummary } from "@/lib/types";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<{ projects: ProjectSummary[] }>("/api/projects");
      setProjects(r.projects);
    } catch (e) {
      setMessage({ kind: "err", text: (e as Error).message });
      setProjects([]);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const shown = useMemo(
    () => (projects ?? []).filter((p) => `${p.title} ${p.artist}`.toLowerCase().includes(query.trim().toLowerCase())),
    [projects, query],
  );

  async function act(id: string, fn: () => Promise<void>) {
    setBusy(id);
    setMessage(null);
    try {
      await fn();
    } catch (e) {
      setMessage({ kind: "err", text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  const duplicate = (p: ProjectSummary) =>
    act(p.id, async () => {
      await api(`/api/projects/${p.id}/duplicate`, { method: "POST" });
      await load();
      setMessage({ kind: "ok", text: `Duplicated "${p.title}".` });
    });

  const remove = (p: ProjectSummary) => {
    if (!window.confirm(`Delete "${p.title}" and its backgrounds? This can't be undone.`)) return;
    void act(p.id, async () => {
      await api(`/api/projects/${p.id}`, { method: "DELETE" });
      setProjects((list) => (list ?? []).filter((x) => x.id !== p.id));
      setMessage({ kind: "ok", text: `Deleted "${p.title}".` });
    });
  };

  const exportOne = (p: ProjectSummary) =>
    act(p.id, async () => {
      const r = await downloadExport(p.id);
      setMessage({ kind: "ok", text: `Downloaded ${r.name}.` });
    });

  const saveRename = () => {
    if (!renaming) return;
    const { id, title } = renaming;
    setRenaming(null);
    void act(id, async () => {
      await api(`/api/projects/${id}`, jsonInit("PATCH", { title }));
      await load();
    });
  };

  return (
    <div className="mx-auto max-w-6xl px-5 pb-20 pt-8 md:px-10 md:pt-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight md:text-4xl">My projects</h1>
          <p className="mt-2 text-house/70">Saved on this server. Open one to keep editing.</p>
        </div>
        <Link href="/create" className="btn-primary">
          <Plus size={16} /> Create new presentation
        </Link>
      </div>

      <div className="relative mt-8 max-w-sm">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-haze" />
        <input className="field pl-9" placeholder="Search by title or artist" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search projects" />
      </div>

      {message && (
        <p role="status" className={`mt-4 text-sm ${message.kind === "ok" ? "text-go" : "text-cue"}`}>
          {message.text}
        </p>
      )}

      {projects === null ? (
        <div className="mt-10 flex justify-center text-haze">
          <Loader2 className="spin" />
        </div>
      ) : shown.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-rail p-10 text-center text-house/80">
          {projects.length === 0 ? "No projects yet. Create one and it will be saved here." : "No projects match that search."}
        </div>
      ) : (
        <div className="mt-8 grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((p) => (
            <ProjectCover key={p.id} p={p}>
              {renaming?.id === p.id ? (
                <form
                  className="mt-2 flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    saveRename();
                  }}
                >
                  <input autoFocus className="field py-1.5" value={renaming.title} maxLength={140} onChange={(e) => setRenaming({ id: p.id, title: e.target.value })} aria-label="New title" />
                  <button className="btn-primary py-1.5" type="submit">
                    Save
                  </button>
                  <button className="btn-quiet" type="button" onClick={() => setRenaming(null)}>
                    Cancel
                  </button>
                </form>
              ) : (
                <div className="mt-1.5 flex flex-wrap gap-0.5">
                  <button className="btn-quiet text-xs" onClick={() => setRenaming({ id: p.id, title: p.title })} disabled={busy === p.id}>
                    <Pencil size={13} /> Rename
                  </button>
                  <button className="btn-quiet text-xs" onClick={() => duplicate(p)} disabled={busy === p.id}>
                    <Copy size={13} /> Duplicate
                  </button>
                  <button className="btn-quiet text-xs" onClick={() => exportOne(p)} disabled={busy === p.id || p.slideCount === 0}>
                    <Download size={13} /> Export
                  </button>
                  <button className="btn-quiet text-xs text-cue hover:text-cue" onClick={() => remove(p)} disabled={busy === p.id}>
                    <Trash2 size={13} /> Delete
                  </button>
                  {busy === p.id && <Loader2 size={14} className="spin ml-1 self-center text-haze" />}
                </div>
              )}
            </ProjectCover>
          ))}
        </div>
      )}
    </div>
  );
}
