// Shared types used by the server pipeline and the client editor.

export const STYLE_PRESETS = [
  "auto",
  "cinematic",
  "minimalist",
  "worship",
  "romantic",
  "nature",
  "modern",
  "dramatic",
] as const;
export type StylePreset = (typeof STYLE_PRESETS)[number];
export type ResolvedStyle = Exclude<StylePreset, "auto">;

export const MOODS = [
  "hope",
  "joy",
  "love",
  "sadness",
  "longing",
  "struggle",
  "peace",
  "faith",
  "nature",
  "energy",
  "mystery",
] as const;
export type Mood = (typeof MOODS)[number];

export type SlideSize = "16:9" | "4:3";
export type Density = "auto" | "few" | "balanced" | "more";
export type Align = "left" | "center" | "right";
export type VAlign = "top" | "middle" | "bottom";
export type BackgroundMode = "auto" | "ai" | "stock" | "gradient";
export type Transition = "none" | "fade" | "push";

export const SLIDE_FONTS = [
  "Georgia",
  "Palatino Linotype",
  "Garamond",
  "Segoe UI",
  "Calibri",
  "Arial",
  "Trebuchet MS",
  "Century Gothic",
  "Franklin Gothic Medium",
  "Verdana",
] as const;
export type SlideFont = (typeof SLIDE_FONTS)[number];

export interface GenerationSettings {
  title: string;
  artist: string;
  style: StylePreset;
  size: SlideSize;
  density: Density;
  align: Align;
  backgroundMode: BackgroundMode;
  theme?: string; // optional subject every background follows, e.g. "ocean"
  transition: Transition;
  titleSlide: boolean;
  endingSlide: boolean;
  slideNumbers: boolean;
}

export type BackgroundSource = "ai-pollinations" | "stock-pexels" | "stock-openverse" | "procedural" | "upload";

export interface SlideBackground {
  status: "pending" | "generating" | "ready" | "failed";
  source?: BackgroundSource;
  file?: string; // file name inside the project's asset folder
  credit?: string; // photographer credit for stock photos
  creditUrl?: string;
  error?: string;
  prompt?: string; // prompt actually used
  updatedAt?: string;
}

export interface SlideText {
  font: SlideFont;
  size: number | "auto"; // points
  color: string; // hex
  align: Align;
  vAlign: VAlign;
  shadow: boolean;
  bold: boolean;
  emphasis: string[]; // words/phrases drawn in the accent colour
}

export interface Slide {
  id: string;
  kind: "title" | "lyrics" | "ending";
  section: string; // Verse 1, Chorus, ...
  lines: string[]; // exact lyric lines (or title/artist for title slides)
  mood: Mood;
  visualPrompt: string;
  stockQuery: string;
  overlay: { color: string; opacity: number }; // opacity 0..0.85
  text: SlideText;
  accent: string;
  background: SlideBackground;
  timing?: { start: number; end: number }; // reserved for optional audio sync
}

export interface Analysis {
  engine: string; // honest label of what produced the analysis
  theme: string;
  summary: string;
  visualDirection: string;
  emotionalArc: string;
  overallMood: Mood;
  style: ResolvedStyle;
  font: SlideFont;
  palette: { text: string; accent: string; overlay: string };
}

export type StageKey = "input" | "analysis" | "planning" | "backgrounds" | "rendering" | "done";

export interface ProjectStatus {
  state: "queued" | "running" | "ready" | "partial" | "failed" | "interrupted";
  stage: StageKey;
  message: string;
  progress: { done: number; total: number };
  error?: string;
}

export interface Project {
  id: string;
  title: string;
  artist: string;
  lyrics: string; // original lyrics exactly as confirmed by the user
  settings: GenerationSettings;
  analysis?: Analysis;
  slides: Slide[];
  status: ProjectStatus;
  warnings: string[];
  createdAt: string;
  updatedAt: string;
  lastExport?: { file: string; at: string; bytes: number };
}

export interface ProjectSummary {
  id: string;
  title: string;
  artist: string;
  style: StylePreset;
  resolvedStyle?: ResolvedStyle;
  slideCount: number;
  status: ProjectStatus;
  cover?: string; // asset url of the first ready background
  createdAt: string;
  updatedAt: string;
}

export const DEFAULT_SETTINGS: GenerationSettings = {
  title: "",
  artist: "",
  style: "auto",
  size: "16:9",
  density: "auto",
  align: "center",
  backgroundMode: "auto",
  theme: "",
  transition: "fade",
  titleSlide: true,
  endingSlide: false,
  slideNumbers: false,
};

/** Slide geometry in points. Both layouts are 7.5in (540pt) tall. */
export function slideDims(size: SlideSize) {
  return size === "4:3" ? { w: 720, h: 540, wIn: 10, hIn: 7.5 } : { w: 960, h: 540, wIn: 13.333, hIn: 7.5 };
}
