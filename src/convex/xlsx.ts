"use node";

// Pure builder: pipeline rows -> Student_Applications_Master.xlsx bytes.
// Kept free of Convex runtime types so it can be unit-tested directly.
import ExcelJS from "exceljs";

export interface ExportJob {
  _id: string;
  source: string;
  opportunityType: string;
  organization: string;
  title: string;
  location?: string;
  url: string;
  matchScore?: number;
  matchedSkills?: string[];
  missingSkills?: string[];
  deadline?: string;
  status: string;
  scrapedAt: number;
  appliedAt?: number;
  notes?: string;
}

export interface ExportProfile {
  fullName: string;
  targetRoles: string[];
  minMatchScore: number;
  maxApplicationsPerDay: number;
}

export const SHEET_NAMES = [
  "All",
  "Jobs",
  "Internships",
  "Research",
  "Shortlisted",
  "Applied",
  "Dashboard Summary",
] as const;

const COLUMNS: { header: string; width: number }[] = [
  { header: "Job_ID", width: 26 },
  { header: "Platform_Source", width: 18 },
  { header: "Type", width: 12 },
  { header: "Organization", width: 28 },
  { header: "Title", width: 44 },
  { header: "Location", width: 24 },
  { header: "Link", width: 46 },
  { header: "Match_Score", width: 12 },
  { header: "Matched_Skills", width: 34 },
  { header: "Missing_Skills", width: 34 },
  { header: "Deadline", width: 14 },
  { header: "Status", width: 16 },
  { header: "Date_Scraped", width: 20 },
  { header: "Date_Applied", width: 20 },
  { header: "Notes", width: 40 },
];

export const EXPORT_COLUMNS = COLUMNS.map((c) => c.header);

const iso = (ts?: number) => (ts ? new Date(ts).toISOString().slice(0, 10) : "");

function rowsFor(jobs: ExportJob[]): unknown[][] {
  return jobs.map((j) => [
    j._id,
    j.source,
    j.opportunityType,
    j.organization,
    j.title,
    j.location ?? "",
    j.url,
    j.matchScore ?? "",
    (j.matchedSkills ?? []).join(", "),
    (j.missingSkills ?? []).join(", "),
    j.deadline ?? "",
    j.status,
    iso(j.scrapedAt),
    iso(j.appliedAt),
    j.notes ?? "",
  ]);
}

function addJobsSheet(wb: ExcelJS.Workbook, name: string, jobs: ExportJob[]) {
  const sheet = wb.addWorksheet(name);
  sheet.columns = COLUMNS.map((c) => ({ header: c.header, width: c.width }));
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  for (const row of rowsFor(jobs)) sheet.addRow(row);
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: COLUMNS.length },
  };
}

export async function buildWorkbookBytes(
  profile: ExportProfile,
  jobs: ExportJob[],
): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "CareerPilot";
  wb.created = new Date();

  const sorted = [...jobs].sort(
    (a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0),
  );
  addJobsSheet(wb, "All", sorted);
  addJobsSheet(wb, "Jobs", sorted.filter((j) => j.opportunityType === "job"));
  addJobsSheet(
    wb,
    "Internships",
    sorted.filter((j) => j.opportunityType === "internship"),
  );
  addJobsSheet(
    wb,
    "Research",
    sorted.filter((j) => ["research", "fellowship"].includes(j.opportunityType)),
  );
  addJobsSheet(wb, "Shortlisted", sorted.filter((j) => j.status === "Shortlisted"));
  addJobsSheet(wb, "Applied", sorted.filter((j) => j.status === "Applied"));

  // ---- Dashboard Summary ----
  const summary = wb.addWorksheet("Dashboard Summary");
  summary.columns = [
    { header: "Metric", width: 34 },
    { header: "Value", width: 46 },
  ];
  summary.getRow(1).font = { bold: true };

  const count = (status: string) => jobs.filter((j) => j.status === status).length;
  const typeCount = (type: string) =>
    jobs.filter((j) => j.opportunityType === type).length;
  const scored = jobs.filter((j) => j.matchScore !== undefined);
  const avgScore = scored.length
    ? Math.round(
        scored.reduce((sum, j) => sum + (j.matchScore ?? 0), 0) / scored.length,
      )
    : 0;
  const sources = [...new Set(jobs.map((j) => j.source))];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const appliedToday = jobs.filter((j) => (j.appliedAt ?? 0) >= today.getTime())
    .length;

  const summaryRows: [string, string | number][] = [
    ["Generated", new Date().toISOString()],
    ["Candidate", profile.fullName],
    ["Target roles", profile.targetRoles.join(", ")],
    ["Minimum match score", profile.minMatchScore],
    ["Daily application cap", profile.maxApplicationsPerDay],
    ["", ""],
    ["Total tracked", jobs.length],
    ["Shortlisted", count("Shortlisted")],
    ["Resume ready (awaiting approval)", count("Resume Ready")],
    ["Approved", count("Approved")],
    ["Applied", count("Applied")],
    ["Interview", count("Interview")],
    ["Offer", count("Offer")],
    ["Rejected / below threshold", count("Rejected")],
    ["New (unscored or below threshold)", count("New")],
    ["", ""],
    ["Jobs", typeCount("job")],
    ["Internships", typeCount("internship")],
    ["Research", typeCount("research")],
    ["Fellowships", typeCount("fellowship")],
    ["", ""],
    ["Average match score", avgScore],
    ["Applied today", appliedToday],
    [
      "Applications left today",
      Math.max(0, profile.maxApplicationsPerDay - appliedToday),
    ],
    ["", ""],
    ["Platform sources", sources.join(", ")],
    [
      "Policy",
      "Public APIs and public boards only · no login-wall scraping · no anti-detection tooling",
    ],
    [
      "Policy",
      "Email applications only after explicit approval; web forms stay manual",
    ],
    [
      "Privacy",
      "All rows belong to your account and are removed by 'Delete all my data'",
    ],
  ];
  for (const row of summaryRows) summary.addRow(row);

  return new Uint8Array(await wb.xlsx.writeBuffer());
}

export const XLSX_FILENAME = "Student_Applications_Master.xlsx";
