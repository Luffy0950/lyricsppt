// Mood lexicon, style presets and the offline (no-API) lyric analyser.
import { Analysis, Mood, MOODS, ResolvedStyle, SlideFont } from "./types";

export interface StyleDef {
  label: string;
  blurb: string;
  font: SlideFont;
  bold: boolean;
  text: string;
  accent: string;
  overlay: string;
  overlayOpacity: number;
  promptSuffix: string;
  swatch: [string, string, string];
}

export const STYLES: Record<ResolvedStyle, StyleDef> = {
  cinematic: {
    label: "Cinematic",
    blurb: "Dramatic lighting, atmospheric backgrounds and elegant serif lyrics.",
    font: "Georgia",
    bold: false,
    text: "#F7F3EA",
    accent: "#F4C46A",
    overlay: "#05040A",
    overlayOpacity: 0.38,
    promptSuffix: "cinematic film still, anamorphic lighting, atmospheric haze, shallow depth of field",
    swatch: ["#10121f", "#3d3550", "#e0a85a"],
  },
  minimalist: {
    label: "Minimalist",
    blurb: "Clean layouts, quiet backgrounds and restrained type.",
    font: "Segoe UI",
    bold: false,
    text: "#FFFFFF",
    accent: "#9FD3FF",
    overlay: "#0B0B12",
    overlayOpacity: 0.3,
    promptSuffix: "minimalist composition, generous negative space, soft muted tones, simple forms",
    swatch: ["#d9dde3", "#8f9bab", "#2f3a4a"],
  },
  worship: {
    label: "Worship & lyrics projection",
    blurb: "Bold, readable lyrics over peaceful imagery made for projectors.",
    font: "Segoe UI",
    bold: true,
    text: "#FFFFFF",
    accent: "#FFD98A",
    overlay: "#060814",
    overlayOpacity: 0.42,
    promptSuffix: "peaceful and reverent, soft heavenly light, wide open sky, serene atmosphere",
    swatch: ["#142142", "#5b6f9e", "#f3d08b"],
  },
  romantic: {
    label: "Romantic",
    blurb: "Warm colours, soft light and tender scenery.",
    font: "Palatino Linotype",
    bold: false,
    text: "#FFF4EC",
    accent: "#FFB4A2",
    overlay: "#22090f",
    overlayOpacity: 0.32,
    promptSuffix: "warm golden hour, soft bokeh, dreamy romantic atmosphere, gentle film grain",
    swatch: ["#3a1530", "#b5566a", "#f6b08d"],
  },
  nature: {
    label: "Nature",
    blurb: "Landscapes, forests and oceans in natural colour.",
    font: "Trebuchet MS",
    bold: false,
    text: "#F4F8F1",
    accent: "#CDEBB0",
    overlay: "#08140d",
    overlayOpacity: 0.32,
    promptSuffix: "landscape photography, natural light, lush scenery, wide angle",
    swatch: ["#1f3d33", "#5f8d64", "#d6e6a8"],
  },
  modern: {
    label: "Modern",
    blurb: "Contemporary type over smooth gradients and flowing shapes.",
    font: "Century Gothic",
    bold: false,
    text: "#FFFFFF",
    accent: "#8EE3F5",
    overlay: "#120a2a",
    overlayOpacity: 0.3,
    promptSuffix: "modern abstract art, smooth flowing gradients, soft glassy shapes, contemporary digital art",
    swatch: ["#2a1b5e", "#7a4fd1", "#7fe0f0"],
  },
  dramatic: {
    label: "Dramatic",
    blurb: "High contrast, intense light and bold type.",
    font: "Franklin Gothic Medium",
    bold: false,
    text: "#FFFFFF",
    accent: "#FF8A5C",
    overlay: "#000000",
    overlayOpacity: 0.48,
    promptSuffix: "dramatic chiaroscuro, high contrast, intense volumetric light, epic scale",
    swatch: ["#07060b", "#5a1a1f", "#ff7a4d"],
  },
};

export interface MoodDef {
  label: string;
  theme: string;
  keywords: string[];
  scenes: string[];
  stock: string[];
  procedural: {
    top: string;
    bottom: string;
    glow: string;
    glowAt: [number, number];
    rays?: boolean;
    stars?: number;
    rain?: boolean;
    hills?: string;
  };
}

export const MOOD_DEFS: Record<Mood, MoodDef> = {
  hope: {
    label: "Hope",
    theme: "hope and new beginnings",
    keywords: ["light", "shine", "shining", "dawn", "sunrise", "morning", "rise", "rising", "hope", "bright", "glow", "tomorrow", "again", "begin", "new", "free", "freedom", "wings", "fly", "brighter", "liwanag", "pag-asa", "umaga"],
    scenes: [
      "golden sunlight breaking through clouds over a wide horizon",
      "radiant sunrise glowing behind soft hills",
      "beams of warm light streaming through morning mist",
      "a bright star rising above a calm dark landscape",
    ],
    stock: ["sunrise clouds", "light rays sky", "morning sunlight"],
    procedural: { top: "#1b2a52", bottom: "#f0ad66", glow: "#ffe6a3", glowAt: [0.5, 0.66], rays: true },
  },
  joy: {
    label: "Joy",
    theme: "joy and celebration",
    keywords: ["happy", "smile", "laugh", "dance", "dancing", "celebrate", "sing", "singing", "party", "alive", "fun", "joy", "joyful", "shout", "together", "saya", "masaya", "sayaw", "kanta"],
    scenes: [
      "warm festival lights glowing against a twilight sky",
      "bright blue sky with sunlit colourful confetti bokeh",
      "glowing string lights and warm colourful bokeh",
      "a vivid summer sky with soft sun flare",
    ],
    stock: ["colorful bokeh lights", "festival lights", "bright summer sky"],
    procedural: { top: "#ff7f5a", bottom: "#ffd36e", glow: "#fff4c7", glowAt: [0.72, 0.28], stars: 40 },
  },
  love: {
    label: "Love",
    theme: "love and devotion",
    keywords: ["love", "loving", "heart", "hold", "kiss", "together", "forever", "darling", "baby", "arms", "embrace", "yours", "mine", "beautiful", "mahal", "pag-ibig", "puso", "ikaw", "sinta"],
    scenes: [
      "warm sunset over a quiet seaside with soft pink clouds",
      "soft golden light through a field of flowers",
      "romantic warm bokeh lights at dusk",
      "two candles glowing in a softly lit room",
    ],
    stock: ["sunset pink clouds", "flower field golden hour", "warm bokeh"],
    procedural: { top: "#3a1530", bottom: "#e8846b", glow: "#ffc49b", glowAt: [0.5, 0.72] },
  },
  sadness: {
    label: "Sadness",
    theme: "sorrow and loss",
    keywords: ["tears", "tear", "cry", "crying", "rain", "alone", "lonely", "broken", "gone", "goodbye", "cold", "empty", "sorry", "lost", "hurt", "pain", "grey", "gray", "fade", "died", "luha", "iyak", "lungkot", "paalam"],
    scenes: [
      "rain drops running down a window with blurred city lights",
      "an empty road under heavy grey clouds",
      "a misty lake on an overcast morning in muted blue",
      "a lone bench in soft falling rain",
    ],
    stock: ["rain window", "cloudy sky moody", "foggy lake"],
    procedural: { top: "#1d2633", bottom: "#4f6075", glow: "#8ea4bc", glowAt: [0.3, 0.2], rain: true },
  },
  longing: {
    label: "Longing",
    theme: "longing and memory",
    keywords: ["miss", "missing", "wait", "waiting", "far", "distance", "remember", "memory", "memories", "dream", "wish", "someday", "home", "yesterday", "ago", "back", "return", "naaalala", "hintay", "malayo"],
    scenes: [
      "a distant horizon at blue hour with the first stars appearing",
      "an old window looking out at a faded twilight sky",
      "a long road vanishing into a soft violet dusk",
      "a moonlit sea stretching to the horizon",
    ],
    stock: ["blue hour horizon", "twilight road", "moonlit sea"],
    procedural: { top: "#1b1d3a", bottom: "#6b5b8e", glow: "#c9b6e8", glowAt: [0.76, 0.3], stars: 70 },
  },
  struggle: {
    label: "Struggle",
    theme: "struggle and darkness",
    keywords: ["fight", "storm", "war", "fall", "falling", "dark", "darkness", "chains", "fear", "battle", "burn", "scream", "shadow", "shadows", "drown", "sink", "weak", "night", "against", "bagyo", "dilim", "takot"],
    scenes: [
      "storm clouds with distant lightning over a dark sea",
      "a single shaft of light piercing deep darkness",
      "towering dark clouds with a faint glow at the edge",
      "a rough sea under a heavy night sky",
    ],
    stock: ["storm clouds lightning", "dark sea storm", "light in darkness"],
    procedural: { top: "#0d0b14", bottom: "#3b1d2a", glow: "#b2493a", glowAt: [0.5, 0.88] },
  },
  peace: {
    label: "Peace",
    theme: "peace and rest",
    keywords: ["still", "calm", "quiet", "rest", "peace", "gentle", "soft", "breathe", "slow", "safe", "sleep", "silence", "kapayapaan", "tahimik", "pahinga"],
    scenes: [
      "a still lake reflecting a pale morning sky",
      "soft pastel clouds drifting over calm water",
      "a quiet meadow in gentle morning haze",
      "smooth sand dunes in soft even light",
    ],
    stock: ["calm lake reflection", "pastel clouds", "misty meadow"],
    procedural: { top: "#7f9fb4", bottom: "#e4dccb", glow: "#ffffff", glowAt: [0.5, 0.42], hills: "#5f7a8a" },
  },
  faith: {
    label: "Faith",
    theme: "faith and worship",
    keywords: ["god", "lord", "jesus", "christ", "grace", "heaven", "holy", "praise", "worship", "glory", "savior", "saviour", "spirit", "amen", "hallelujah", "cross", "pray", "faith", "mercy", "king", "throne", "panginoon", "diyos", "papuri", "hesus"],
    scenes: [
      "rays of light breaking through clouds from above",
      "a sunrise over mountains with radiant light beams",
      "a starry sky with the milky way over a quiet hill",
      "soft golden light filling an open sky above the clouds",
    ],
    stock: ["light rays clouds", "sunrise mountains", "milky way sky"],
    procedural: { top: "#142142", bottom: "#c99d5d", glow: "#fff0c8", glowAt: [0.5, 0.1], rays: true },
  },
  nature: {
    label: "Nature",
    theme: "nature and creation",
    keywords: ["tree", "trees", "forest", "mountain", "mountains", "river", "ocean", "sea", "wave", "waves", "flower", "flowers", "field", "earth", "wind", "leaves", "rose", "garden", "valley", "green", "bundok", "dagat", "ilog", "bulaklak"],
    scenes: [
      "sunlight filtering through a green forest canopy",
      "misty mountains at sunrise",
      "ocean waves rolling onto a quiet shore",
      "a river winding through a green valley",
    ],
    stock: ["forest sunlight", "misty mountains", "ocean waves"],
    procedural: { top: "#2d5a4a", bottom: "#a8c98a", glow: "#f3f0c0", glowAt: [0.62, 0.28], hills: "#1f3d33" },
  },
  energy: {
    label: "Energy",
    theme: "energy and passion",
    keywords: ["run", "fire", "loud", "wild", "power", "electric", "fast", "jump", "beat", "higher", "ignite", "thunder", "roar", "unstoppable", "louder", "apoy", "lakas"],
    scenes: [
      "vivid neon light streaks in motion",
      "embers and sparks rising against a dark sky",
      "electric concert lights with smoke beams",
      "a blazing sunset with intense orange clouds",
    ],
    stock: ["neon light trails", "sparks fire dark", "concert lights smoke"],
    procedural: { top: "#2b0a3d", bottom: "#ff4f6d", glow: "#ffb36b", glowAt: [0.5, 0.5] },
  },
  mystery: {
    label: "Mystery",
    theme: "mystery and night",
    keywords: ["moon", "secret", "ghost", "whisper", "unknown", "midnight", "mist", "fog", "stars", "star", "dreams", "hidden", "buwan", "bituin", "gabi"],
    scenes: [
      "a full moon over a foggy forest",
      "a deep starry night sky",
      "moonlight on still water in blue fog",
      "a quiet night sky with drifting mist",
    ],
    stock: ["full moon night", "starry night sky", "foggy moonlight"],
    procedural: { top: "#070b1f", bottom: "#23305a", glow: "#cfd8ff", glowAt: [0.76, 0.26], stars: 140 },
  },
};

// Concrete imagery words → phrases used to make prompts specific to the lyric.
const IMAGERY: [RegExp, string][] = [
  [/\b(sun|sunshine|araw)\b/i, "sunlight"],
  [/\b(sunrise|dawn)\b/i, "sunrise"],
  [/\b(sunset|dusk)\b/i, "sunset"],
  [/\b(rain|raining|ulan)\b/i, "falling rain"],
  [/\b(stars?|bituin)\b/i, "starry sky"],
  [/\b(moon|buwan)\b/i, "moonlight"],
  [/\b(ocean|sea|dagat)\b/i, "ocean"],
  [/\b(waves?)\b/i, "rolling waves"],
  [/\b(river|ilog)\b/i, "river"],
  [/\b(mountains?|bundok)\b/i, "mountains"],
  [/\b(forest|trees?)\b/i, "forest"],
  [/\b(flowers?|roses?|bulaklak)\b/i, "flowers"],
  [/\b(fire|flames?|apoy)\b/i, "glowing fire"],
  [/\b(snow|winter)\b/i, "snowfall"],
  [/\b(storm|thunder|lightning|bagyo)\b/i, "storm clouds"],
  [/\b(clouds?)\b/i, "clouds"],
  [/\b(sky|skies|langit)\b/i, "open sky"],
  [/\b(city|streets?)\b/i, "city lights"],
  [/\b(road|highway)\b/i, "open road"],
  [/\b(window)\b/i, "window"],
  [/\b(candles?)\b/i, "candlelight"],
  [/\b(birds?|wings?)\b/i, "birds in flight"],
  [/\b(field|meadow)\b/i, "meadow"],
  [/\b(desert|sand)\b/i, "desert dunes"],
  [/\b(night|gabi)\b/i, "night sky"],
  [/\b(light|liwanag)\b/i, "radiant light"],
];

export const COMMON_PROMPT =
  "widescreen background image, no text, no words, no letters, no watermark, no people, uncluttered centre area for overlaid lyrics, high detail";

export function imageryFor(text: string): string[] {
  const found: string[] = [];
  for (const [re, phrase] of IMAGERY) if (re.test(text) && !found.includes(phrase)) found.push(phrase);
  return found.slice(0, 3);
}

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}'-]+/gu) ?? [];
}

export function scoreMoods(text: string): Record<Mood, number> {
  const tokens = tokenize(text);
  const scores = Object.fromEntries(MOODS.map((m) => [m, 0])) as Record<Mood, number>;
  for (const t of tokens) {
    const w = t.replace(/^'+|'+$/g, "");
    for (const m of MOODS) if (MOOD_DEFS[m].keywords.includes(w)) scores[m] += 1;
  }
  return scores;
}

function topMood(scores: Record<Mood, number>, fallback: Mood): Mood {
  let best: Mood = fallback;
  let bestScore = 0;
  for (const m of MOODS) {
    if (scores[m] > bestScore) {
      best = m;
      bestScore = scores[m];
    }
  }
  return best;
}

export function styleForMood(m: Mood): ResolvedStyle {
  const map: Record<Mood, ResolvedStyle> = {
    faith: "worship",
    love: "romantic",
    nature: "nature",
    struggle: "dramatic",
    energy: "dramatic",
    sadness: "cinematic",
    longing: "cinematic",
    joy: "modern",
    peace: "minimalist",
    hope: "cinematic",
    mystery: "cinematic",
  };
  return map[m];
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function buildPrompt(text: string, mood: Mood, style: ResolvedStyle, salt: number): string {
  const imagery = imageryFor(text);
  const scenes = MOOD_DEFS[mood].scenes;
  const scene = scenes[(hash(text) + salt) % scenes.length];
  const lead = imagery.length ? `${imagery.join(", ")}; ` : "";
  return `${lead}${scene}, ${STYLES[style].promptSuffix}, ${COMMON_PROMPT}`;
}

export function buildStockQuery(text: string, mood: Mood, salt: number): string {
  const imagery = imageryFor(text);
  if (imagery.length) return `${imagery[0]} ${MOOD_DEFS[mood].stock[0].split(" ").slice(-1)[0]}`;
  const opts = MOOD_DEFS[mood].stock;
  return opts[(hash(text) + salt) % opts.length];
}

export interface OfflineSlideInput {
  section: string;
  text: string;
}
export interface OfflineResult {
  analysis: Omit<Analysis, "engine">;
  moods: Mood[];
}

/**
 * Keyword-based analysis used when no LLM is configured or the LLM call fails.
 * Each slide is scored with its neighbours (context window) and repeated
 * sections share a mood so choruses look consistent.
 */
export function offlineAnalyze(slides: OfflineSlideInput[], preferred: ResolvedStyle | null): OfflineResult {
  const all = slides.map((s) => s.text).join("\n");
  const songScores = scoreMoods(all);
  const songMood = topMood(songScores, "hope");
  const per = slides.map((s) => scoreMoods(s.text));

  // section-level aggregation (repeated chorus → same mood)
  const bySection = new Map<string, Record<Mood, number>>();
  slides.forEach((s, i) => {
    const agg = bySection.get(s.section) ?? (Object.fromEntries(MOODS.map((m) => [m, 0])) as Record<Mood, number>);
    MOODS.forEach((m) => (agg[m] += per[i][m]));
    bySection.set(s.section, agg);
  });

  const moods = slides.map((s, i) => {
    const combined = Object.fromEntries(MOODS.map((m) => [m, 0])) as Record<Mood, number>;
    MOODS.forEach((m) => {
      combined[m] =
        per[i][m] * 2.2 +
        (per[i - 1]?.[m] ?? 0) * 0.5 +
        (per[i + 1]?.[m] ?? 0) * 0.5 +
        (/chorus|refrain/i.test(s.section) ? (bySection.get(s.section)?.[m] ?? 0) : 0) +
        songScores[m] * 0.04;
    });
    return topMood(combined, songMood);
  });

  const ranked = [...MOODS].sort((a, b) => songScores[b] - songScores[a]).filter((m) => songScores[m] > 0);
  const first = ranked[0] ?? songMood;
  const second = ranked[1];
  const style = preferred ?? styleForMood(first);
  const arc = moods.filter((m, i) => i === 0 || m !== moods[i - 1]).map((m) => MOOD_DEFS[m].label);
  const imagery = imageryFor(all);

  return {
    moods,
    analysis: {
      theme: second
        ? `A song about ${MOOD_DEFS[first].theme}, touched by ${MOOD_DEFS[second].theme}.`
        : `A song about ${MOOD_DEFS[first].theme}.`,
      summary:
        `The lyrics lean most on words of ${MOOD_DEFS[first].label.toLowerCase()}` +
        (second ? ` and ${MOOD_DEFS[second].label.toLowerCase()}` : "") +
        (imagery.length ? `, with imagery of ${imagery.join(", ")}.` : "."),
      visualDirection: `${STYLES[style].label} look: ${STYLES[style].promptSuffix}. Backgrounds follow each section's mood.`,
      emotionalArc: arc.slice(0, 8).join(" → "),
      overallMood: first,
      style,
      font: STYLES[style].font,
      palette: { text: STYLES[style].text, accent: STYLES[style].accent, overlay: STYLES[style].overlay },
    },
  };
}
