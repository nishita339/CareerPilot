import { describe, expect, test } from "bun:test";
import ExcelJS from "exceljs";
import {
  buildWorkbookBytes,
  EXPORT_COLUMNS,
  SHEET_NAMES,
  type ExportJob,
} from "../src/convex/xlsx";
import { inflateSync } from "node:zlib";
import { PDFDocument } from "pdf-lib";
import { buildResumePdfBytes, resumePdfFilename } from "../src/convex/pdf";
import { buildResumeDoc } from "../src/convex/resume";

const jobs: ExportJob[] = [
  {
    _id: "job_1",
    source: "Greenhouse",
    opportunityType: "internship",
    organization: "Acme Cloud",
    title: "Software Engineering Intern",
    location: "Remote",
    url: "https://example.com/jobs/1",
    matchScore: 88,
    matchedSkills: ["TypeScript", "React"],
    missingSkills: ["GraphQL"],
    deadline: "2026-10-15",
    status: "Shortlisted",
    scrapedAt: Date.UTC(2026, 8, 1),
    notes: "Referral: Priya",
  },
  {
    _id: "job_2",
    source: "arXiv",
    opportunityType: "research",
    organization: "Pune Institute",
    title: "Research Assistant — Reinforcement Learning",
    location: "Pune, India",
    url: "https://example.com/papers/2",
    matchScore: 74,
    matchedSkills: ["Python"],
    missingSkills: [],
    status: "Applied",
    scrapedAt: Date.UTC(2026, 7, 20),
    appliedAt: Date.now(), // applied today — exercises the remaining-quota math
    autoApplied: true, // and exercises the Auto_Applied column
  },
  {
    _id: "job_3",
    source: "Web · Scholarships",
    opportunityType: "scholarship",
    organization: "Helios Foundation",
    title: "Merit Scholarship for Undergraduate STEM Students",
    location: "Remote / international",
    url: "https://example.com/scholarships/merit-stem",
    matchScore: 91,
    matchedSkills: ["Python"],
    missingSkills: [],
    deadline: "2026-11-30",
    status: "Shortlisted",
    scrapedAt: Date.UTC(2026, 8, 10),
  },
  {
    _id: "job_4",
    source: "Web · Government exams",
    opportunityType: "govt-exam",
    organization: "Public Service Commission",
    title: "Graduate Level Engineering Services Examination — Notification",
    location: "Nationwide",
    url: "https://example.com/exams/engineering-services",
    matchScore: 64,
    matchedSkills: [],
    missingSkills: [],
    deadline: "2027-01-20",
    status: "New",
    scrapedAt: Date.UTC(2026, 8, 11),
  },
];

const profile = {
  fullName: "Aarav Sharma",
  targetRoles: ["Software Engineer Intern", "Research Assistant"],
  minMatchScore: 70,
  maxApplicationsPerDay: 10,
};

/**
 * Minimal PDF text extractor used to prove the resume is machine-readable:
 * inflates each content stream and replays its text-showing operators in order.
 * This is a stand-in for what an ATS text extractor does.
 */
function extractPdfText(bytes: Uint8Array): string {
  const latin = Buffer.from(bytes).toString("latin1");
  const streams = collectStreams(latin);
  const pieces: string[] = [];

  for (const stream of streams) {
    // Only content streams hold text objects; font/xref/object streams are
    // binary and would otherwise contribute noise.
    if (!stream.includes("BT")) continue;
    let cursor = 0;
    while (cursor < stream.length) {
      const tj = stream.indexOf("Tj", cursor);
      if (tj === -1) break;
      // The operand right before Tj is either a hex string <41 42> or a
      // literal string (AB) — pdf-lib emits hex for standard-font text.
      const before = stream.slice(0, tj).replace(/\s+$/, "");
      if (before.endsWith(">")) {
        const open = before.lastIndexOf("<");
        if (open !== -1) pieces.push(decodeHexString(before.slice(open + 1, -1)));
      } else if (before.endsWith(")")) {
        const open = before.lastIndexOf("(");
        if (open !== -1)
          pieces.push(toWinAnsi(decodePdfString(before.slice(open + 1, -1))));
      }
      cursor = tj + 2;
    }
  }
  return pieces.join("\n");
}

/** Hex string literal: one byte per char, or UTF-16BE when it starts with FEFF. */
function decodeHexString(hex: string): string {
  const clean = hex.replace(/\s+/g, "");
  if (clean.length % 2 !== 0) return "";
  const bytes = Buffer.from(clean, "hex");
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return bytes.subarray(2).toString("utf16le").swap16();
  }
  return toWinAnsi(bytes.toString("latin1"));
}

/**
 * WinAnsiEncoding slots that differ from Latin-1. A real extractor applies this
 * table, otherwise typography like an em dash (0x97) reads as a control code.
 */
const WIN_ANSI: Record<number, string> = {
  0x82: "\u201A",
  0x83: "\u0192",
  0x84: "\u201E",
  0x85: "\u2026",
  0x86: "\u2020",
  0x87: "\u2021",
  0x88: "\u02C6",
  0x89: "\u2030",
  0x8a: "\u0160",
  0x8b: "\u2039",
  0x8c: "\u0152",
  0x8e: "\u017D",
  0x91: "\u2018",
  0x92: "\u2019",
  0x93: "\u201C",
  0x94: "\u201D",
  0x95: "\u2022",
  0x96: "\u2013",
  0x97: "\u2014",
  0x98: "\u02DC",
  0x99: "\u2122",
  0x9a: "\u0161",
  0x9b: "\u203A",
  0x9c: "\u0153",
  0x9e: "\u017E",
  0x9f: "\u0178",
};

function toWinAnsi(value: string): string {
  let out = "";
  for (const ch of value) {
    const code = ch.codePointAt(0)!;
    out += WIN_ANSI[code] ?? ch;
  }
  return out;
}

/** Every stream object in the file, inflated when it is Flate-compressed. */
function collectStreams(latin: string): string[] {
  const streams: string[] = [];
  const OPEN = "stream";
  const CLOSE = "endstream";
  let cursor = 0;

  while (cursor < latin.length) {
    const at = latin.indexOf(OPEN, cursor);
    if (at === -1) break;

    // "stream" must be a standalone token: at line start, followed by an EOL.
    // (Skipping this check matches the "stream" inside "endstream".)
    const before = latin[at - 1];
    const eol = latin.slice(at + OPEN.length, at + OPEN.length + 2);
    if (before !== "\n" && before !== "\r") {
      cursor = at + OPEN.length;
      continue;
    }
    if (!eol.startsWith("\n") && !eol.startsWith("\r\n")) {
      cursor = at + OPEN.length;
      continue;
    }

    const bodyStart = at + OPEN.length + (eol.startsWith("\r\n") ? 2 : 1);
    const end = latin.indexOf(CLOSE, bodyStart);
    if (end === -1) break;

    const chunk = latin.slice(bodyStart, end).replace(/\r?\n$/, "");
    try {
      streams.push(inflateSync(Buffer.from(chunk, "latin1")).toString("latin1"));
    } catch {
      streams.push(chunk); // stream was not compressed
    }
    cursor = end + CLOSE.length;
  }
  return streams;
}

/** Decode a PDF string literal's escapes the way a reader would. */
function decodePdfString(value: string): string {
  const escapes: Record<string, string> = {
    n: "\n",
    r: "\r",
    t: "\t",
    b: "\b",
    f: "\f",
  };
  let out = "";
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch !== "\\") {
      out += ch;
      continue;
    }
    const next = value[i + 1];
    if (next === undefined) break;
    if (next >= "0" && next <= "7") {
      let octal = "";
      let j = i + 1;
      while (j < value.length && octal.length < 3 && value[j] >= "0" && value[j] <= "7") {
        octal += value[j];
        j++;
      }
      out += String.fromCharCode(parseInt(octal, 8));
      i = j - 1;
      continue;
    }
    out += escapes[next] ?? next;
    i++;
  }
  return out;
}

async function loadWorkbook() {
  const bytes = await buildWorkbookBytes(profile, jobs);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(bytes));
  return { wb, bytes };
}

describe("Excel export", () => {
  test("produces a real xlsx with every required sheet", async () => {
    const { wb, bytes } = await loadWorkbook();
    expect(bytes.length).toBeGreaterThan(2000); // a real zip container
    expect(wb.worksheets.map((w) => w.name)).toEqual([...SHEET_NAMES]);
  });

  test("All sheet uses the required column order", async () => {
    const { wb } = await loadWorkbook();
    const header = wb.getWorksheet("All")!.getRow(1).values as unknown[];
    expect(header.slice(1)).toEqual(EXPORT_COLUMNS);
  });

  test("rows land in the right tab with mapped values", async () => {
    const { wb } = await loadWorkbook();
    const all = wb.getWorksheet("All")!;
    // Sorted by match score: the 91-scoring scholarship, then the 88 internship.
    expect(all.getRow(2).getCell(5).value).toBe(
      "Merit Scholarship for Undergraduate STEM Students",
    );

    const internship = all.getRow(3);
    expect(internship.getCell(5).value).toBe("Software Engineering Intern");
    expect(internship.getCell(8).value).toBe(88);
    expect(internship.getCell(9).value).toBe("TypeScript, React");
    expect(internship.getCell(10).value).toBe("GraphQL");
    expect(internship.getCell(11).value).toBe("2026-10-15");
    expect(internship.getCell(12).value).toBe("Shortlisted");
    expect(internship.getCell(13).value).toBe("2026-09-01");
    expect(internship.getCell(14).value).toBe("");
    expect(internship.getCell(15).value).toBe(""); // Auto_Applied: not this row
    expect(internship.getCell(16).value).toBe("Referral: Priya");

    expect(wb.getWorksheet("Internships")!.rowCount).toBe(2); // header + 1
    expect(wb.getWorksheet("Research")!.rowCount).toBe(2);
    expect(wb.getWorksheet("Jobs")!.rowCount).toBe(1); // header only
    expect(wb.getWorksheet("Shortlisted")!.rowCount).toBe(3);
    expect(wb.getWorksheet("Applied")!.rowCount).toBe(2);
    // Sections the boards do not carry get their own tabs and keep their rows.
    expect(wb.getWorksheet("Scholarships")!.rowCount).toBe(2);
    expect(wb.getWorksheet("Govt Exams")!.rowCount).toBe(2);
  });

  test("autopilot and new sections are visible in the sheet", async () => {
    const { wb } = await loadWorkbook();
    const applied = wb.getWorksheet("Applied")!;
    const row = applied.getRow(2);
    expect(row.getCell(15).value).toBe("Yes"); // sent by autopilot

    const scholarships = wb.getWorksheet("Scholarships")!;
    expect(scholarships.getRow(2).getCell(5).value).toBe(
      "Merit Scholarship for Undergraduate STEM Students",
    );
    expect(scholarships.getRow(2).getCell(3).value).toBe("scholarship");

    const exams = wb.getWorksheet("Govt Exams")!;
    expect(exams.getRow(2).getCell(3).value).toBe("govt-exam");
  });

  test("dashboard summary reports counts, cap and policy", async () => {
    const { wb } = await loadWorkbook();
    const summary = wb.getWorksheet("Dashboard Summary")!;
    const metrics = new Map<string, unknown>();
    const policies: string[] = [];
    summary.eachRow((row) => {
      const key = row.getCell(1).value;
      const value = row.getCell(2).value;
      if (typeof key !== "string" || !key) return;
      if (key === "Policy") policies.push(String(value));
      else metrics.set(key, value);
    });
    expect(metrics.get("Total tracked")).toBe(4);
    expect(metrics.get("Shortlisted")).toBe(2);
    expect(metrics.get("Applied")).toBe(1);
    expect(metrics.get("Internships")).toBe(1);
    expect(metrics.get("Research")).toBe(1);
    expect(metrics.get("Scholarships")).toBe(1);
    expect(metrics.get("Government exams")).toBe(1);
    expect(metrics.get("Daily application cap")).toBe(10);
    expect(metrics.get("Applications left today")).toBe(9);
    expect(metrics.get("Applied today")).toBe(1);
    expect(metrics.get("of which autopilot")).toBe(1);
    expect(metrics.get("Autopilot")).toBe("Off — every application is approved by hand");
    expect(policies.join(" ")).toContain("no anti-detection tooling");
    expect(policies.join(" ")).toContain("validator-clean");
    expect(policies.join(" ")).toContain("never filled or submitted");
  });

  test("the summary reflects an armed autopilot", async () => {
    const bytes = await buildWorkbookBytes(
      { ...profile, autoApplyEnabled: true, autoApplyMinScore: 88, autoApplyDailyLimit: 2 },
      jobs,
    );
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(bytes));
    const summary = wb.getWorksheet("Dashboard Summary")!;
    let autopilot = "";
    summary.eachRow((row) => {
      if (row.getCell(1).value === "Autopilot") autopilot = String(row.getCell(2).value);
    });
    expect(autopilot).toContain("Armed");
    expect(autopilot).toContain("min score 88");
    expect(autopilot).toContain("2/day");
  });

  test("empty pipeline still yields a valid workbook", async () => {
    const bytes = await buildWorkbookBytes(profile, []);
    expect(bytes.length).toBeGreaterThan(1000);
  });
});

describe("PDF resume export", () => {
  const doc = buildResumeDoc(
    {
      fullName: "Aarav Sharma",
      headline: "CS student — data & backend",
      email: "aarav@example.com",
      phone: "+91 90000 00000",
      location: "Pune, India",
      links: "github.com/aarav",
      major: "Computer Science",
      university: "University of Pune",
      graduationYear: "2027",
      gpa: "8.6",
      relevantCoursework: "Databases, Machine Learning",
      certifications: "AWS Cloud Practitioner",
    },
    {
      summary: "Computer Science student focused on Python data analysis.",
      skills: ["Python", "Pandas", "SQL"],
      bullets: [
        "Analyzed 50k rows of transit data in Python and Pandas",
        "Built ETL scripts in Python and SQL as a Data Science Intern",
      ],
    },
  );

  test("emits a genuine single-page PDF document", async () => {
    const bytes = await buildResumePdfBytes(doc);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(800);
    expect(bytes.length).toBeLessThan(200_000); // one page, not an image dump
  });

  test("a normal resume is exactly one page", async () => {
    const bytes = await buildResumePdfBytes(doc);
    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBe(1);
  });

  test("long content flows onto additional pages instead of overflowing", async () => {
    const longDoc = {
      ...doc,
      sections: [
        ...doc.sections,
        ...Array.from({ length: 5 }, (_, i) => ({
          heading: `Extra ${i}`,
          kind: "text" as const,
          lines: Array.from({ length: 15 }, (_, n) => `Line ${n} of section ${i}`),
        })),
      ],
    };
    const bytes = await buildResumePdfBytes(longDoc);
    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBeGreaterThanOrEqual(2);
    expect(bytes.length).toBeGreaterThan(800);
  });

  test("text is extractable in linear order — what an ATS parser reads", async () => {
    const bytes = await buildResumePdfBytes(doc);
    const text = extractPdfText(bytes);

    // Contact block and headings are present as real text (not an image).
    expect(text).toContain("Aarav Sharma");
    expect(text).toContain("aarav@example.com");
    expect(text).toContain("EDUCATION");
    expect(text).toContain("SKILLS");
    expect(text).toContain("EXPERIENCE & PROJECTS");
    expect(text).toContain("Analyzed 50k rows of transit data in Python and Pandas");

    // Order is linear: name before sections, education before skills.
    expect(text.indexOf("Aarav Sharma")).toBeLessThan(text.indexOf("EDUCATION"));
    expect(text.indexOf("EDUCATION")).toBeLessThan(text.indexOf("SKILLS"));
    expect(text.indexOf("SKILLS")).toBeLessThan(
      text.indexOf("EXPERIENCE & PROJECTS"),
    );

    // No garbled characters: no replacement glyphs and no control characters.
    // WinAnsi typography (·, —) decodes to the intended punctuation.
    expect(text).not.toContain("\uFFFD");
    expect(/\p{C}/u.test(text.replace(/[\n\t]/g, " "))).toBe(false);
    expect(text).toContain("Computer Science, University of Pune");
    expect(text).toContain("CS student — data & backend");
  });

  test("url-safe filename is derived from org and role", () => {
    expect(resumePdfFilename("Acme Cloud", "Software Engineering Intern")).toBe(
      "resume-acme-cloud-software-engineering-intern.pdf",
    );
    expect(resumePdfFilename("", "")).toBe("resume-tailored.pdf");
  });
});
