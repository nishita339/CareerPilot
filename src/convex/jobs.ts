import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { PIPELINE_STATUSES, type PipelineStatus } from "./policy";
import { scoreMatch } from "./matcher";
import { similarity } from "./skills";

const ALLOWED = new Set<string>(PIPELINE_STATUSES);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function log(
  ctx: any,
  userId: any,
  action: string,
  jobId?: any,
  detail?: string,
  organization?: string,
) {
  await ctx.db.insert("activity", {
    userId,
    jobId: jobId ?? undefined,
    action,
    detail: detail ?? undefined,
    organization: organization ?? undefined,
    createdAt: Date.now(),
  });
}

export const listJobs = query({
  args: { status: v.optional(v.string()) },
  handler: async (ctx, { status }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    if (status && ALLOWED.has(status)) {
      return await ctx.db
        .query("jobs")
        .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", status))
        .collect();
    }
    return await ctx.db
      .query("jobs")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
  },
});

export const getActivity = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query("activity")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(60);
  },
});

/** Deterministic pass: rescore every job against the current profile. */
export const scoreAll = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in required.");
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (!profile) throw new Error("Complete your Master Profile first.");

    let scored = 0;
    let shortlisted = 0;
    for await (const job of ctx.db
      .query("jobs")
      .withIndex("by_user", (q) => q.eq("userId", userId))) {
      if (["Applied", "Approved", "Interview", "Offer"].includes(job.status)) {
        continue; // never re-touch advanced pipeline stages
      }
      const result = scoreMatch(profile, job._id, job);
      const passes = result.score >= profile.minMatchScore;
      const status: PipelineStatus = passes ? "Shortlisted" : "Rejected";
      await ctx.db.patch(job._id, {
        matchScore: result.score,
        matchedSkills: result.matchedSkills,
        missingSkills: result.missingSkills,
        matchExplanation: result.explanation,
        status: job.status === "New" ? status : job.status,
      });
      scored++;
      if (passes && job.status === "New") shortlisted++;
    }
    await log(ctx, userId, "scored", undefined, `${scored} jobs rescored`);
    return { scored, shortlisted };
  },
});

/** Human decision: move a job to a chosen pipeline status. */
export const setStatus = mutation({
  args: { jobId: v.id("jobs"), status: v.string(), note: v.optional(v.string()) },
  handler: async (ctx, { jobId, status, note }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in required.");
    const job = await ctx.db.get(jobId);
    if (!job || job.userId !== userId) throw new Error("Job not found.");
    if (!ALLOWED.has(status)) throw new Error("Unknown status.");
    await ctx.db.patch(jobId, {
      status,
      approvedAt: status === "Approved" ? Date.now() : job.approvedAt,
      notes: note ?? job.notes,
    });
    await log(ctx, userId, `status → ${status}`, jobId, job.title);
    return { ok: true };
  },
});

export const saveNotes = mutation({
  args: { jobId: v.id("jobs"), notes: v.string() },
  handler: async (ctx, { jobId, notes }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in required.");
    const job = await ctx.db.get(jobId);
    if (!job || job.userId !== userId) throw new Error("Job not found.");
    await ctx.db.patch(jobId, { notes });
    return { ok: true };
  },
});

/** Manual add (e.g., you found a role yourself and want it in the pipeline). */
export const addManualJob = mutation({
  args: {
    title: v.string(),
    organization: v.string(),
    url: v.optional(v.string()),
    location: v.optional(v.string()),
    opportunityType: v.string(),
    description: v.optional(v.string()),
    applyEmail: v.optional(v.string()),
    deadline: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in required.");
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    const applyMode =
      args.applyEmail && /.+@.+\..+/.test(args.applyEmail) ? "email" : "form";
    const jobId = await ctx.db.insert("jobs", {
      userId,
      source: "Manual",
      url: args.url?.trim() || `manual://${encodeURIComponent(args.organization)}/${Date.now()}`,
      title: args.title.trim(),
      organization: args.organization.trim(),
      location: args.location?.trim() || undefined,
      remoteOk: /remote/i.test(args.location ?? ""),
      opportunityType: args.opportunityType,
      description: args.description?.trim() || undefined,
      applyEmail: args.applyEmail?.trim() || undefined,
      deadline: args.deadline?.trim() || undefined,
      applyMode,
      status: "New",
      scrapedAt: Date.now(),
    });
    if (profile) {
      const created = await ctx.db.get(jobId);
      if (created) {
        const result = scoreMatch(profile, jobId, created);
        await ctx.db.patch(jobId, {
          matchScore: result.score,
          matchedSkills: result.matchedSkills,
          missingSkills: result.missingSkills,
          matchExplanation: result.explanation,
          status: result.score >= profile.minMatchScore ? "Shortlisted" : "New",
        });
      }
    }
    await log(ctx, userId, "added", jobId, args.title);
    return jobId;
  },
});

/**
 * Human override: you submitted this one yourself on the employer's site.
 * Recording it matters — the daily cap and the company cooldown read the audit
 * trail, so a hand-submitted application must appear there too.
 */
export const markAppliedManually = mutation({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, { jobId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in required.");
    const job = await ctx.db.get(jobId);
    if (!job || job.userId !== userId) throw new Error("Job not found.");
    if (["Applied", "Interview", "Offer"].includes(job.status)) {
      throw new Error(`Already recorded as "${job.status}".`);
    }
    const now = Date.now();
    await ctx.db.patch(jobId, { status: "Applied", appliedAt: now });
    await log(ctx, userId, "applied (manual)", jobId, job.title, job.organization);
    return { ok: true, appliedAt: now };
  },
});

/** Fuzzy dedupe inside collect (title+org+location) — exported for tests-ish reuse. */
export function isDuplicate(
  a: { title: string; organization: string; location?: string },
  b: { title: string; organization: string; location?: string },
): boolean {
  return (
    similarity(a.organization, b.organization) > 0.82 &&
    similarity(a.title, b.title) > 0.7
  );
}
