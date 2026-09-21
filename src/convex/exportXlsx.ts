"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import ExcelJS from "exceljs";
import type { Doc } from "./_generated/dataModel";

const COLUMNS = [
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
] as const;

function iso(ts?: number): string {
  return ts ? new Date(ts).toISOString().slice(0, 10) : "";
}

function rowsFor(jobs: Doc<"jobs">[]): unknown[][] {
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

function addSheet(wb: ExcelJS.Workbook, name: string, jobs: Doc<"jobs">[]) {
  const sheet = wb.addWorksheet(name);
  sheet.columns = COLUMNS.map((c) => ({ header: c.header, width: c.width }));
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  for (const row of rowsFor(jobs)) sheet.addRow(row);
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: COLUMNS.length },
  };
  return sheet;
}

/** Builds Student_Applications_Master.xlsx and stores it in Convex storage. */
export const exportExcel = action({
  args: {},
  handler: async (
    ctx,
  ): Promise<{ url: string | null; filename: string; rows: number }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in required.");
    const { profile, jobs } = await ctx.runQuery(internal.private.getMyData, {});
    if (!profile) throw new Error("Complete your Master Profile first.");

    const wb = new ExcelJS.Workbook();
    wb.creator = "CareerPilot";
    wb.created = new Date();

    const sorted = [...jobs].sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0));
    addSheet(wb, "All", sorted);
    addSheet(wb, "Jobs", sorted.filter((j) => j.opportunityType === "job"));
    addSheet(
      wb,
      "Internships",
      sorted.filter((j) => j.opportunityType === "internship"),
    );
    addSheet(
      wb,
      "Research",
      sorted.filter((j) => ["research", "fellowship"].includes(j.opportunityType)),
    );
    addSheet(wb, "Shortlisted", sorted.filter((j) => j.status === "Shortlisted"));
    addSheet(wb, "Applied", sorted.filter((j) => j.status === "Applied"));

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
      ["Applied today", jobs.filter((j) => (j.appliedAt ?? 0) >= today.getTime()).length],
      ["Applications left today", Math.max(0, profile.maxApplicationsPerDay - jobs.filter((j) => (j.appliedAt ?? 0) >= today.getTime()).length)],
      ["", ""],
      ["Platform sources", sources.join(", ")],
      [
        "Policy",
        "Public APIs and public boards only · no login-wall scraping · no anti-detection tooling",
      ],
      ["Policy", "Email applications only after explicit approval; web forms stay manual"],
      ["Privacy", "All rows here belong to your account and are deleted by 'Delete all my data'"],
    ];
    for (const row of summaryRows) summary.addRow(row);

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const storageId = await ctx.storage.store(blob);
    const url = await ctx.storage.getUrl(storageId);

    await ctx.runMutation(internal.private.logActivity, {
      userId,
      action: "exported Excel",
      detail: `Student_Applications_Master.xlsx · ${jobs.length} rows`,
    });

    return { url, filename: "Student_Applications_Master.xlsx", rows: jobs.length };
  },
});
