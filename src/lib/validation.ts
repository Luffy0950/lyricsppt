// Request validation schemas (zod) shared by the API routes.
import { NextResponse } from "next/server";
import { z } from "zod";
import { MOODS, SLIDE_FONTS, STYLE_PRESETS } from "./types";

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const settingsSchema = z.object({
  title: z.string().max(140).default(""),
  artist: z.string().max(140).default(""),
  style: z.enum(STYLE_PRESETS).default("auto"),
  size: z.enum(["16:9", "4:3"]).default("16:9"),
  density: z.enum(["auto", "few", "balanced", "more"]).default("auto"),
  align: z.enum(["left", "center", "right"]).default("center"),
  backgroundMode: z.enum(["auto", "ai", "stock", "gradient"]).default("auto"),
  theme: z.string().max(60).default(""),
  transition: z.enum(["none", "fade", "push"]).default("fade"),
  titleSlide: z.boolean().default(true),
  endingSlide: z.boolean().default(false),
  slideNumbers: z.boolean().default(false),
});

export const createSchema = z.object({
  lyrics: z.string().min(1, "Add lyrics before generating.").max(20000, "Lyrics are too long (20,000 characters max)."),
  settings: settingsSchema,
});

const backgroundSchema = z.object({
  status: z.enum(["pending", "generating", "ready", "failed"]),
  source: z.enum(["ai-pollinations", "stock-pexels", "stock-openverse", "procedural", "upload"]).optional(),
  file: z.string().max(120).optional(),
  credit: z.string().max(300).optional(),
  creditUrl: z.string().max(500).optional(),
  error: z.string().max(1000).optional(),
  prompt: z.string().max(1200).optional(),
  updatedAt: z.string().max(40).optional(),
});

export const slideSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{4,40}$/),
  kind: z.enum(["title", "lyrics", "ending"]),
  section: z.string().max(60),
  lines: z.array(z.string().max(300)).max(16),
  mood: z.enum(MOODS),
  visualPrompt: z.string().max(1200),
  stockQuery: z.string().max(120),
  overlay: z.object({ color: hex, opacity: z.number().min(0).max(0.9) }),
  text: z.object({
    font: z.enum(SLIDE_FONTS),
    size: z.union([z.literal("auto"), z.number().min(10).max(120)]),
    color: hex,
    align: z.enum(["left", "center", "right"]),
    vAlign: z.enum(["top", "middle", "bottom"]),
    shadow: z.boolean(),
    bold: z.boolean(),
    emphasis: z.array(z.string().max(80)).max(10),
  }),
  accent: hex,
  background: backgroundSchema,
  timing: z.object({ start: z.number(), end: z.number() }).optional(),
});

export const patchSchema = z.object({
  title: z.string().max(140).optional(),
  artist: z.string().max(140).optional(),
  slides: z.array(slideSchema).max(400).optional(),
  settings: settingsSchema.pick({ size: true, transition: true, slideNumbers: true }).partial().optional(),
});

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function zodMessage(e: z.ZodError) {
  const i = e.issues[0];
  return i ? `${i.path.join(".") || "request"}: ${i.message}` : "Invalid request";
}
