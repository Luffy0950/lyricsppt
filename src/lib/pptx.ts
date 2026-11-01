// Builds a real, editable .pptx with PptxGenJS. Lyrics stay as text boxes;
// backgrounds are full-bleed images (cropped to cover) under a tint overlay.
import JSZip from "jszip";
import PptxGenJS from "pptxgenjs";
import { emphasisSegments, resolvedFontSize, textBox } from "./layout";
import { readAsset } from "./storage";
import { Project, Slide, slideDims } from "./types";

const pt2in = (pt: number) => pt / 72;
const noHash = (c: string) => c.replace("#", "").toUpperCase();

function imageSize(buf: Buffer): { w: number; h: number } | null {
  if (buf[0] === 0x89 && buf[1] === 0x50) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length - 9) {
      if (buf[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      // SOF0..SOF15 except DHT(C4), JPG(C8), DAC(CC)
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      }
      i += 2 + len;
    }
  }
  return null;
}

function mime(file: string) {
  return file.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
}

type TextRun = { text: string; options?: PptxGenJS.TextPropsOptions };

function lyricRuns(slide: Slide, fontSize: number): TextRun[] {
  const runs: TextRun[] = [];
  if (slide.kind === "title") {
    const [title, ...rest] = slide.lines;
    runs.push({ text: title ?? "", options: { fontSize, bold: true, breakLine: rest.length > 0 } });
    rest.forEach((l, i) =>
      runs.push({
        text: l,
        options: { fontSize: Math.max(16, Math.round(fontSize * 0.45)), bold: false, color: noHash(slide.accent), breakLine: i < rest.length - 1 },
      }),
    );
    return runs;
  }
  slide.lines.forEach((line, li) => {
    const segs = emphasisSegments(line || " ", slide.text.emphasis);
    segs.forEach((seg, si) => {
      runs.push({
        text: seg.text,
        options: {
          ...(seg.em ? { color: noHash(slide.accent), bold: true } : {}),
          breakLine: si === segs.length - 1 && li < slide.lines.length - 1,
        },
      });
    });
  });
  return runs;
}

const TRANSITION_XML: Record<string, string> = {
  fade: '<p:transition spd="med"><p:fade/></p:transition>',
  push: '<p:transition spd="med"><p:push dir="u"/></p:transition>',
};

async function addTransitions(buf: Buffer, transition: string): Promise<Buffer> {
  const xml = TRANSITION_XML[transition];
  if (!xml) return buf;
  const zip = await JSZip.loadAsync(buf);
  const files = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f));
  for (const f of files) {
    let content = await zip.file(f)!.async("string");
    if (content.includes("<p:transition")) continue;
    content = content.includes("</p:clrMapOvr>")
      ? content.replace("</p:clrMapOvr>", `</p:clrMapOvr>${xml}`)
      : content.replace("</p:sld>", `${xml}</p:sld>`);
    zip.file(f, content);
  }
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

/** Re-opens the generated file and checks it is a complete presentation package. */
async function validatePptx(buf: Buffer, expectedSlides: number) {
  const zip = await JSZip.loadAsync(buf);
  for (const required of ["[Content_Types].xml", "ppt/presentation.xml", "_rels/.rels"]) {
    if (!zip.file(required)) throw new Error(`Export validation failed: missing ${required}`);
  }
  const slides = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f)).length;
  if (slides !== expectedSlides) throw new Error(`Export validation failed: expected ${expectedSlides} slides, found ${slides}`);
}

export function exportFileName(p: Project) {
  const base = (p.title || "lyrics")
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
  return `${base || "lyrics"}.pptx`;
}

export async function buildPptx(p: Project): Promise<Buffer> {
  if (!p.slides.length) throw new Error("This project has no slides to export.");
  const pres = new PptxGenJS();
  const d = slideDims(p.settings.size);
  pres.layout = p.settings.size === "4:3" ? "LAYOUT_4x3" : "LAYOUT_WIDE";
  pres.title = p.title || "Lyrics";
  pres.author = p.artist || "AI Lyrics-to-PowerPoint Generator";
  pres.subject = p.analysis?.theme ?? "Song lyrics";
  pres.company = "AI Lyrics-to-PowerPoint Generator";

  const W = pt2in(d.w);
  const H = pt2in(d.h);
  const box = textBox(p.settings.size);

  for (const s of p.slides) {
    const slide = pres.addSlide();
    slide.background = { color: "101018" };
    const notes: string[] = [];

    if (s.background.file) {
      const img = await readAsset(p.id, s.background.file);
      if (img) {
        const dim = imageSize(img);
        const data = `${mime(s.background.file)};base64,${img.toString("base64")}`;
        if (dim) {
          slide.addImage({
            data,
            x: 0,
            y: 0,
            w: W,
            h: (W * dim.h) / dim.w,
            sizing: { type: "cover", w: W, h: H },
            altText: "Slide background",
          });
        } else {
          slide.addImage({ data, x: 0, y: 0, w: W, h: H, altText: "Slide background" });
        }
      }
      if ((s.background.source === "stock-pexels" || s.background.source === "stock-openverse") && s.background.credit) notes.push(`Background: ${s.background.credit} — ${s.background.creditUrl ?? ""}`);
      if (s.background.source === "ai-pollinations") notes.push(`Background: AI-generated with Pollinations.ai. Prompt: ${s.background.prompt ?? s.visualPrompt}`);
      if (s.background.source === "procedural") notes.push("Background: generated offline by the app (gradient scene).");
      if (s.background.source === "upload") notes.push("Background: uploaded by the user.");
    }

    if (s.overlay.opacity > 0) {
      slide.addShape(pres.ShapeType.rect, {
        x: 0,
        y: 0,
        w: W,
        h: H,
        fill: { color: noHash(s.overlay.color), transparency: Math.round((1 - s.overlay.opacity) * 100) },
        line: { type: "none" },
      });
    }

    const fontSize = resolvedFontSize(s, p.settings.size);
    slide.addText(lyricRuns(s, fontSize) as PptxGenJS.TextProps[], {
      x: pt2in(box.x),
      y: pt2in(box.y),
      w: pt2in(box.w),
      h: pt2in(box.h),
      fontFace: s.text.font,
      fontSize,
      color: noHash(s.text.color),
      bold: s.text.bold,
      align: s.text.align,
      valign: s.text.vAlign,
      margin: 0,
      lineSpacingMultiple: 1.02,
      shadow: s.text.shadow ? { type: "outer", color: "000000", blur: 8, offset: 2, angle: 90, opacity: 0.6 } : undefined,
    });

    if (p.settings.slideNumbers) {
      slide.slideNumber = { x: W - 0.9, y: H - 0.5, w: 0.6, h: 0.3, fontSize: 11, color: "DDDDDD", align: "right" } as never;
    }
    if (s.section) notes.unshift(`Section: ${s.section}`);
    if (notes.length) slide.addNotes(notes.join("\n"));
  }

  let buf = (await pres.write({ outputType: "nodebuffer", compression: true })) as Buffer;
  buf = await addTransitions(buf, p.settings.transition);
  await validatePptx(buf, p.slides.length);
  return buf;
}
