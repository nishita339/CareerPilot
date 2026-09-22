"use node";

// Best-effort text extraction from an uploaded resume PDF.
//
// Honest limitations: this reads the PDF's own text-showing operators. For a
// PDF produced by a normal word processor (subset fonts + a ToUnicode CMap)
// that recovers most of the text; for scans or exotic encodings it returns
// little or nothing. Callers must therefore treat the result as a *suggestion*
// and ask the user to paste the text when extraction looks useless — we never
// silently pretend we read a resume we could not read.

import { inflateRawSync, inflateSync } from "node:zlib";

/** WinAnsiEncoding slots that differ from Latin-1. */
const WIN_ANSI: Record<number, number> = {
  0x82: 0x201a,
  0x83: 0x0192,
  0x84: 0x201e,
  0x85: 0x2026,
  0x86: 0x2020,
  0x87: 0x2021,
  0x88: 0x02c6,
  0x89: 0x2030,
  0x8a: 0x0160,
  0x8b: 0x2039,
  0x8c: 0x0152,
  0x8e: 0x017d,
  0x91: 0x2018,
  0x92: 0x2019,
  0x93: 0x201c,
  0x94: 0x201d,
  0x95: 0x2022,
  0x96: 0x2013,
  0x97: 0x2014,
  0x98: 0x02dc,
  0x99: 0x2122,
  0x9a: 0x0161,
  0x9b: 0x203a,
  0x9c: 0x0153,
  0x9e: 0x017e,
  0x9f: 0x0178,
};

function decodeBytes(bytes: Buffer): string {
  let out = "";
  for (const byte of bytes) {
    if (byte >= 0x20 && byte <= 0x7e) {
      out += String.fromCharCode(byte);
    } else if (byte >= 0xa0) {
      out += String.fromCharCode(byte);
    } else if (WIN_ANSI[byte] !== undefined) {
      out += String.fromCharCode(WIN_ANSI[byte]);
    } else if (byte === 0x09 || byte === 0x0a || byte === 0x0d) {
      out += " ";
    }
    // Other control bytes are dropped: they are layout noise, not text.
  }
  return out;
}

/** Hex string literal `<41 42>` (UTF-16BE when it starts with FEFF). */
function decodeHexToken(hex: string): string {
  const clean = hex.replace(/\s+/g, "");
  if (clean.length === 0 || clean.length % 2 !== 0) return "";
  const bytes = Buffer.from(clean, "hex");
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    const swapped = Buffer.from(bytes.subarray(2));
    swapped.swap16();
    return swapped.toString("utf16le");
  }
  return decodeBytes(bytes);
}

/** Literal string with PDF escapes: `(A \(B\) C)`. */
function decodeLiteralToken(raw: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch !== "\\") {
      bytes.push(raw.charCodeAt(i) & 0xff);
      continue;
    }
    const next = raw[++i];
    if (next === undefined) break;
    if (next >= "0" && next <= "7") {
      let oct = next;
      while (oct.length < 3 && raw[i + 1] >= "0" && raw[i + 1] <= "7") {
        oct += raw[++i];
      }
      bytes.push(parseInt(oct, 8) & 0xff);
    } else {
      const escapes: Record<string, number> = {
        n: 10,
        r: 13,
        t: 9,
        b: 8,
        f: 12,
      };
      bytes.push(escapes[next] ?? next.charCodeAt(0));
    }
  }
  return decodeBytes(Buffer.from(bytes));
}

/** Split a `stream … endstream` body out of the raw file text. */
function collectStreams(latin: string): string[] {
  const streams: string[] = [];
  let cursor = 0;
  while (cursor < latin.length) {
    const start = latin.indexOf("stream", cursor);
    if (start === -1) break;
    // Skip the "stream" inside "endstream".
    if (latin.slice(Math.max(0, start - 3), start) === "end") {
      cursor = start + 6;
      continue;
    }
    let bodyStart = start + 6;
    if (latin[bodyStart] === "\r") bodyStart++;
    if (latin[bodyStart] === "\n") bodyStart++;
    const end = latin.indexOf("endstream", bodyStart);
    if (end === -1) break;
    streams.push(latin.slice(bodyStart, end));
    cursor = end + 9;
  }
  return streams;
}

function inflate(raw: string): string | null {
  const buffer = Buffer.from(raw, "latin1");
  for (const attempt of [inflateSync, inflateRawSync]) {
    try {
      const out = attempt(buffer);
      if (out.length > 0) return out.toString("latin1");
    } catch {
      // Not this one — try the next.
    }
  }
  return null;
}

/** Text-showing operands inside one decoded content stream, in order. */
function textFromContentStream(content: string): string[] {
  const pieces: string[] = [];
  let i = 0;
  while (i < content.length) {
    // Only look inside text objects: BT … ET.
    const bt = content.indexOf("BT", i);
    if (bt === -1) break;
    const et = content.indexOf("ET", bt);
    const block = content.slice(bt, et === -1 ? content.length : et);

    // Walk the block collecting string tokens, and note which of them the
    // following operator actually shows (Tj / TJ / ' / ").
    const tokenRe = /\((?:\\.|[^\\()])*\)|<[0-9A-Fa-f\s]+>/g;
    let match: RegExpExecArray | null;
    while ((match = tokenRe.exec(block)) !== null) {
      const following = block.slice(match.index + match[0].length, match.index + match[0].length + 24);
      if (!/^\s*(?:Tj|TJ|'|")/.test(following) && !/^\s*\]/.test(following)) {
        continue; // an operand of something else (e.g. a colour or a font name)
      }
      const token = match[0];
      if (token.startsWith("(")) {
        pieces.push(decodeLiteralToken(token.slice(1, -1)));
      } else {
        pieces.push(decodeHexToken(token.slice(1, -1)));
      }
    }
    i = et === -1 ? content.length : et + 2;
  }
  return pieces;
}

/** Extract the visible text of a PDF, best effort. Never throws. */
export function extractPdfText(bytes: Uint8Array): string {
  try {
    const latin = Buffer.from(bytes).toString("latin1");
    const chunks: string[] = [];
    for (const raw of collectStreams(latin)) {
      const content = inflate(raw) ?? raw;
      if (!/Tj|TJ/.test(content)) continue;
      const pieces = textFromContentStream(content);
      if (pieces.length > 0) chunks.push(pieces.join("\n"));
    }
    return chunks.join("\n\n").replace(/[ \t]+/g, " ").trim();
  } catch {
    return "";
  }
}

/** True when the extracted text looks like a resume worth seeding the profile with. */
export function looksLikeResumeText(text: string): boolean {
  const words = text.split(/\s+/).filter((w) => w.length > 1);
  return text.trim().length >= 120 && words.length >= 25;
}

/** Tidy extracted text: keep line structure, drop runs of blank lines. */
export function cleanResumeText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line, index, all) => line.length > 0 || all[index - 1]?.length > 0)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
