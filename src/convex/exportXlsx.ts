"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { buildWorkbookBytes, XLSX_FILENAME, type ExportJob } from "./xlsx";

export interface ExcelExportResult {
  url: string | null;
  filename: string;
  rows: number;
}

/** Builds Student_Applications_Master.xlsx and stores it in Convex storage. */
export const exportExcel = action({
  args: {},
  handler: async (ctx): Promise<ExcelExportResult> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in required.");
    const { profile, jobs } = await ctx.runQuery(internal.private.getMyData, {});
    if (!profile) throw new Error("Complete your Master Profile first.");

    const rows: ExportJob[] = jobs.map((j) => ({
      _id: j._id,
      source: j.source,
      opportunityType: j.opportunityType,
      organization: j.organization,
      title: j.title,
      location: j.location,
      url: j.url,
      matchScore: j.matchScore,
      matchedSkills: j.matchedSkills,
      missingSkills: j.missingSkills,
      deadline: j.deadline,
      status: j.status,
      scrapedAt: j.scrapedAt,
      appliedAt: j.appliedAt,
      notes: j.notes,
    }));

    const bytes = await buildWorkbookBytes(
      {
        fullName: profile.fullName,
        targetRoles: profile.targetRoles,
        minMatchScore: profile.minMatchScore,
        maxApplicationsPerDay: profile.maxApplicationsPerDay,
      },
      rows,
    );

    const storageId = await ctx.storage.store(
      new Blob([bytes as unknown as BlobPart], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    );
    const url = await ctx.storage.getUrl(storageId);

    await ctx.runMutation(internal.private.logActivity, {
      userId,
      action: "exported Excel",
      detail: `${XLSX_FILENAME} · ${rows.length} rows`,
    });

    return { url, filename: XLSX_FILENAME, rows: rows.length };
  },
});
