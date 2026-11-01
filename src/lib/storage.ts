// Project storage. Two interchangeable back ends:
//   - MySQL / MariaDB (DB_DRIVER=mysql) — works with XAMPP and Laragon
//   - JSON files in DATA_DIR (default, no setup)
// Background images are files in data/assets/<projectId>/. The MySQL back end
// also keeps their bytes in the `assets` table and serves them from there when
// the file is gone (hosts like Render wipe the disk on every restart).
// All read-modify-write operations on one project go through a per-project lock
// so the background generator and editor saves never overwrite each other.
import { promises as fs } from "fs";
import path from "path";
import { config } from "./config";
import { mysqlStore, StorageError } from "./db/mysql";
import { Project, ProjectSummary } from "./types";

export { StorageError };

const ID_RE = /^[A-Za-z0-9_-]{6,40}$/;
const FILE_RE = /^[A-Za-z0-9_-]{1,80}\.(jpg|jpeg|png)$/;

export const isValidId = (id: string) => ID_RE.test(id);
export const isValidAssetName = (f: string) => FILE_RE.test(f);

export const assetsDir = (id: string) => path.join(config.dataDir, "assets", id);
const useMysql = () => config.dbDriver === "mysql";

// ---------- JSON file back end ----------
const projectsDir = () => path.join(config.dataDir, "projects");
function projectPath(id: string) {
  if (!isValidId(id)) throw new Error("Invalid project id");
  return path.join(projectsDir(), `${id}.json`);
}
async function writeAtomic(file: string, data: string) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, data, "utf8");
  await fs.rename(tmp, file);
}
const fileStore = {
  async get(id: string): Promise<Project | null> {
    try {
      return JSON.parse(await fs.readFile(projectPath(id), "utf8")) as Project;
    } catch (e: unknown) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  },
  async put(p: Project) {
    await writeAtomic(projectPath(p.id), JSON.stringify(p, null, 2));
  },
  async list(): Promise<Project[]> {
    await fs.mkdir(projectsDir(), { recursive: true });
    const files = (await fs.readdir(projectsDir())).filter((f) => f.endsWith(".json"));
    const out: Project[] = [];
    for (const f of files) {
      try {
        out.push(JSON.parse(await fs.readFile(path.join(projectsDir(), f), "utf8")) as Project);
      } catch {
        /* skip unreadable files */
      }
    }
    return out;
  },
  async delete(id: string) {
    let existed = true;
    await fs.unlink(projectPath(id)).catch(() => (existed = false));
    return existed;
  },
};

const store = () => (useMysql() ? mysqlStore : fileStore);

// ---------- locking ----------
const locks = new Map<string, Promise<unknown>>();
async function withLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(id) ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((r) => (release = r));
  const chain = prev.then(() => next);
  locks.set(id, chain);
  await prev.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
    if (locks.get(id) === chain) locks.delete(id);
  }
}

// ---------- public API ----------
export async function getProject(id: string): Promise<Project | null> {
  if (!isValidId(id)) return null;
  return store().get(id);
}

export async function saveProject(p: Project): Promise<Project> {
  return withLock(p.id, async () => {
    p.updatedAt = new Date().toISOString();
    await store().put(p);
    return p;
  });
}

/** Atomically load, modify and save a project. Returns null if it no longer exists. */
export async function updateProject(id: string, fn: (p: Project) => void | Promise<void>): Promise<Project | null> {
  return withLock(id, async () => {
    const p = await store().get(id);
    if (!p) return null;
    await fn(p);
    p.updatedAt = new Date().toISOString();
    await store().put(p);
    return p;
  });
}

export function assetUrl(projectId: string, file?: string) {
  return file ? `/api/assets/${projectId}/${file}` : undefined;
}

export function summarize(p: Project): ProjectSummary {
  const cover = p.slides.find((s) => s.background.status === "ready" && s.background.file);
  return {
    id: p.id,
    title: p.title,
    artist: p.artist,
    style: p.settings.style,
    resolvedStyle: p.analysis?.style,
    slideCount: p.slides.length,
    status: p.status,
    cover: assetUrl(p.id, cover?.background.file),
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const all = await store().list();
  return all.map(summarize).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function deleteProject(id: string): Promise<boolean> {
  if (!isValidId(id)) return false;
  return withLock(id, async () => {
    const existed = await store().delete(id);
    await fs.rm(assetsDir(id), { recursive: true, force: true });
    return existed;
  });
}

export async function writeAsset(projectId: string, file: string, data: Buffer) {
  if (!isValidId(projectId) || !isValidAssetName(file)) throw new Error("Invalid asset path");
  const dir = assetsDir(projectId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, file), data);
  if (useMysql()) await mysqlStore.recordAsset(projectId, file, data);
}

export async function readAsset(projectId: string, file: string): Promise<Buffer | null> {
  if (!isValidId(projectId) || !isValidAssetName(file)) return null;
  try {
    return await fs.readFile(path.join(assetsDir(projectId), file));
  } catch {
    if (!useMysql()) return null;
  }
  const data = await mysqlStore.readAsset(projectId, file);
  // put it back on disk so later reads skip the database
  if (data) await fs.mkdir(assetsDir(projectId), { recursive: true }).then(() => fs.writeFile(path.join(assetsDir(projectId), file), data)).catch(() => undefined);
  return data;
}

export async function assetExists(projectId: string, file: string) {
  if (!isValidId(projectId) || !isValidAssetName(file)) return false;
  const onDisk = await fs
    .access(path.join(assetsDir(projectId), file))
    .then(() => true)
    .catch(() => false);
  return onDisk || (useMysql() && (await mysqlStore.hasAsset(projectId, file)));
}

/** Copies a project's images to another project (the target project must already be saved). */
export async function copyAssets(fromId: string, toId: string) {
  const src = assetsDir(fromId);
  const dst = assetsDir(toId);
  await fs.mkdir(dst, { recursive: true });
  const files = await fs.readdir(src).catch(() => [] as string[]);
  for (const f of files) {
    if (!isValidAssetName(f)) continue;
    await fs.copyFile(path.join(src, f), path.join(dst, f));
  }
  // the database copy also covers images whose files were wiped
  if (useMysql()) await mysqlStore.copyAssets(fromId, toId);
}
