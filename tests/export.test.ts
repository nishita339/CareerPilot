import { describe, expect, test } from "bun:test";
import ExcelJS from "exceljs";
import {
  buildWorkbookBytes,
  EXPORT_COLUMNS,
  SHEET_NAMES,
  type ExportJob,
} from "../src/convex/xlsx";
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
  },
];

const profile = {
  fullName: "Aarav Sharma",
  targetRoles: ["Software Engineer Intern", "Research Assistant"],
  minMatchScore: 70,
  maxApplicationsPerDay: 10,
};

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
    const first = all.getRow(2);
    // Sorted by match score: the 88-scoring internship comes first.
    expect(first.getCell(5).value).toBe("Software Engineering Intern");
    expect(first.getCell(8).value).toBe(88);
    expect(first.getCell(9).value).toBe("TypeScript, React");
    expect(first.getCell(10).value).toBe("GraphQL");
    expect(first.getCell(11).value).toBe("2026-10-15");
    expect(first.getCell(12).value).toBe("Shortlisted");
    expect(first.getCell(13).value).toBe("2026-09-01");
    expect(first.getCell(14).value).toBe("");
    expect(first.getCell(15).value).toBe("Referral: Priya");

    expect(wb.getWorksheet("Internships")!.rowCount).toBe(2); // header + 1
    expect(wb.getWorksheet("Research")!.rowCount).toBe(2);
    expect(wb.getWorksheet("Jobs")!.rowCount).toBe(1); // header only
    expect(wb.getWorksheet("Shortlisted")!.rowCount).toBe(2);
    expect(wb.getWorksheet("Applied")!.rowCount).toBe(2);
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
    expect(metrics.get("Total tracked")).toBe(2);
    expect(metrics.get("Shortlisted")).toBe(1);
    expect(metrics.get("Applied")).toBe(1);
    expect(metrics.get("Internships")).toBe(1);
    expect(metrics.get("Research")).toBe(1);
    expect(metrics.get("Daily application cap")).toBe(10);
    expect(metrics.get("Applications left today")).toBe(9);
    expect(metrics.get("Applied today")).toBe(1);
    expect(policies.join(" ")).toContain("no anti-detection tooling");
    expect(policies.join(" ")).toContain("after explicit approval");
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

  test("url-safe filename is derived from org and role", () => {
    expect(resumePdfFilename("Acme Cloud", "Software Engineering Intern")).toBe(
      "resume-acme-cloud-software-engineering-intern.pdf",
    );
    expect(resumePdfFilename("", "")).toBe("resume-tailored.pdf");
  });
});
