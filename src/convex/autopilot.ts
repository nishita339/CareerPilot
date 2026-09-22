// Autopilot: automatic email applications, on the user's explicit instruction.
//
// This is the one place the app acts without a per-role click, so the bounds
// are deliberately tight and visible:
//   · opt-in only (armed in Preferences, off by default)
//   · email-apply roles only — web forms are never filled or submitted
//   · only above the autopilot score, which can never be below 80
//   · only when the tailored resume passed the validator
//   · at most 3/day (default 2), on top of the general daily cap
//   · never two applications to the same company inside the cooldown window
// Every gate is the same code path the manual button uses (send.ts).

import { getAuthUserId } from "@convex-dev/auth/server";
import { action, internalAction, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  autopilotSettings,
  selectAutopilotCandidates,
  type AutopilotPlan,
} from "./autopilotRules";
import { isAutoApplicableType } from "./policy";

export interface AutopilotApplied {
  title: string;
  organization: string;
  to: string;
  simulated: boolean;
  matchScore: number;
}

export interface AutopilotReview {
  title: string;
  organization: string;
  reason: string;
}

export interface AutopilotReport {
  enabled: boolean;
  settings: { minScore: number; dailyLimit: number; types: string[] };
  availableSlots: number;
  applied: AutopilotApplied[];
  needsReview: AutopilotReview[];
  blocked: AutopilotReview[];
}

const EMPTY: AutopilotReport = {
  enabled: false,
  settings: { minScore: 0, dailyLimit: 0, types: [] },
  availableSlots: 0,
  applied: [],
  needsReview: [],
  blocked: [],
};

/** The button in the dashboard: run autopilot now, for me. */
export const runAutopilot = action({
  args: {},
  handler: async (ctx): Promise<AutopilotReport> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in required.");
    return await runFor(ctx, userId);
  },
});

/** The daily scheduler entry point (no auth identity). */
export const autopilotForUser = internalAction({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }): Promise<AutopilotReport> =>
    await runFor(ctx, userId),
});

/** What autopilot would do right now, without doing any of it. */
export const autopilotStatus = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const data = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (!data) return null;
    const settings = autopilotSettings(data);
    const jobs = await ctx.db
      .query("jobs")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const plan = selectAutopilotCandidates({
      profile: data,
      jobs: jobs.map((j) => ({
        jobId: String(j._id),
        title: j.title,
        organization: j.organization,
        status: j.status,
        matchScore: j.matchScore,
        opportunityType: j.opportunityType,
        applyMode: j.applyMode,
        applyEmail: j.applyEmail,
      })),
      prior: [],
      now: Date.now(),
      sentToday: 0,
      autoSentToday: 0,
      cap: Number.MAX_SAFE_INTEGER,
      cooldownDays: data.cooldownDays,
    });
    const queued = jobs.filter(
      (j) =>
        j.status === "Shortlisted" &&
        j.applyMode === "email" &&
        (j.matchScore ?? 0) >= settings.minScore &&
        settings.types.includes(j.opportunityType),
    ).length;
    return {
      enabled: settings.enabled,
      minScore: settings.minScore,
      dailyLimit: settings.dailyLimit,
      types: settings.types,
      /** Roles that already clear the autopilot bar. */
      queued,
      /** How many autopilot may still send today based on its own limit. */
      previewSlots: plan.availableSlots,
    };
  },
});

async function runFor(
  ctx: ActionCtx,
  userId: Id<"users">,
): Promise<AutopilotReport> {
  const data = await ctx.runQuery(internal.private.getAutopilotContext, {
    userId,
  });
  if (!data) return EMPTY;

  const plan: AutopilotPlan = selectAutopilotCandidates({
    profile: data.profile,
    jobs: data.jobs,
    prior: data.prior,
    now: Date.now(),
    sentToday: data.sentToday,
    autoSentToday: data.autoSentToday,
    cap: data.profile.maxApplicationsPerDay,
    cooldownDays: data.profile.cooldownDays,
  });

  if (!plan.enabled) return EMPTY;

  const report: AutopilotReport = {
    enabled: true,
    settings: {
      minScore: plan.settings.minScore,
      dailyLimit: plan.settings.dailyLimit,
      types: plan.settings.types,
    },
    availableSlots: plan.availableSlots,
    applied: [],
    needsReview: [],
    blocked: plan.skipped.map((s) => ({
      title: s.title,
      organization: s.organization,
      reason: s.reason,
    })),
  };

  for (const candidate of plan.candidates) {
    // Belt and braces: scholarships and exams are never auto-applied, whatever
    // the stored settings happen to say.
    if (!isAutoApplicableType(candidate.opportunityType)) continue;
    const jobId = candidate.jobId as Id<"jobs">;
    try {
      const tailored = await ctx.runAction(internal.tailor.tailorJobForUser, {
        userId,
        jobId,
      });
      if (!tailored.validationOk) {
        report.needsReview.push({
          title: candidate.title,
          organization: candidate.organization,
          reason: `Validator flagged ${tailored.validationNotes.length} claim${tailored.validationNotes.length === 1 ? "" : "s"} — review it and send by hand if it is honest.`,
        });
        await ctx.runMutation(internal.private.logActivity, {
          userId,
          jobId,
          action: "autopilot: needs review",
          detail: `${candidate.organization} — ${candidate.title}`,
          organization: candidate.organization,
        });
        continue;
      }
      await ctx.runMutation(internal.private.approveForAutopilot, {
        userId,
        jobId,
      });
      const result = await ctx.runAction(internal.send.dispatchApprovedSend, {
        userId,
        jobId,
        trigger: "autopilot",
      });
      report.applied.push({
        title: candidate.title,
        organization: candidate.organization,
        to: result.to,
        simulated: result.simulated,
        matchScore: candidate.matchScore,
      });
    } catch (err) {
      report.blocked.push({
        title: candidate.title,
        organization: candidate.organization,
        reason: err instanceof Error ? err.message : "send failed",
      });
      await ctx.runMutation(internal.private.logActivity, {
        userId,
        jobId,
        action: "autopilot: blocked",
        detail: `${candidate.organization} — ${candidate.title}: ${err instanceof Error ? err.message : "send failed"}`,
        organization: candidate.organization,
      });
    }
  }

  await ctx.runMutation(internal.private.logActivity, {
    userId,
    action: "autopilot run",
    detail: `${report.applied.length} sent · ${report.needsReview.length} needing review · score floor ${plan.settings.minScore} · limit ${plan.settings.dailyLimit}/day`,
  });

  return report;
}
