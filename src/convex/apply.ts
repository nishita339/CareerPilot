import { getAuthUserId } from "@convex-dev/auth/server";
import { action, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { SendResult } from "./send";

/**
 * The button you press. All the gates live in `send.dispatchApprovedSend`, so
 * the human path and the autopilot path can never drift apart: approval,
 * verified email address, validator verdict, company cooldown, daily cap.
 */
export const applyEmail = action({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, { jobId }): Promise<SendResult> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in required.");
    return await ctx.runAction(internal.send.dispatchApprovedSend, {
      userId,
      jobId,
      trigger: "manual",
    });
  },
});

/** Daily digest stats for the dashboard sidebar. */
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
        autoAppliedToday: 0,
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
    let autoAppliedToday = 0;
    for await (const a of ctx.db
      .query("activity")
      .withIndex("by_user", (q) => q.eq("userId", userId))) {
      if (!a.action.startsWith("applied") || a.createdAt < startOfDay.getTime()) {
        continue;
      }
      appliedToday++;
      if (a.action.includes("autopilot")) autoAppliedToday++;
    }
    return {
      shortlisted: jobs.filter((j) => j.status === "Shortlisted").length,
      resumeReady: jobs.filter((j) => j.status === "Resume Ready").length,
      awaitingApproval: jobs.filter(
        (j) => j.status === "Resume Ready" && j.validationOk,
      ).length,
      appliedToday,
      autoAppliedToday,
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
