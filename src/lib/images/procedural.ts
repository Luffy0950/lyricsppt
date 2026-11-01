// Offline background renderer: draws a mood-driven scene (gradient sky, glow,
// light rays, stars, rain, hills, vignette) and encodes it as JPEG.
// Used when AI generation / stock search is unavailable or fails.
import jpeg from "jpeg-js";
import { MOOD_DEFS } from "../moods";
import { Mood, SlideSize } from "../types";

type RGB = [number, number, number];

const hex = (h: string): RGB => {
  const v = h.replace("#", "");
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
};
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

function seedFrom(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Slightly rotate a colour's hue so repeated moods don't look identical. */
function hueShift([r, g, b]: RGB, deg: number): RGB {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const m = [
    0.299 + 0.701 * c + 0.168 * s, 0.587 - 0.587 * c + 0.33 * s, 0.114 - 0.114 * c - 0.497 * s,
    0.299 - 0.299 * c - 0.328 * s, 0.587 + 0.413 * c + 0.035 * s, 0.114 - 0.114 * c + 0.292 * s,
    0.299 - 0.3 * c + 1.25 * s, 0.587 - 0.588 * c - 1.05 * s, 0.114 + 0.886 * c - 0.203 * s,
  ];
  return [
    clamp(r * m[0] + g * m[1] + b * m[2]),
    clamp(r * m[3] + g * m[4] + b * m[5]),
    clamp(r * m[6] + g * m[7] + b * m[8]),
  ];
}

export function renderProceduralBackground(mood: Mood, size: SlideSize, seedText: string): Buffer {
  const W = size === "4:3" ? 1024 : 1366;
  const H = 768;
  const def = MOOD_DEFS[mood].procedural;
  const rand = rng(seedFrom(seedText + mood));
  const shift = (rand() - 0.5) * 24;
  const top = hueShift(hex(def.top), shift);
  const bottom = hueShift(hex(def.bottom), shift);
  const glow = hex(def.glow);
  const gx = (def.glowAt[0] + (rand() - 0.5) * 0.16) * W;
  const gy = def.glowAt[1] * H;
  const glowR = Math.max(W, H) * (0.55 + rand() * 0.2);
  const rayPhase = rand() * Math.PI * 2;
  const rayCount = 5 + Math.floor(rand() * 4);
  const hills = def.hills ? hex(def.hills) : null;
  const hillPhase = rand() * 10;

  const px = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    const ty = smooth(y / (H - 1));
    for (let x = 0; x < W; x++) {
      const diag = (x / W - 0.5) * 0.12;
      let c = mix(top, bottom, Math.min(1, Math.max(0, ty + diag)));

      const dx = x - gx;
      const dy = y - gy;
      const d = Math.sqrt(dx * dx + dy * dy);
      const g = Math.max(0, 1 - d / glowR);
      let intensity = g * g * 0.85;

      if (def.rays) {
        const ang = Math.atan2(dy, dx);
        // soft, uneven beams rather than a symmetric starburst
        const ray = Math.pow(0.5 + 0.5 * Math.sin(ang * rayCount + rayPhase), 3) * (0.6 + 0.4 * Math.sin(ang * 3.1 + rayPhase * 2));
        intensity += Math.max(0, ray) * Math.pow(g, 2.2) * 0.16;
      }
      c = mix(c, glow, Math.min(0.92, intensity));

      if (hills) {
        const fx = x / W;
        const h1 = H * (0.74 + 0.05 * Math.sin(fx * 5.2 + hillPhase) + 0.025 * Math.sin(fx * 13 + hillPhase * 2));
        const h2 = H * (0.84 + 0.04 * Math.sin(fx * 3.4 + hillPhase * 1.7) + 0.02 * Math.sin(fx * 9 + 1));
        if (y > h1) c = mix(c, hills, 0.55);
        if (y > h2) c = mix(c, mix(hills, [0, 0, 0], 0.35), 0.8);
      }

      // vignette
      const vx = x / W - 0.5;
      const vy = y / H - 0.5;
      const v = 1 - Math.min(1, (vx * vx + vy * vy) * 1.25) * 0.45;
      const noise = (rand() - 0.5) * 3; // tiny grain prevents banding
      const i = (y * W + x) * 4;
      px[i] = clamp(c[0] * v + noise);
      px[i + 1] = clamp(c[1] * v + noise);
      px[i + 2] = clamp(c[2] * v + noise);
      px[i + 3] = 255;
    }
  }

  const blend = (x: number, y: number, col: RGB, a: number) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (Math.floor(y) * W + Math.floor(x)) * 4;
    px[i] = clamp(px[i] + (col[0] - px[i]) * a);
    px[i + 1] = clamp(px[i + 1] + (col[1] - px[i + 1]) * a);
    px[i + 2] = clamp(px[i + 2] + (col[2] - px[i + 2]) * a);
  };

  if (def.stars) {
    for (let s = 0; s < def.stars; s++) {
      const x = rand() * W;
      const y = rand() * H * 0.62;
      const b = 0.35 + rand() * 0.65;
      const big = rand() > 0.9;
      blend(x, y, [255, 255, 245], b);
      if (big) {
        blend(x + 1, y, [255, 255, 245], b * 0.6);
        blend(x - 1, y, [255, 255, 245], b * 0.6);
        blend(x, y + 1, [255, 255, 245], b * 0.6);
        blend(x, y - 1, [255, 255, 245], b * 0.6);
      }
    }
  }

  if (def.rain) {
    for (let s = 0; s < 420; s++) {
      const x0 = rand() * (W + 200) - 100;
      const y0 = rand() * H;
      const len = 18 + rand() * 30;
      const a = 0.08 + rand() * 0.12;
      for (let t = 0; t < len; t++) blend(x0 + t * 0.25, y0 + t, [210, 225, 240], a);
    }
  }

  return Buffer.from(jpeg.encode({ data: px, width: W, height: H }, 86).data);
}
