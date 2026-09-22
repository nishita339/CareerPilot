import { describe, expect, test } from "bun:test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import {
  cleanResumeText,
  extractPdfText,
  looksLikeResumeText,
} from "../src/convex/resumeText";

async function resumePdfBytes(lines: string[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([595, 842]);
  let y = 800;
  for (const line of lines) {
    page.drawText(line, { x: 50, y, size: 11, font });
    y -= 16;
  }
  return new Uint8Array(await pdf.save());
}

const RESUME_LINES = [
  "Aarav Sharma",
  "Computer Science, University of Pune (2027)",
  "aarav@example.com | +91 90000 00000 | Pune, India",
  "EXPERIENCE",
  "Data Science Intern at Northwind Analytics",
  "Built ETL scripts in Python and SQL handling 40k rows daily",
  "PROJECTS",
  "Transit delay analysis in Pandas on 50k rows",
];

describe("extractPdfText", () => {
  test("recovers the visible text of a real PDF", async () => {
    const bytes = await resumePdfBytes(RESUME_LINES);
    const text = extractPdfText(bytes);
    expect(text).toContain("Aarav Sharma");
    expect(text).toContain("aarav@example.com");
    expect(text).toContain("EXPERIENCE");
    expect(text).toContain("Built ETL scripts in Python and SQL handling 40k rows daily");
    expect(text).not.toContain("\uFFFD");
  });

  test("keeps the document's order", async () => {
    const bytes = await resumePdfBytes(RESUME_LINES);
    const text = extractPdfText(bytes);
    expect(text.indexOf("Aarav Sharma")).toBeLessThan(text.indexOf("EXPERIENCE"));
    expect(text.indexOf("EXPERIENCE")).toBeLessThan(text.indexOf("PROJECTS"));
  });

  test("handles typographic punctuation that lands in WinAnsi slots", async () => {
    const bytes = await resumePdfBytes(["CS student — data & backend", "2026 \u2013 present"]);
    const text = extractPdfText(bytes);
    expect(text).toContain("data & backend");
    expect(/[\u2014\u2013]/.test(text)).toBe(true);
  });

  test("returns an empty string instead of throwing on unusable input", () => {
    expect(extractPdfText(new Uint8Array())).toBe("");
    expect(extractPdfText(new Uint8Array([1, 2, 3, 4, 5]))).toBe("");
    expect(extractPdfText(Buffer.from("not a pdf at all"))).toBe("");
  });
});

describe("looksLikeResumeText", () => {
  test("accepts a real resume chunk", async () => {
    const text = extractPdfText(await resumePdfBytes(RESUME_LINES));
    expect(looksLikeResumeText(text)).toBe(true);
  });

  test("rejects short or empty extraction results", () => {
    expect(looksLikeResumeText("")).toBe(false);
    expect(looksLikeResumeText("Page 1 of 1")).toBe(false);
    expect(looksLikeResumeText("   \n  ")).toBe(false);
  });
});

describe("cleanResumeText", () => {
  test("normalises line endings and collapses blank runs", () => {
    const messy = "Aarav  Sharma\r\n\r\n\r\nEXPERIENCE\r\n- Built   things\r\n";
    expect(cleanResumeText(messy)).toBe(
      "Aarav Sharma\n\nEXPERIENCE\n- Built things",
    );
  });

  test("keeps single line breaks between bullets", () => {
    expect(cleanResumeText("- one\n- two")).toBe("- one\n- two");
  });
});
