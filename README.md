# AI Lyrics-to-PowerPoint Generator

Paste or upload song lyrics, and the app reads what the song means, gives every slide a background that matches its lyrics, lays out the words for projection, and exports a real, editable `.pptx`.

Built with Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS and PptxGenJS. Every external service it uses has a free tier, and it still works with **no API keys at all**.

## Quick start

Requires Node.js 18.18 or newer.

```bash
npm install
cp .env.example .env.local     # optional: add free API keys (see below)
npm run dev                    # http://localhost:3000
```

Production:

```bash
npm run build
npm start                      # or: PORT=8080 npm start
```

Run the pipeline from the command line (no browser needed) to check everything works:

```bash
npm run smoke                  # writes smoke-16x9.pptx
```

## Database (XAMPP or Laragon)

Projects and slides can be stored in MySQL/MariaDB, the same database server XAMPP and Laragon use for PHP sites. The Node app does not go inside `htdocs`/`www`; it runs on its own and connects to MySQL.

1. Open XAMPP Control Panel (or Laragon) and **start MySQL**. Apache isn't needed.
2. In `.env.local` set:
   ```
   DB_DRIVER=mysql
   DB_HOST=127.0.0.1
   DB_PORT=3306
   DB_USER=root
   DB_PASSWORD=
   DB_NAME=lyrics2ppt
   ```
   XAMPP and Laragon both use `root` with an empty password by default.
3. Run `npm run dev`. On first start the app creates the `lyrics2ppt` database and its tables, and imports any projects you made earlier while using JSON files.
4. Open phpMyAdmin (http://localhost/phpmyadmin) or HeidiSQL to see the `projects`, `slides` and `assets` tables.

`database/schema.sql` contains the same schema if you prefer to import it yourself. Background image files stay in `data/assets/<projectId>/`; the `assets` table records them and `slides.background_file` points to them.

If MySQL isn't running, the app shows "Can't connect to MySQL at 127.0.0.1:3306…" instead of failing silently. Set `DB_DRIVER=file` to go back to JSON files.

| Table | Contents |
|---|---|
| `projects` | Title, artist, original lyrics, style, slide size, status, settings, AI analysis, timestamps |
| `slides` | One row per slide in order: section, lyrics, mood, scene description, background source/file, text style |
| `assets` | Background image files per project (name, type, size) |

## Free services

| What | Service | Key needed? | Where to get it |
|---|---|---|---|
| Lyric analysis | Google Gemini | Free key | aistudio.google.com/apikey |
| Lyric analysis (alternative) | Groq (Llama 3.3 70B) | Free key | console.groq.com/keys |
| AI backgrounds | Pollinations.ai | **No key** (optional free token for speed) | auth.pollinations.ai |
| Stock photos | Pexels | Free key | pexels.com/api |

Put keys in `.env.local` and restart. The **Settings** page shows which services are active. Keys are only read on the server and never sent to the browser.

How the fallbacks work, so nothing pretends to be connected when it isn't:

- **Analysis:** Gemini → Groq → offline keyword analysis. If the AI call fails, the app says so in the editor (Song tab) and uses the offline analyser.
- **Backgrounds:** AI image (Pollinations) → stock photo (Pexels) → offline art drawn by the app. Each slide shows which source was used; stock photos credit the photographer in the slide notes.
- The anonymous Pollinations tier allows about one image every 16 seconds, so a 12-slide song takes roughly 3 minutes. The editor shows real progress and you can edit while it works. A free Pollinations token speeds this up.
- If a provider fails twice in a row it is paused for 5 minutes so the rest of the slides don't each wait for a timeout.

Privacy note: Google's free Gemini tier may use requests to improve its products. Use Groq or offline mode for private lyrics.

## Features

- Upload `.txt`, `.docx`, text-based `.pdf` (and `.lrc`), or paste lyrics. Drag and drop, replace, remove; the extracted text is shown for review before anything is generated. Scanned/empty/corrupted files get a clear error.
- Lyrics are never rewritten. The AI only returns interpretation, scene descriptions and line ranges; ranges are validated so every line appears exactly once, in order, or the app falls back to its own structural division.
- Section detection (`[Chorus]`, `Verse 2:`, `Koro`, …); unlabelled repeated stanzas are treated as the chorus. Repeated choruses share a background so the repetition reads as intentional.
- Per-slide mood, scene prompt, stock search words, text position and highlighted words; emotional arc and visual direction shown in the editor.
- 7 style presets plus Automatic, 16:9 or 4:3, lyrics density (auto/few/balanced/more), alignment, background source, transition, title/ending slides, slide numbers.
- Editor: thumbnails with drag-and-drop reorder, live preview, edit lyrics, split/merge slides, add/duplicate/delete, font/size/colour/alignment/vertical position/shadow/bold/highlight colour, overlay darkness, apply style to all, regenerate one background (AI or stock), offline art, upload your own image, undo/redo (Ctrl+Z / Ctrl+Shift+Z), autosave, full-screen slideshow.
- Regenerate all backgrounds (keeps lyrics and formatting), retry only failed ones, or rebuild everything from edited lyrics.
- Projects: list, search, rename, duplicate, export, delete; delete-all in Settings.
- Export: genuine `.pptx` via PptxGenJS. Backgrounds are cropped to cover the slide, lyrics are separate editable text boxes over a tint overlay, fade/push transitions are written into the slide XML, notes record the section and image source. The file is re-opened and validated before download.

## How it works

```
Create page ──POST /api/projects──▶ pipeline (runs in the Node server)
                                     1. parse lyrics (sections, stanzas)
                                     2. analyse  (Gemini / Groq / offline)
                                     3. plan slides (validated ranges, chorus reuse)
                                     4. backgrounds (Pollinations → Pexels → offline art)
Editor ◀──polls GET /api/projects/:id── status + progress saved after every step
Editor ──PATCH──▶ save edits (server keeps ownership of backgrounds)
Editor ──GET /api/projects/:id/export──▶ .pptx
```

| Endpoint | Purpose |
|---|---|
| `POST /api/extract` | Extract text from an uploaded file (in memory, not stored) |
| `GET/POST/DELETE /api/projects` | List, create (starts generation), delete all (`?all=1`) |
| `GET/PATCH/DELETE /api/projects/:id` | Load, save edits, delete |
| `POST /api/projects/:id/generate` | `full` rebuild, `resume` missing backgrounds, `backgrounds` regenerate all |
| `POST /api/projects/:id/slides/:slideId/background` | Regenerate (AI/stock), offline art, remove, or upload an image |
| `POST /api/projects/:id/duplicate` | Copy a project and its images |
| `GET /api/projects/:id/export` | Build, validate and download the `.pptx` |
| `GET /api/assets/:id/:file` | Serve a background image |
| `GET /api/status` | Which services are configured (never the keys) |

Key files:

- `src/lib/pipeline.ts` – generation stages, resume, per-slide regeneration
- `src/lib/ai/llm.ts` – Gemini and Groq calls, prompt, response validation
- `src/lib/moods.ts` – style presets, mood lexicon, offline analyser, prompt builder
- `src/lib/images/` – Pollinations, Pexels and the offline background renderer
- `src/lib/lyrics.ts` – parsing and slide division
- `src/lib/layout.ts` – text sizing shared by the preview and the exporter
- `src/lib/pptx.ts` – PowerPoint export
- `src/lib/storage.ts`, `src/lib/db/mysql.ts`, `database/schema.sql` – storage (MySQL or JSON files)
- `src/app/editor/[id]/page.tsx` – slide editor

## Storage and deployment

Projects are stored in MySQL (`DB_DRIVER=mysql`) or as JSON files in `data/projects/` (`DB_DRIVER=file`, the default when unset). Images are files in `data/assets/<projectId>/` (change with `DATA_DIR`). Writes are transactional (MySQL) or atomic (files) and serialised per project.

Because generation runs as a background task inside the Node process and projects are saved to disk, deploy it to a host that runs a **persistent Node server with a persistent disk**: a VPS, Railway or Render with a disk attached, Fly.io with a volume, or Docker:

```bash
docker build -t lyrics2ppt .
docker run -p 3000:3000 -v lyrics-data:/data --env-file .env.local lyrics2ppt
```

Serverless hosts such as Vercel or Netlify are not a good fit as-is (read-only filesystem, no long-running background work). PHP-only shared hosting can't run it.

**Before putting it online, set `APP_PASSWORD`** – the whole app (pages and API) then requires HTTP Basic auth. Without it, anyone who can reach the server can see your projects. For multiple users with separate accounts, add an auth provider and a `userId` on each project; storage is isolated in `src/lib/storage.ts` and `src/lib/db/mysql.ts`.

## Optional audio sync (extension point)

The main workflow needs only lyrics. Each slide already has an optional `timing: { start, end }` field reserved for audio synchronisation; a future `/api/projects/:id/audio` route could estimate line timings from an uploaded track the user has rights to, and the exporter could write them as automatic slide advance timings.

## Responsible use

Only upload lyrics you wrote or have permission to use (for churches, typically through a copyright licence). The app never fetches lyrics from the internet and never generates lyrics from a song title. Backgrounds are AI-generated or Pexels-licensed photos, and the source of every image is recorded.

## Limits

- Lyrics up to 20,000 characters; uploads up to 5 MB; background images up to 8 MB (JPG/PNG).
- PDF extraction needs real text (scanned PDFs need OCR first); PDFs often lose blank lines between verses, so check the extracted text.
- Fonts are Windows/Office fonts (Georgia, Segoe UI, Calibri…). On Mac/Linux previews and LibreOffice substitute similar fonts.
