// LLM lyric interpretation using free-tier providers (Google Gemini or Groq).
// The model never rewrites lyrics: it only returns interpretation, visual
// prompts and (optionally) line ranges, which are validated before use.
import { activeLlm, config } from "../config";
import { COMMON_PROMPT, STYLES } from "../moods";
import {
  Analysis,
  GenerationSettings,
  Mood,
  MOODS,
  ResolvedStyle,
  SLIDE_FONTS,
  SlideFont,
  STYLE_PRESETS,
  VAlign,
} from "../types";

export class LlmError extends Error {}
class ModelNotFound extends LlmError {}

export interface LlmSlidePlan {
  mood: Mood;
  visualPrompt: string;
  stockQuery: string;
  vAlign: VAlign;
  emphasis: string[];
}

export interface LlmResult {
  analysis: Analysis;
  slides: LlmSlidePlan[];
  ranges?: unknown;
}

const RESOLVED = STYLE_PRESETS.filter((s) => s !== "auto") as ResolvedStyle[];

const SYSTEM = `You are an art director who designs lyric slides for church services, concerts and classrooms.
You read song lyrics, interpret their meaning in context (whole lines and surrounding verses, never single words in isolation),
and plan a background image for each slide that expresses that slide's meaning and emotion.

Rules:
- Never rewrite, translate, correct or repeat the lyrics. Lyrics stay exactly as given; you only describe visuals.
- Visual prompts describe a scene for an image generator: subject, setting, lighting, colour palette and atmosphere, in 20-45 words.
  They must not contain any lyric text, words, letters, signs or recognisable people. Keep the centre of the frame calm so lyrics stay readable.
- Keep one consistent artistic direction across the whole song, and let backgrounds evolve as the emotion changes
  (for example from rainy grey dusk to golden sunrise when sorrow turns to hope).
- A metaphor is interpreted by meaning: "light" may mean hope, guidance, love or a new beginning depending on context.
- stockQuery is 2-4 plain English words to search a stock photo library for a similar image.
- emphasis lists at most 2 short words or phrases copied exactly from that slide's lyrics that deserve highlighting; often an empty list.
- Respond with JSON only.`;

function userPrompt(
  lines: { index: number; text: string; section: string }[],
  slides: { lineIdx: number[]; section: string }[] | null,
  settings: GenerationSettings,
): string {
  const head = [
    settings.title ? `Song title: ${settings.title}` : "",
    settings.artist ? `Artist: ${settings.artist}` : "",
    settings.style === "auto"
      ? `Visual style: choose the best fit from ${RESOLVED.join(", ")}.`
      : `Visual style chosen by the user: ${settings.style} (${STYLES[settings.style].promptSuffix}). Use "${settings.style}" as style.`,
    settings.theme?.trim()
      ? `Background theme chosen by the user: "${settings.theme.trim()}". Every visualPrompt must be a ${settings.theme.trim()} scene, and every stockQuery must be about ${settings.theme.trim()}.`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const numbered = lines.map((l) => `${l.index}: [${l.section}] ${l.text}`).join("\n");

  const slideBlock = slides
    ? `The lyrics are already divided into ${slides.length} slides (line numbers inclusive):\n` +
      slides.map((s, i) => `Slide ${i}: lines ${s.lineIdx[0]}-${s.lineIdx[s.lineIdx.length - 1]} (${s.section})`).join("\n") +
      `\nReturn exactly ${slides.length} entries in "slides", in the same order.`
    : `Divide the lyrics into slides for projection. Return "slideRanges" as [startLine, endLine] pairs (inclusive) that cover every line from 0 to ${lines.length - 1} exactly once, in order, without gaps or overlaps.
Keep related lines and complete thoughts together, follow the verse/chorus structure, usually 2-4 lines per slide (never more than 6), and avoid single-line slides unless the line stands alone.
Return one entry in "slides" for each range, in the same order.`;

  return `${head}

Lyrics (line number: [section] text):
${numbered}

${slideBlock}

Return JSON with this shape:
{
  "theme": "one sentence naming the main theme and message",
  "summary": "two sentences explaining how you interpreted the song and its imagery",
  "visualDirection": "one sentence describing the overall visual direction and palette",
  "emotionalArc": "short arrow sequence such as Longing → Struggle → Hope",
  "overallMood": one of ${JSON.stringify(MOODS)},
  "style": one of ${JSON.stringify(RESOLVED)},
  "font": one of ${JSON.stringify(SLIDE_FONTS)},
  "palette": { "text": "#RRGGBB light colour for lyrics", "accent": "#RRGGBB highlight colour", "overlay": "#RRGGBB dark tint placed over images" },
  ${slides ? "" : '"slideRanges": [[0, 3], [4, 7]],\n  '}"slides": [
    { "mood": one of the moods, "visualPrompt": "...", "stockQuery": "...", "textPosition": "top" | "middle" | "bottom", "emphasis": [] }
  ]
}`;
}

function parseJson(text: string): Record<string, unknown> {
  const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new LlmError("The AI returned an unreadable response.");
  }
}

async function post(url: string, headers: Record<string, string>, body: unknown): Promise<unknown> {
  let lastErr = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 90000);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (res.ok) return await res.json();
      const detail = (await res.text()).slice(0, 300);
      if (res.status === 401 || res.status === 403) throw new LlmError(`API key rejected (HTTP ${res.status}).`);
      if (res.status === 400) throw new LlmError(`Request rejected (HTTP 400): ${detail}`);
      if (res.status === 404) throw new ModelNotFound(detail);
      lastErr = res.status === 429 ? "free-tier rate limit reached" : `HTTP ${res.status}: ${detail}`;
    } catch (e) {
      if (e instanceof LlmError) throw e;
      lastErr = (e as Error).name === "AbortError" ? "request timed out" : (e as Error).message;
    } finally {
      clearTimeout(timer);
    }
    await new Promise((r) => setTimeout(r, 4000));
  }
  throw new LlmError(lastErr);
}

// Google retires model names over time. If the configured model is gone, ask the
// API which models this key can use and switch to the newest "flash" model.
let geminiModelInUse = "";

async function pickGeminiModel(): Promise<string | null> {
  try {
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", {
      headers: { "x-goog-api-key": config.geminiKey },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
    const candidates = (data.models ?? [])
      .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
      .map((m) => m.name.replace(/^models\//, ""))
      .filter((n) => /^gemini-[\d.]+-flash$/.test(n));
    const version = (n: string) => parseFloat(/^gemini-([\d.]+)/.exec(n)?.[1] ?? "0");
    candidates.sort((a, b) => version(b) - version(a));
    return candidates[0] ?? null;
  } catch {
    return null;
  }
}

async function geminiRequest(model: string, system: string, user: string) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  return (await post(
    url,
    { "x-goog-api-key": config.geminiKey },
    {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.7, maxOutputTokens: 12000 },
    },
  )) as { candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[]; promptFeedback?: { blockReason?: string } };
}

async function callGemini(system: string, user: string): Promise<string> {
  let model = geminiModelInUse || config.geminiModel;
  let data;
  try {
    data = await geminiRequest(model, system, user);
  } catch (e) {
    if (!(e instanceof ModelNotFound)) throw e;
    const replacement = await pickGeminiModel();
    if (!replacement || replacement === model) {
      throw new LlmError(`The Gemini model "${model}" isn't available. Set GEMINI_MODEL in .env.local to a current model.`);
    }
    console.warn(`Gemini model "${model}" is unavailable; using "${replacement}". Set GEMINI_MODEL=${replacement} in .env.local.`);
    model = replacement;
    data = await geminiRequest(model, system, user);
  }
  geminiModelInUse = model;
  if (data.promptFeedback?.blockReason) throw new LlmError(`Gemini blocked the request (${data.promptFeedback.blockReason}).`);
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text) throw new LlmError(`Gemini returned no content (${data.candidates?.[0]?.finishReason ?? "unknown"}).`);
  return text;
}

async function callGroq(system: string, user: string): Promise<string> {
  const data = (await post(
    "https://api.groq.com/openai/v1/chat/completions",
    { Authorization: `Bearer ${config.groqKey}` },
    {
      model: config.groqModel,
      temperature: 0.7,
      max_tokens: 8000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    },
  )) as { choices?: { message?: { content?: string } }[] };
  const text = data.choices?.[0]?.message?.content ?? "";
  if (!text) throw new LlmError("Groq returned no content.");
  return text;
}

const HEX = /^#[0-9a-f]{6}$/i;
function lum(h: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function pick<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}
function str(v: unknown, fallback = ""): string {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, 600) : fallback;
}

export function llmAvailable() {
  return activeLlm() !== "offline";
}

/**
 * Calls the configured LLM. `slides` = fixed division (or null to let the AI
 * propose ranges). `slideTexts` is needed to validate emphasis words.
 */
export async function analyzeWithLlm(
  lines: { index: number; text: string; section: string }[],
  slides: { lineIdx: number[]; section: string }[] | null,
  settings: GenerationSettings,
  fallbackMoods: (count: number) => Mood[],
): Promise<LlmResult> {
  const provider = activeLlm();
  if (provider === "offline") throw new LlmError("No AI provider configured.");
  const raw = provider === "gemini" ? await callGemini(SYSTEM, userPrompt(lines, slides, settings)) : await callGroq(SYSTEM, userPrompt(lines, slides, settings));
  const json = parseJson(raw);

  const style: ResolvedStyle = settings.style !== "auto" ? settings.style : pick(json.style, RESOLVED, "cinematic");
  const def = STYLES[style];
  const pal = (json.palette ?? {}) as Record<string, unknown>;
  const text = typeof pal.text === "string" && HEX.test(pal.text) && lum(pal.text) > 0.65 ? pal.text : def.text;
  const accent = typeof pal.accent === "string" && HEX.test(pal.accent) && lum(pal.accent) > 0.35 ? pal.accent : def.accent;
  const overlay = typeof pal.overlay === "string" && HEX.test(pal.overlay) && lum(pal.overlay) < 0.2 ? pal.overlay : def.overlay;

  const analysis: Analysis = {
    engine: provider === "gemini" ? `Google Gemini (${geminiModelInUse || config.geminiModel})` : `Groq (${config.groqModel})`,
    theme: str(json.theme, "A song with a personal message."),
    summary: str(json.summary),
    visualDirection: str(json.visualDirection, def.blurb),
    emotionalArc: str(json.emotionalArc),
    overallMood: pick(json.overallMood, MOODS, "hope"),
    style,
    font: pick<SlideFont>(json.font, SLIDE_FONTS, def.font),
    palette: { text, accent, overlay },
  };

  const rawSlides = Array.isArray(json.slides) ? (json.slides as Record<string, unknown>[]) : [];
  const expected = slides ? slides.length : rawSlides.length;
  const fallback = fallbackMoods(expected);
  const plans: LlmSlidePlan[] = Array.from({ length: expected }, (_, i) => {
    const s = rawSlides[i] ?? {};
    const mood = pick(s.mood, MOODS, fallback[i] ?? analysis.overallMood);
    const scene = str(s.visualPrompt).replace(/["“”]/g, "");
    return {
      mood,
      visualPrompt: scene ? `${scene}, ${def.promptSuffix}, ${COMMON_PROMPT}` : "",
      stockQuery: str(s.stockQuery).split(/\s+/).slice(0, 5).join(" "),
      vAlign: pick<VAlign>(s.textPosition, ["top", "middle", "bottom"], "middle"),
      emphasis: Array.isArray(s.emphasis) ? (s.emphasis as unknown[]).filter((e): e is string => typeof e === "string").slice(0, 2) : [],
    };
  });

  return { analysis, slides: plans, ranges: slides ? undefined : json.slideRanges };
}
