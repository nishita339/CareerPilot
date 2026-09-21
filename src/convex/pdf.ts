"use node";

// Pure builder: structured ResumeDoc -> ATS-friendly PDF bytes.
// Single column, standard Helvetica, no tables, no images — the layout that
// text-extraction based ATS parsers read most reliably.
//
// Encoding: pdf-lib's standard fonts are WinAnsi (Latin-1 + typography), so
// non-Latin scripts (Devanagari, CJK, Cyrillic) cannot be encoded. Rather than
// throwing mid-render, text is sanitized first: diacritics are stripped where
// possible, typography is folded to ASCII, and anything still unencodable
// becomes "?" — reported back to the caller so the UI can warn and point the
// user at browser Print → Save as PDF (which uses system fonts and full Unicode).
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { ResumeDoc } from "./resume";

const PAGE_WIDTH = 595.28; // A4
const PAGE_HEIGHT = 841.89;
const MARGIN = 54;
const BODY_SIZE = 9.5;
const LEADING = 13;
const HEADING_SIZE = 10;
const INK = rgb(0.1, 0.1, 0.11);
const MUTED = rgb(0.42, 0.43, 0.46);

/** WinAnsi slots in 0x80-0x9F plus the euro sign. */
const WINANSI_EXTRAS = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030,
  0x0160, 0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022,
  0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
]);

export function isWinAnsiEncodable(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0;
  if (code >= 0x20 && code <= 0x7e) return true; // printable ASCII
  if (code >= 0xa0 && code <= 0xff) return true; // Latin-1 supplement
  return WINANSI_EXTRAS.has(code);
}

const TYPOGRAPHY: Record<string, string> = {
  "\u201c": '"',
  "\u201d": '"',
  "\u2018": "'",
  "\u2019": "'",
  "\u201e": '"',
  "\u201a": "'",
  "\u2013": "-",
  "\u2014": "-",
  "\u2026": "...",
  "\u2022": "-",
  "\u00ab": '"',
  "\u00bb": '"',
  "\u00a0": " ",
  "\u200b": "",
  "\u2009": " ",
  "\u202f": " ",
  "\u2011": "-",
  "\u2043": "-",
};

function transliterate(ch: string): string | null {
  const folded = TYPOGRAPHY[ch];
  if (folded !== undefined) return folded;
  // "é" -> "e", "ā" -> "a" ... any Latin letter with combining marks.
  const decomposed = ch.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (decomposed && decomposed !== ch) {
    return [...decomposed].every(isWinAnsiEncodable) ? decomposed : null;
  }
  return null;
}

export interface Replacement {
  char: string;
  replacement: string;
}

export interface SanitizeResult {
  text: string;
  replaced: Replacement[];
  /** Characters that had no Latin approximation and became "?". */
  unsupportedCount: number;
}

/** Make text safe for WinAnsi fonts without throwing. */
export function sanitizeForWinAnsi(input: string): SanitizeResult {
  const replaced = new Map<string, string>();
  let unsupportedCount = 0;
  let out = "";

  for (const ch of input) {
    if (ch === "\n" || ch === "\t") {
      out += ch;
      continue;
    }
    if (ch === "\r") continue;
    if (isWinAnsiEncodable(ch)) {
      out += ch;
      continue;
    }
    const fallback = transliterate(ch);
    if (fallback !== null) {
      out += fallback;
      replaced.set(ch, fallback);
    } else {
      out += "?";
      unsupportedCount++;
      replaced.set(ch, "?");
    }
  }

  return {
    text: out,
    replaced: [...replaced].map(([char, replacement]) => ({ char, replacement })),
    unsupportedCount,
  };
}

/** Last-resort pass: keep only characters the standard fonts can encode. */
function toAsciiSafe(input: string): string {
  return [...input]
    .map((ch) => {
      if (ch === "\n" || ch === "\t") return ch;
      if (ch.codePointAt(0)! >= 0x20 && ch.codePointAt(0)! <= 0x7e) return ch;
      return TYPOGRAPHY[ch] ?? "";
    })
    .join("");
}

export interface PdfBuildResult {
  bytes: Uint8Array;
  replaced: Replacement[];
  unsupportedCount: number;
  /** True when the aggressive ASCII fallback had to be used. */
  degraded: boolean;
}

export async function buildResumePdf(doc: ResumeDoc): Promise<PdfBuildResult> {
  const sanitized: ResumeDoc = {
    name: sanitizeForWinAnsi(doc.name).text,
    headline: sanitizeForWinAnsi(doc.headline).text,
    contact: sanitizeForWinAnsi(doc.contact).text,
    sections: doc.sections.map((s) => ({
      heading: sanitizeForWinAnsi(s.heading).text,
      kind: s.kind,
      lines: s.lines.map((l) => sanitizeForWinAnsi(l).text),
    })),
  };

  const replaced = new Map<string, string>();
  let unsupportedCount = 0;
  for (const value of [
    doc.name,
    doc.headline,
    doc.contact,
    ...doc.sections.flatMap((s) => [s.heading, ...s.lines]),
  ]) {
    const result = sanitizeForWinAnsi(value);
    unsupportedCount += result.unsupportedCount;
    for (const r of result.replaced) replaced.set(r.char, r.replacement);
  }

  try {
    const bytes = await render(sanitized);
    return {
      bytes,
      replaced: [...replaced].map(([char, replacement]) => ({ char, replacement })),
      unsupportedCount,
      degraded: false,
    };
  } catch {
    // Belt and braces: strip every non-ASCII character and render once more.
    const ascii: ResumeDoc = {
      name: toAsciiSafe(doc.name),
      headline: toAsciiSafe(doc.headline),
      contact: toAsciiSafe(doc.contact),
      sections: doc.sections.map((s) => ({
        heading: toAsciiSafe(s.heading),
        kind: s.kind,
        lines: s.lines.map(toAsciiSafe),
      })),
    };
    const bytes = await render(ascii);
    return { bytes, replaced: [], unsupportedCount, degraded: true };
  }
}

/** Convenience wrapper for callers that only need the bytes. */
export async function buildResumePdfBytes(doc: ResumeDoc): Promise<Uint8Array> {
  return (await buildResumePdf(doc)).bytes;
}

/** Human-readable warnings for the UI. */
export function pdfWarnings(result: PdfBuildResult): string[] {
  const warnings: string[] = [];
  if (result.replaced.length > 0) {
    const examples = result.replaced
      .slice(0, 4)
      .map((r) => `${r.char} → ${r.replacement === "" ? "(removed)" : r.replacement}`)
      .join(", ");
    warnings.push(
      `Latin-only PDF font: adjusted ${result.replaced.length} character${result.replaced.length === 1 ? "" : "s"} (${examples}).`,
    );
  }
  if (result.unsupportedCount > 0 || result.degraded) {
    warnings.push(
      "Some characters could not be encoded at all — for full Unicode, open the resume preview and use your browser's Print → Save as PDF.",
    );
    warnings.push(
      "For applications, prefer the Latin spelling of your name and an English-language resume: ATS parsers read those most reliably.",
    );
  }
  return warnings;
}

async function render(doc: ResumeDoc): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${doc.name} — Resume`);
  pdf.setCreator("CareerPilot");
  pdf.setProducer("CareerPilot");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;
  const contentWidth = PAGE_WIDTH - MARGIN * 2;

  const wrap = (
    text: string,
    font: typeof regular,
    size: number,
    maxWidth: number,
  ): string[] => {
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
    return lines.length ? lines : [""];
  };

  const ensureSpace = (needed: number) => {
    if (y - needed < MARGIN) {
      page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
  };

  const writeLine = (
    text: string,
    opts: {
      font?: typeof regular;
      size?: number;
      color?: typeof INK;
      x?: number;
      gapAfter?: number;
    } = {},
  ) => {
    const font = opts.font ?? regular;
    const size = opts.size ?? BODY_SIZE;
    const color = opts.color ?? INK;
    const x = opts.x ?? MARGIN;
    for (const line of wrap(text, font, size, contentWidth - (x - MARGIN))) {
      ensureSpace(LEADING);
      page.drawText(line, { x, y, size, font, color });
      y -= LEADING;
    }
    y -= opts.gapAfter ?? 0;
  };

  const heading = (text: string) => {
    y -= 7;
    ensureSpace(HEADING_SIZE + 14);
    page.drawText(text.toUpperCase(), {
      x: MARGIN,
      y,
      size: HEADING_SIZE,
      font: bold,
      color: INK,
    });
    y -= 6;
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE_WIDTH - MARGIN, y },
      thickness: 0.6,
      color: rgb(0.8, 0.8, 0.82),
    });
    y -= 11;
  };

  writeLine(doc.name, { font: bold, size: 16, gapAfter: 1 });
  if (doc.headline) writeLine(doc.headline, { color: MUTED, gapAfter: 1 });
  if (doc.contact) writeLine(doc.contact, { size: 8.5, color: MUTED });

  for (const section of doc.sections) {
    const lines = section.lines.filter((l) => l.trim());
    if (lines.length === 0) continue;
    heading(section.heading);
    for (const line of lines) {
      writeLine(line, section.kind === "bullets" ? { x: MARGIN + 11 } : {});
    }
  }

  return new Uint8Array(await pdf.save());
}

/** `resume-acme-cloud-software-engineer-intern.pdf` */
export function resumePdfFilename(organization: string, title: string): string {
  const slug = toAsciiSafe(`${organization}-${title}`)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return `resume-${slug || "tailored"}.pdf`;
}
