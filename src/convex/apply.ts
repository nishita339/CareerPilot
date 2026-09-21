import { getAuthUserId } from "@convex-dev/auth/server";
import { action, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { vly } from "../lib/vly-integrations";
import { asResumeDoc, renderResumeText } from "./resume";
import { checkCooldown } from "./cooldown";

const DEMO_EMAIL_DOMAINS =
  /@(demo-lab|acme-demo|nordic-demo|ferrous-demo|cobalt-demo)\.example$/i;

/** Human-approved email applications only. Nothing sends without Approved status. */
export const applyEmail = action({
  args: { jobId: v.id("jobs") },
  handler: async (
    ctx,
    { jobId },
  ): Promise<{
    sent: boolean;
    simulated: boolean;
    to: string;
    attachedPdf: string | null;
  }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in required.");
    const { profile, job, sentToday, prior } = await ctx.runQuery(
      internal.private.getApplyContext,
      { jobId },
    );
    if (!profile) throw new Error("Complete your Master Profile first.");

    // Hard policy gates, in order.
    if (job.status !== "Approved") {
      throw new Error(
        `Blocked: sending requires your explicit approval. Current status: "${job.status}".`,
      );
    }
    if (job.applyMode !== "email" || !job.applyEmail) {
      throw new Error(
        "This role has no verified apply email. Use the listing URL and submit manually.",
      );
    }
    if (!job.resumeHtml || !job.validationOk) {
      throw new Error(
        "Tailor the resume first — flagged claims must be reviewed before sending.",
      );
    }
    // One application per company per cooldown window (default 7 days, min 3).
    const cooldown = checkCooldown({
      organization: job.organization,
      prior,
      now: Date.now(),
      cooldownDays: profile.cooldownDays,
    });
    if (cooldown.blocked) {
      throw new Error(cooldown.reason);
    }

    if (sentToday >= profile.maxApplicationsPerDay) {
      throw new Error(
        `Daily cap reached (${sentToday}/${profile.maxApplicationsPerDay}). Low, slow, targeted volume — try tomorrow.`,
      );
    }

    // Attach the same ATS-friendly PDF the user reviewed, when it exists.
    const pdf = await ctx.runAction(internal.resumePdf.renderResumePdfBase64, {
      jobId,
    });

    const simulated = DEMO_EMAIL_DOMAINS.test(job.applyEmail);
    if (!simulated) {
      const result = await vly.email.send({
        to: job.applyEmail,
        subject: `Application: ${job.title} — ${profile.fullName}`,
        text: buildPlainText(profile, job),
        html: `<div style="font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5">${job.coverLetterHtml ?? ""}<hr/>${job.resumeHtml}</div>`,
        attachments: pdf
          ? [{ filename: pdf.filename, content: pdf.base64, encoding: "base64" }]
          : undefined,
      });
      if (!result.success) {
        throw new Error(result.error ?? "Email provider rejected the send");
      }
    }

    await ctx.runMutation(internal.private.markApplied, { jobId });
    return {
      sent: true,
      simulated,
      to: job.applyEmail,
      attachedPdf: pdf?.filename ?? null,
    };
  },
});

function buildPlainText(
  profile: { fullName: string; email: string; phone: string },
  job: {
    title: string;
    organization: string;
    resumeHtml?: string;
    resumeData?: unknown;
  },
): string {
  const doc = asResumeDoc(job.resumeData);
  const resume = doc ? renderResumeText(doc) : stripHtml(job.resumeHtml ?? "");
  return [
    "Hello,",
    "",
    `I am applying for the ${job.title} role at ${job.organization}.`,
    "",
    resume,
    "",
    `— ${profile.fullName} · ${profile.email} · ${profile.phone}`,
  ].join("\n");
}

function stripHtml(html: string): string {
  return html
    .replace(/<li>/g, "• ")
    .replace(/<br\s*\/?>/g, "\n")
    .replace(/<\/p>/g, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

/** Daily digest for the dashboard sidebar. */
export const digest = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId)
      return {
        shortlisted: 0,
        resumeReady: 0,
        awaitingApproval: 0,
        appliedToday: 0,
        dailyCap: 10,
      };
    const jobs = await ctx.db
      .query("jobs")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    let appliedToday = 0;
    for await (const a of ctx.db
      .query("activity")
      .withIndex("by_user", (q) => q.eq("userId", userId))) {
      if (a.action.startsWith("applied") && a.createdAt >= startOfDay.getTime())
        appliedToday++;
    }
    return {
      shortlisted: jobs.filter((j) => j.status === "Shortlisted").length,
      resumeReady: jobs.filter((j) => j.status === "Resume Ready").length,
      awaitingApproval: jobs.filter(
        (j) => j.status === "Resume Ready" && j.validationOk,
      ).length,
      appliedToday,
      dailyCap: profile?.maxApplicationsPerDay ?? 10,
    };
  },
});

/** Reset a mistaken pipeline state back to Shortlisted (human override). */
export const reopen = mutation({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, { jobId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in required.");
    const job = await ctx.db.get(jobId);
    if (!job || job.userId !== userId) throw new Error("Job not found.");
    if (["Applied", "Offer", "Interview"].includes(job.status)) {
      throw new Error(`Cannot reopen a job already "${job.status}".`);
    }
    await ctx.db.patch(jobId, {
      status: "Shortlisted",
      approvedAt: undefined,
      appliedAt: undefined,
    });
    await ctx.db.insert("activity", {
      userId,
      jobId,
      action: "reopened",
      detail: job.title,
      createdAt: Date.now(),
    });
    return { ok: true };
  },
});
