"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import { action, internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { asResumeDoc } from "./resume";
import { buildResumePdf, pdfWarnings, resumePdfFilename } from "./pdf";

export interface PdfExportResult {
  url: string | null;
  filename: string;
  /** Non-fatal notes, e.g. characters adjusted for the Latin-only PDF font. */
  warnings: string[];
}

/** Public: build the PDF, store it, hand back a download URL. */
export const exportResumePdf = action({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, { jobId }): Promise<PdfExportResult> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in required.");
    const { job } = await ctx.runQuery(internal.private.getProfileAndJob, {
      jobId,
    });
    if (!job) throw new Error("Job not found.");
    const doc = asResumeDoc(job.resumeData);
    if (!doc) {
      throw new Error("Tailor the resume first — there is no PDF to export yet.");
    }

    const built = await buildResumePdf(doc);
    const filename = resumePdfFilename(job.organization, job.title);
    const storageId = await ctx.storage.store(
      new Blob([built.bytes as unknown as BlobPart], { type: "application/pdf" }),
    );
    const url = await ctx.storage.getUrl(storageId);

    await ctx.runMutation(internal.private.logActivity, {
      userId,
      jobId,
      action: "exported resume PDF",
      detail: job.title,
    });

    return { url, filename, warnings: pdfWarnings(built) };
  },
});

/** Internal: same bytes as base64, so an approved application can attach it. */
export const renderResumePdfBase64 = internalAction({
  args: { jobId: v.id("jobs") },
  handler: async (
    ctx,
    { jobId },
  ): Promise<{ base64: string; filename: string; warnings: string[] } | null> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in required.");
    const { job } = await ctx.runQuery(internal.private.getProfileAndJob, {
      jobId,
    });
    if (!job) return null;
    const doc = asResumeDoc(job.resumeData);
    if (!doc) return null;
    const built = await buildResumePdf(doc);
    return {
      base64: Buffer.from(built.bytes).toString("base64"),
      filename: resumePdfFilename(job.organization, job.title),
      warnings: pdfWarnings(built),
    };
  },
});
