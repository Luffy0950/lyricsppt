// Background providers with graceful fallback:
//   AI (Pollinations, free) → stock (Pexels, free key) → offline procedural scene.
import { config } from "../config";
import { writeAsset } from "../storage";
import { BackgroundMode, Slide, SlideBackground, SlideSize } from "../types";
import { renderProceduralBackground } from "./procedural";

class ProviderError extends Error {}

// Circuit breaker: after repeated failures a provider is skipped for a while, so
// one outage doesn't make every remaining slide wait for its own timeout.
const breaker = new Map<string, { fails: number; until: number }>();
function providerOpen(name: string) {
  const b = breaker.get(name);
  return !b || Date.now() > b.until;
}
function recordResult(name: string, ok: boolean) {
  if (ok) return breaker.delete(name);
  const b = breaker.get(name) ?? { fails: 0, until: 0 };
  b.fails += 1;
  if (b.fails >= 2) b.until = Date.now() + 5 * 60 * 1000;
  breaker.set(name, b);
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 90000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new ProviderError("timed out");
    throw new ProviderError((e as Error).message || "network error");
  } finally {
    clearTimeout(timer);
  }
}

function imageKind(buf: Buffer): "jpg" | "png" | null {
  if (buf.length < 4000) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8) return "jpg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png";
  return null;
}

// ---------- Pollinations (free AI image generation) ----------
// Anonymous use is rate limited, so requests are serialised with a minimum gap.
let pollinationsChain: Promise<unknown> = Promise.resolve();
let lastPollinations = 0;

function queuePollinations<T>(fn: () => Promise<T>): Promise<T> {
  const run = pollinationsChain.then(async () => {
    const wait = lastPollinations + config.pollinationsIntervalMs - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    try {
      return await fn();
    } finally {
      lastPollinations = Date.now();
    }
  });
  pollinationsChain = run.catch(() => undefined);
  return run;
}

async function pollinations(prompt: string, size: SlideSize, seed: number): Promise<{ buf: Buffer; ext: "jpg" | "png" }> {
  const w = size === "4:3" ? 1024 : 1344;
  const h = 768;
  const p = prompt.slice(0, 700);
  const params = new URLSearchParams({
    width: String(w),
    height: String(h),
    seed: String(seed),
    model: config.pollinationsModel,
    nologo: "true",
    safe: "true",
    enhance: "false",
  });
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(p)}?${params}`;
  const headers: Record<string, string> = { Accept: "image/*" };
  if (config.pollinationsToken) headers.Authorization = `Bearer ${config.pollinationsToken}`;

  let lastErr = "unknown error";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await queuePollinations(() => fetchWithTimeout(url, { headers }, 120000));
      // anonymous over-limit requests come back as 402 "FREE_LIMIT"; the queue gap makes the retry wait
      if (res.status === 429 || res.status === 402) {
        lastErr = res.status === 402 ? "free limit reached (1 image every 45 s without a token)" : "rate limited";
        continue;
      }
      if (!res.ok) throw new ProviderError(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const ext = imageKind(buf);
      if (!ext) throw new ProviderError("response was not a usable JPEG/PNG image");
      return { buf, ext };
    } catch (e) {
      lastErr = (e as Error).message;
    }
  }
  throw new ProviderError(`Pollinations: ${lastErr}`);
}

// ---------- Pexels (free, licensed stock photos) ----------
async function pexels(query: string, salt: number) {
  const res = await fetchWithTimeout(
    `https://api.pexels.com/v1/search?${new URLSearchParams({ query, orientation: "landscape", size: "large", per_page: "15" })}`,
    { headers: { Authorization: config.pexelsKey } },
    20000,
  );
  if (res.status === 401) throw new ProviderError("Pexels: invalid API key");
  if (!res.ok) throw new ProviderError(`Pexels: HTTP ${res.status}`);
  const data = (await res.json()) as {
    photos?: { url: string; photographer: string; src: { large2x: string; landscape: string } }[];
  };
  const photos = data.photos ?? [];
  if (!photos.length) throw new ProviderError(`Pexels: no photos for "${query}"`);
  const photo = photos[salt % photos.length];
  const img = await fetchWithTimeout(photo.src.large2x || photo.src.landscape, {}, 30000);
  if (!img.ok) throw new ProviderError(`Pexels: image download failed (HTTP ${img.status})`);
  const buf = Buffer.from(await img.arrayBuffer());
  const ext = imageKind(buf);
  if (!ext) throw new ProviderError("Pexels: unsupported image format");
  return { buf, ext, credit: `Photo by ${photo.photographer} on Pexels`, creditUrl: photo.url };
}

// ---------- Openverse (free Creative Commons photos, no key) ----------
// Anonymous use allows 20 searches a minute and 200 a day, so results are cached per query.
type OpenverseHit = {
  url: string;
  title?: string;
  creator?: string;
  license: string;
  license_version?: string;
  foreign_landing_url: string;
  width?: number;
  tags?: { name: string }[];
};
const openverseCache = new Map<string, { at: number; hits: OpenverseHit[] }>();
// Openverse mixes in satellite images, maps and diagrams; these don't work behind lyrics.
const NOT_SCENIC = /\b(nasa|goddard|modis|satellite|map|diagram|chart|infographic|military|navy|submarine|logo|poster|screenshot|illustration|album|band|concert)\b/i;
const SCENIC = /\b(landscape|seascape|scenic|scenery|nature|sunset|sunrise|beach|sky|clouds?|waves?|sea|coast|mountains?|forest|lake)\b/i;
const hitText = (h: OpenverseHit) => `${h.title ?? ""} ${(h.tags ?? []).map((t) => t.name).join(" ")}`;

async function openverseSearch(query: string): Promise<OpenverseHit[]> {
  const key = query.toLowerCase();
  const cached = openverseCache.get(key);
  if (cached && Date.now() - cached.at < 60 * 60 * 1000) return cached.hits;
  const params = new URLSearchParams({ q: query, license_type: "commercial", aspect_ratio: "wide", mature: "false", page_size: "20" });
  const res = await fetchWithTimeout(`https://api.openverse.org/v1/images/?${params}`, { headers: { "User-Agent": "lyrics2ppt/1.0" } }, 45000);
  if (res.status === 429) throw new ProviderError("Openverse: daily free limit reached");
  if (!res.ok) throw new ProviderError(`Openverse: HTTP ${res.status}`);
  const data = (await res.json()) as { results?: OpenverseHit[] };
  // small images look blurry when stretched across a slide
  const usable = (data.results ?? []).filter((r) => r.url && (r.width ?? 0) >= 900 && !NOT_SCENIC.test(hitText(r)));
  // keep only clearly scenic photos when there are enough of them
  const scenic = usable.filter((r) => SCENIC.test(hitText(r)));
  const hits = scenic.length >= 6 ? scenic : usable;
  if (!hits.length) throw new ProviderError(`Openverse: no photos for "${query}"`);
  openverseCache.set(key, { at: Date.now(), hits });
  return hits;
}

// photos already used per project, so slides with a shared search don't repeat a picture
const openverseUsed = new Map<string, Set<string>>();

async function openverse(query: string, salt: number, projectId: string) {
  const all = await openverseSearch(query);
  const used = openverseUsed.get(projectId) ?? new Set<string>();
  openverseUsed.set(projectId, used);
  const fresh = all.filter((h) => !used.has(h.url));
  const hits = fresh.length ? fresh : all;
  let lastErr = "image download failed";
  // some hosts have removed photos since indexing, so try a few
  for (let i = 0; i < Math.min(3, hits.length); i++) {
    const hit = hits[(salt + i) % hits.length];
    used.add(hit.url);
    try {
      const img = await fetchWithTimeout(hit.url, { headers: { "User-Agent": "lyrics2ppt/1.0" } }, 30000);
      if (!img.ok) throw new ProviderError(`HTTP ${img.status}`);
      const buf = Buffer.from(await img.arrayBuffer());
      const ext = imageKind(buf);
      // 5 MB keeps each image inside hosted MySQL row limits (TiDB allows about 6 MB)
      if (!ext || buf.length > 5 * 1024 * 1024) throw new ProviderError("unsupported image");
      const license = hit.license === "cc0" ? "CC0" : `CC ${hit.license.toUpperCase()} ${hit.license_version ?? ""}`.trim();
      return { buf, ext, credit: `Photo by ${hit.creator || "unknown"} (${license}) via Openverse`, creditUrl: hit.foreign_landing_url };
    } catch (e) {
      lastErr = (e as Error).message;
    }
  }
  throw new ProviderError(`Openverse: ${lastErr}`);
}

export interface BackgroundRequest {
  projectId: string;
  slide: Slide;
  size: SlideSize;
  mode: BackgroundMode;
  salt?: number;
}

function newFileName(slideId: string, ext: string) {
  return `${slideId}-${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}.${ext}`;
}

/**
 * Produces a background for one slide and stores it in the project's assets.
 * Always resolves: if every remote provider fails, the offline renderer is used
 * and the failure reasons are kept in `error` so the UI can show them honestly.
 */
export async function createBackground(req: BackgroundRequest): Promise<SlideBackground> {
  const { projectId, slide, size, mode } = req;
  const salt = req.salt ?? 0;
  const seed = (Math.abs(hashCode(slide.id)) + salt * 7919) % 1_000_000;
  const errors: string[] = [];
  // Auto prefers clean stock photos when there is no Pollinations token, because anonymous AI images carry a logo.
  const autoOrder: ("ai" | "stock")[] = config.pollinationsToken ? ["ai", "stock"] : ["stock", "ai"];
  const order: ("ai" | "stock")[] =
    mode === "ai" ? ["ai", "stock"] : mode === "stock" ? ["stock", "ai"] : mode === "gradient" ? [] : autoOrder;

  for (const kind of order) {
    try {
      if (kind === "ai") {
        if (!config.pollinationsEnabled) {
          errors.push("AI images are turned off (POLLINATIONS_ENABLED=false)");
          continue;
        }
        if (!providerOpen("pollinations")) {
          errors.push("Pollinations is unreachable right now (paused for 5 minutes after repeated failures)");
          continue;
        }
        let result: { buf: Buffer; ext: "jpg" | "png" };
        try {
          result = await pollinations(slide.visualPrompt, size, seed);
          recordResult("pollinations", true);
        } catch (e) {
          recordResult("pollinations", false);
          throw e;
        }
        const { buf, ext } = result;
        const file = newFileName(slide.id, ext);
        await writeAsset(projectId, file, buf);
        return { status: "ready", source: "ai-pollinations", file, prompt: slide.visualPrompt, updatedAt: new Date().toISOString() };
      }
      if (kind === "stock") {
        const provider = config.pexelsKey ? "pexels" : config.openverseEnabled ? "openverse" : null;
        if (!provider) {
          if (mode === "stock") errors.push("Stock photos are off (add a PEXELS_API_KEY or remove OPENVERSE_ENABLED=false)");
          continue;
        }
        const label = provider === "pexels" ? "Pexels" : "Openverse";
        if (!providerOpen(provider)) {
          errors.push(`${label} is unreachable right now (paused for 5 minutes after repeated failures)`);
          continue;
        }
        let r: Awaited<ReturnType<typeof pexels>>;
        try {
          const query = slide.stockQuery || slide.mood;
          const pick = salt + Math.abs(hashCode(slide.id));
          r = provider === "pexels" ? await pexels(query, pick) : await openverse(query, pick, projectId);
          recordResult(provider, true);
        } catch (e) {
          if (!(e as Error).message.includes("no photos")) recordResult(provider, false);
          throw e;
        }
        const file = newFileName(slide.id, r.ext);
        await writeAsset(projectId, file, r.buf);
        return {
          status: "ready",
          source: provider === "pexels" ? "stock-pexels" : "stock-openverse",
          file,
          credit: r.credit,
          creditUrl: r.creditUrl,
          prompt: slide.stockQuery,
          updatedAt: new Date().toISOString(),
        };
      }
    } catch (e) {
      errors.push((e as Error).message);
    }
  }

  const buf = renderProceduralBackground(slide.mood, size, `${slide.id}:${salt}`);
  const file = newFileName(slide.id, "jpg");
  await writeAsset(projectId, file, buf);
  return {
    status: "ready",
    source: "procedural",
    file,
    error: errors.length ? `Used the offline background because: ${errors.join("; ")}` : undefined,
    updatedAt: new Date().toISOString(),
  };
}

function hashCode(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}
