// MySQL / MariaDB project store (XAMPP, Laragon or any MySQL server).
// Creates the database and tables on first use, and imports any projects
// previously saved as JSON files so nothing is lost when switching.
import { promises as fs } from "fs";
import path from "path";
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import { config } from "../config";
import { Project, Slide } from "../types";

export class StorageError extends Error {}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS projects (
    id VARCHAR(40) NOT NULL, title VARCHAR(160) NOT NULL, artist VARCHAR(160) NOT NULL DEFAULT '',
    lyrics MEDIUMTEXT NOT NULL, style VARCHAR(20) NOT NULL, slide_size VARCHAR(5) NOT NULL, status VARCHAR(20) NOT NULL,
    settings_json LONGTEXT NOT NULL, analysis_json LONGTEXT NULL, status_json LONGTEXT NOT NULL,
    warnings_json LONGTEXT NOT NULL, last_export_json LONGTEXT NULL,
    created_at DATETIME(3) NOT NULL, updated_at DATETIME(3) NOT NULL,
    PRIMARY KEY (id), KEY idx_projects_updated (updated_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS slides (
    project_id VARCHAR(40) NOT NULL, id VARCHAR(40) NOT NULL, position INT NOT NULL, kind VARCHAR(10) NOT NULL,
    section VARCHAR(80) NOT NULL DEFAULT '', lyrics TEXT NOT NULL, mood VARCHAR(20) NOT NULL, visual_prompt TEXT NOT NULL,
    stock_query VARCHAR(160) NOT NULL DEFAULT '', background_status VARCHAR(12) NOT NULL, background_source VARCHAR(20) NULL,
    background_file VARCHAR(120) NULL, background_json LONGTEXT NOT NULL, text_json LONGTEXT NOT NULL,
    overlay_json LONGTEXT NOT NULL, accent CHAR(7) NOT NULL, timing_json LONGTEXT NULL,
    PRIMARY KEY (project_id, id), KEY idx_slides_order (project_id, position),
    CONSTRAINT fk_slides_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS assets (
    project_id VARCHAR(40) NOT NULL, file_name VARCHAR(120) NOT NULL, mime VARCHAR(40) NOT NULL, bytes INT NOT NULL,
    data LONGBLOB NULL, created_at DATETIME(3) NOT NULL, PRIMARY KEY (project_id, file_name),
    CONSTRAINT fk_assets_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

/** Turns driver errors into messages a person can act on. */
function friendly(e: unknown): Error {
  const err = e as { code?: string; message?: string };
  const { host, port, user, name } = config.db;
  switch (err.code) {
    case "ECONNREFUSED":
    case "ETIMEDOUT":
    case "ENOTFOUND":
      return new StorageError(
        `Can't connect to MySQL at ${host}:${port}. Start MySQL in XAMPP or Laragon, or check DB_HOST and DB_PORT in .env.local.`,
      );
    case "ER_ACCESS_DENIED_ERROR":
      return new StorageError(`MySQL rejected user "${user}". Check DB_USER and DB_PASSWORD in .env.local.`);
    case "ER_DBACCESS_DENIED_ERROR":
      return new StorageError(`User "${user}" can't create or open the database "${name}". Create it in phpMyAdmin, or use a user with more rights.`);
    case "ER_BAD_DB_ERROR":
      return new StorageError(`The database "${name}" doesn't exist and couldn't be created.`);
    default:
      return e instanceof Error ? e : new StorageError(String(err.message ?? e));
  }
}

const g = globalThis as unknown as { __l2pPool?: Promise<Pool> };

async function init(): Promise<Pool> {
  const mysql = await import("mysql2/promise");
  const { host, port, user, password, name } = config.db;
  if (!/^[A-Za-z0-9_]{1,64}$/.test(name)) throw new StorageError("DB_NAME may only contain letters, numbers and underscores.");
  try {
    // hosted MySQL (e.g. TiDB Cloud) requires an encrypted connection
    const ssl = config.db.ssl ? { minVersion: "TLSv1.2", rejectUnauthorized: true } : undefined;
    const conn = await mysql.createConnection({ host, port, user, password, ssl, connectTimeout: 8000 });
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await conn.end();
    const pool = mysql.createPool({
      host,
      port,
      user,
      password,
      ssl,
      database: name,
      connectionLimit: 8,
      timezone: "Z",
      charset: "utf8mb4",
      connectTimeout: 8000,
    });
    for (const sql of SCHEMA) await pool.query(sql);
    // databases created before images were stored in MySQL lack the data column
    const [cols] = await pool.query<RowDataPacket[]>(
      "SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'assets' AND COLUMN_NAME = 'data'",
      [name],
    );
    if (!cols.length) await pool.query("ALTER TABLE assets ADD COLUMN data LONGBLOB NULL AFTER bytes");
    await importJsonProjects(pool);
    return pool;
  } catch (e) {
    throw friendly(e);
  }
}

async function pool(): Promise<Pool> {
  if (!g.__l2pPool) {
    g.__l2pPool = init();
    // allow a retry on the next request if MySQL wasn't running yet
    g.__l2pPool.catch(() => (g.__l2pPool = undefined));
  }
  return g.__l2pPool;
}

async function run<T>(fn: (p: Pool) => Promise<T>): Promise<T> {
  const p = await pool();
  try {
    return await fn(p);
  } catch (e) {
    throw friendly(e);
  }
}

const toDate = (iso: string) => new Date(iso);
const iso = (d: Date | string) => (d instanceof Date ? d.toISOString() : new Date(d).toISOString());
const parse = <T>(s: string | null | undefined, fallback: T): T => {
  if (s === null || s === undefined || s === "") return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};

interface ProjectRow extends RowDataPacket {
  id: string;
  title: string;
  artist: string;
  lyrics: string;
  settings_json: string;
  analysis_json: string | null;
  status_json: string;
  warnings_json: string;
  last_export_json: string | null;
  created_at: Date;
  updated_at: Date;
}
interface SlideRow extends RowDataPacket {
  project_id: string;
  id: string;
  position: number;
  kind: Slide["kind"];
  section: string;
  lyrics: string;
  mood: Slide["mood"];
  visual_prompt: string;
  stock_query: string;
  background_json: string;
  text_json: string;
  overlay_json: string;
  accent: string;
  timing_json: string | null;
}

function rowToSlide(r: SlideRow): Slide {
  const s: Slide = {
    id: r.id,
    kind: r.kind,
    section: r.section,
    lines: r.lyrics.split("\n"),
    mood: r.mood,
    visualPrompt: r.visual_prompt,
    stockQuery: r.stock_query,
    overlay: parse(r.overlay_json, { color: "#000000", opacity: 0.35 }),
    text: parse(r.text_json, {} as Slide["text"]),
    accent: r.accent,
    background: parse(r.background_json, { status: "pending" } as Slide["background"]),
  };
  const timing = parse<Slide["timing"] | null>(r.timing_json, null);
  if (timing) s.timing = timing;
  return s;
}

function rowToProject(r: ProjectRow, slides: Slide[]): Project {
  const p: Project = {
    id: r.id,
    title: r.title,
    artist: r.artist,
    lyrics: r.lyrics,
    settings: parse(r.settings_json, {} as Project["settings"]),
    slides,
    status: parse(r.status_json, { state: "ready", stage: "done", message: "", progress: { done: 0, total: 0 } } as Project["status"]),
    warnings: parse(r.warnings_json, [] as string[]),
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
  const analysis = parse<Project["analysis"] | null>(r.analysis_json, null);
  if (analysis) p.analysis = analysis;
  const last = parse<Project["lastExport"] | null>(r.last_export_json, null);
  if (last) p.lastExport = last;
  return p;
}

async function writeProject(c: PoolConnection | Pool, p: Project) {
  await c.query(
    `INSERT INTO projects (id, title, artist, lyrics, style, slide_size, status, settings_json, analysis_json, status_json,
       warnings_json, last_export_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE title=VALUES(title), artist=VALUES(artist), lyrics=VALUES(lyrics), style=VALUES(style),
       slide_size=VALUES(slide_size), status=VALUES(status), settings_json=VALUES(settings_json),
       analysis_json=VALUES(analysis_json), status_json=VALUES(status_json), warnings_json=VALUES(warnings_json),
       last_export_json=VALUES(last_export_json), updated_at=VALUES(updated_at)`,
    [
      p.id,
      p.title.slice(0, 160),
      p.artist.slice(0, 160),
      p.lyrics,
      p.settings.style,
      p.settings.size,
      p.status.state,
      JSON.stringify(p.settings),
      p.analysis ? JSON.stringify(p.analysis) : null,
      JSON.stringify(p.status),
      JSON.stringify(p.warnings),
      p.lastExport ? JSON.stringify(p.lastExport) : null,
      toDate(p.createdAt),
      toDate(p.updatedAt),
    ],
  );
  await c.query("DELETE FROM slides WHERE project_id = ?", [p.id]);
  if (p.slides.length) {
    const rows = p.slides.map((s, i) => [
      p.id,
      s.id,
      i,
      s.kind,
      s.section.slice(0, 80),
      s.lines.join("\n"),
      s.mood,
      s.visualPrompt,
      s.stockQuery.slice(0, 160),
      s.background.status,
      s.background.source ?? null,
      s.background.file ?? null,
      JSON.stringify(s.background),
      JSON.stringify(s.text),
      JSON.stringify(s.overlay),
      s.accent,
      s.timing ? JSON.stringify(s.timing) : null,
    ]);
    await c.query(
      `INSERT INTO slides (project_id, id, position, kind, section, lyrics, mood, visual_prompt, stock_query,
         background_status, background_source, background_file, background_json, text_json, overlay_json, accent, timing_json)
       VALUES ?`,
      [rows],
    );
  }
}

export const mysqlStore = {
  async get(id: string): Promise<Project | null> {
    return run(async (db) => {
      const [rows] = await db.query<ProjectRow[]>("SELECT * FROM projects WHERE id = ?", [id]);
      if (!rows.length) return null;
      const [slides] = await db.query<SlideRow[]>("SELECT * FROM slides WHERE project_id = ? ORDER BY position", [id]);
      return rowToProject(rows[0], slides.map(rowToSlide));
    });
  },

  async put(p: Project): Promise<void> {
    await run(async (db) => {
      const conn = await db.getConnection();
      try {
        await conn.beginTransaction();
        await writeProject(conn, p);
        await conn.commit();
      } catch (e) {
        await conn.rollback().catch(() => undefined);
        throw e;
      } finally {
        conn.release();
      }
    });
  },

  async list(): Promise<Project[]> {
    return run(async (db) => {
      const [rows] = await db.query<ProjectRow[]>("SELECT * FROM projects ORDER BY updated_at DESC");
      if (!rows.length) return [];
      const [slides] = await db.query<SlideRow[]>("SELECT * FROM slides ORDER BY project_id, position");
      const byProject = new Map<string, Slide[]>();
      for (const s of slides) {
        const list = byProject.get(s.project_id) ?? [];
        list.push(rowToSlide(s));
        byProject.set(s.project_id, list);
      }
      return rows.map((r) => rowToProject(r, byProject.get(r.id) ?? []));
    });
  },

  async delete(id: string): Promise<boolean> {
    return run(async (db) => {
      const [res] = await db.query("DELETE FROM projects WHERE id = ?", [id]);
      return (res as { affectedRows: number }).affectedRows > 0;
    });
  },

  /**
   * Records an image and keeps its bytes, so images survive hosts whose disk is
   * wiped on restart. Ignored if the project row doesn't exist (yet).
   */
  async recordAsset(projectId: string, file: string, data: Buffer) {
    await run(async (db) => {
      await db
        .query(
          `INSERT INTO assets (project_id, file_name, mime, bytes, data, created_at) VALUES (?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE bytes = VALUES(bytes), data = VALUES(data)`,
          [projectId, file, file.endsWith(".png") ? "image/png" : "image/jpeg", data.length, data, new Date()],
        )
        .catch((e: { code?: string }) => {
          if (e.code !== "ER_NO_REFERENCED_ROW_2" && e.code !== "ER_NO_REFERENCED_ROW") throw e;
        });
    });
  },

  async readAsset(projectId: string, file: string): Promise<Buffer | null> {
    return run(async (db) => {
      const [rows] = await db.query<RowDataPacket[]>("SELECT data FROM assets WHERE project_id = ? AND file_name = ?", [projectId, file]);
      return (rows[0]?.data as Buffer | null) ?? null;
    });
  },

  async hasAsset(projectId: string, file: string): Promise<boolean> {
    return run(async (db) => {
      const [rows] = await db.query<RowDataPacket[]>(
        "SELECT 1 FROM assets WHERE project_id = ? AND file_name = ? AND data IS NOT NULL",
        [projectId, file],
      );
      return rows.length > 0;
    });
  },

  async copyAssets(fromId: string, toId: string) {
    await run(async (db) => {
      await db.query(
        `INSERT IGNORE INTO assets (project_id, file_name, mime, bytes, data, created_at)
         SELECT ?, file_name, mime, bytes, data, created_at FROM assets WHERE project_id = ?`,
        [toId, fromId],
      );
    });
  },
};

/** One-time import of projects saved as JSON before MySQL was turned on. */
async function importJsonProjects(db: Pool) {
  const dir = path.join(config.dataDir, "projects");
  const files = (await fs.readdir(dir).catch(() => [] as string[])).filter((f) => f.endsWith(".json"));
  if (!files.length) return;
  const [rows] = await db.query<RowDataPacket[]>("SELECT id FROM projects");
  const existing = new Set(rows.map((r) => r.id as string));
  let imported = 0;
  for (const f of files) {
    try {
      const p = JSON.parse(await fs.readFile(path.join(dir, f), "utf8")) as Project;
      if (existing.has(p.id)) continue;
      const conn = await db.getConnection();
      try {
        await conn.beginTransaction();
        await writeProject(conn, p);
        await conn.commit();
        imported++;
      } catch (e) {
        await conn.rollback().catch(() => undefined);
        throw e;
      } finally {
        conn.release();
      }
      const assetDir = path.join(config.dataDir, "assets", p.id);
      for (const a of await fs.readdir(assetDir).catch(() => [] as string[])) {
        const st = await fs.stat(path.join(assetDir, a)).catch(() => null);
        if (st?.isFile())
          await db.query(
            "INSERT IGNORE INTO assets (project_id, file_name, mime, bytes, data, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            [p.id, a, a.endsWith(".png") ? "image/png" : "image/jpeg", st.size, await fs.readFile(path.join(assetDir, a)), st.mtime],
          );
      }
    } catch (e) {
      console.error(`Could not import ${f} into MySQL:`, (e as Error).message);
    }
  }
  if (imported) console.log(`Imported ${imported} project(s) from JSON files into MySQL.`);
}
