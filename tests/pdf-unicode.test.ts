import { describe, expect, test } from "bun:test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import {
  buildResumePdf,
  isWinAnsiEncodable,
  pdfWarnings,
  sanitizeForWinAnsi,
} from "../src/convex/pdf";
import { buildResumeDoc, type ResumeDoc } from "../src/convex/resume";

const DEVANAGARI_NAME = "Aarav शर्मा";
const ACCENTED_NAME = "Zoë Résumé";
const CYRILLIC_ORG = "Иван Лэбс";

function docWith(overrides: Partial<ResumeDoc>): ResumeDoc {
  const base = buildResumeDoc(
    {
      fullName: "Aarav Sharma",
      headline: "CS student — data & backend",
      email: "aarav@example.com",
      phone: "+91 90000 00000",
      location: "Pune, India",
      links: "github.com/aarav",
      university: "University of Pune",
      major: "Computer Science",
      graduationYear: "2027",
      gpa: "8.6",
      relevantCoursework: "Algorithms, Databases",
      certifications: "Azure Fundamentals",
    },
    {
      summary: "CS student focused on data pipelines and backend systems.",
      skills: ["Python", "Pandas", "SQL"],
      bullets: ["Analyzed 50k rows of transit data at Acme Cloud using Python."],
    },
  );
  return { ...base, ...overrides };
}

describe("sanitizeForWinAnsi", () => {
  test("leaves Latin-1 and typography untouched", () => {
    // Accented Latin letters and smart punctuation ARE encodable in WinAnsi —
    // sanitizing must not mangle perfectly valid names.
    const input = `${ACCENTED_NAME} — “quoted” • ünïcödé`;
    const result = sanitizeForWinAnsi(input);
    expect(result.text).toBe(input);
    expect(result.replaced).toEqual([]);
    expect(result.unsupportedCount).toBe(0);
  });

  test("folds diacritics that WinAnsi cannot encode", () => {
    // Ā, Ș and ź decompose (macron / comma below / acute) -> the base letter is
    // used. Ł has no decomposition, so it becomes the visible placeholder.
    const result = sanitizeForWinAnsi("Ārāv Ștefan Łódź");
    expect(result.text).toBe("Arav Stefan ?ódz");
    expect(result.unsupportedCount).toBe(1);
    expect(result.replaced.map((r) => r.char)).toContain("Ā");
    expect(result.replaced).toContainEqual({ char: "Ł", replacement: "?" });
    // "ó" is Latin-1 and must survive untouched.
    expect(result.text).toContain("ó");
  });

  test("replaces non-Latin script with a visible placeholder, never drops silently", () => {
    const result = sanitizeForWinAnsi(DEVANAGARI_NAME);
    expect(result.text.startsWith("Aarav ")).toBe(true);
    expect(result.unsupportedCount).toBe("शर्मा".length);
    expect(result.text).not.toBe(DEVANAGARI_NAME);
    expect(result.text).toMatch(/^\?+$|Aarav \?+$/);
  });

  test("handles control characters and newlines without corrupting them", () => {
    const result = sanitizeForWinAnsi("line one\r\nline two\t\u0000\u0007");
    expect(result.text.startsWith("line one\nline two\t")).toBe(true);
    expect(result.text).not.toContain("\r");
    expect(isWinAnsiEncodable("\u0000")).toBe(false);
  });
});

describe("non-Latin resume PDFs", () => {
  test("pdf-lib genuinely cannot encode Devanagari with the standard fonts", async () => {
    // This is the bug the sanitizer exists to prevent: without it, building the
    // PDF would throw and the user would get "Action failed" instead of a file.
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const page = pdf.addPage([595, 842]);
    expect(() =>
      page.drawText(DEVANAGARI_NAME, { x: 40, y: 700, size: 12, font }),
    ).toThrow();
  });

  test("builds a valid PDF for a Devanagari name instead of crashing", async () => {
    const doc = docWith({
      name: DEVANAGARI_NAME,
      contact: "aarav@example.com · Pune, India",
      sections: [
        {
          heading: "स्किल्स",
          kind: "list",
          lines: ["Python", "SQL"],
        },
      ],
    });

    const built = await buildResumePdf(doc);
    expect(built.degraded).toBe(false); // the sanitized pass rendered fine
    expect(built.unsupportedCount).toBeGreaterThan(0);
    expect(built.bytes.length).toBeGreaterThan(1000);
    expect(Buffer.from(built.bytes.subarray(0, 5)).toString("latin1")).toBe("%PDF-");

    // Structure survives: a real parser can open it and it has a page.
    const parsed = await PDFDocument.load(built.bytes);
    expect(parsed.getPageCount()).toBe(1);

    const warnings = pdfWarnings(built);
    expect(warnings.length).toBeGreaterThanOrEqual(1);
    expect(warnings.join(" ")).toContain("Latin-only");
    expect(warnings.join(" ")).toContain("Print");
  });

  test("keeps properly accented names intact and reports nothing", async () => {
    const built = await buildResumePdf(
      docWith({ name: ACCENTED_NAME, headline: "Développeuse — données" }),
    );
    expect(built.unsupportedCount).toBe(0);
    expect(built.replaced).toEqual([]);
    expect(pdfWarnings(built)).toEqual([]);
  });

  test("Cyrillic organization text degrades without throwing", async () => {
    const built = await buildResumePdf(
      docWith({
        contact: `${CYRILLIC_ORG} · remote`,
        sections: [
          {
            heading: "Experience",
            kind: "list",
            lines: [`Intern at ${CYRILLIC_ORG} building Python services`],
          },
        ],
      }),
    );
    expect(built.unsupportedCount).toBeGreaterThan(0);
    expect(built.bytes.length).toBeGreaterThan(1000);
    const parsed = await PDFDocument.load(built.bytes);
    expect(parsed.getPageCount()).toBe(1);
  });
});
