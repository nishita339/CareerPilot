// Internal Convex functions shared by the collect/tailor/apply actions.
// Kept in a separate module so public action modules never self-reference.
import { getAuthUserId } from "@convex-dev/auth/server";
import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { scoreMatch } from "./matcher";
import { similarity } from "./skills";

/** One read for the tailor flow: profile + job. */
export const getProfileAndJob = internalQuery({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, { jobId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { profile: null, job: null };
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    const job = await ctx.db.get(jobId);
    if (!job || job.userId !== userId) return { profile, job: null };
    return { profile, job };
  },
});

export const saveTailored = internalMutation({
  args: {
    jobId: v.id("jobs"),
    resumeHtml: v.string(),
    coverLetterHtml: v.string(),
    resumeVersion: v.number(),
    validationOk: v.boolean(),
    validationNotes: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in required.");
    const job = await ctx.db.get(args.jobId);
    if (!job || job.userId !== userId) throw new Error("Job not found.");
    await ctx.db.patch(args.jobId, {
      resumeHtml: args.resumeHtml,
      coverLetterHtml: args.coverLetterHtml,
      resumeVersion: args.resumeVersion,
      validationOk: args.validationOk,
      validationNotes: args.validationNotes || undefined,
      status: "Resume Ready",
    });
    await ctx.db.insert("activity", {
      userId,
      jobId: args.jobId,
      action: args.validationOk
        ? `tailored (v${args.resumeVersion}, validated)`
        : `tailored (v${args.resumeVersion}, flagged)`,
      detail: job.title,
      createdAt: Date.now(),
    });
  },
});

/** One read for the apply flow: profile, job, applications sent today. */
export const getApplyContext = internalQuery({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, { jobId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in required.");
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    const job = await ctx.db.get(jobId);
    if (!job || job.userId !== userId) throw new Error("Job not found.");
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    let sentToday = 0;
    for await (const a of ctx.db
      .query("activity")
      .withIndex("by_user", (q) => q.eq("userId", userId))) {
      if (a.action.startsWith("applied") && a.createdAt >= startOfDay.getTime())
        sentToday++;
    }
    return { profile, job, sentToday };
  },
});

export const markApplied = internalMutation({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, { jobId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in required.");
    const job = await ctx.db.get(jobId);
    if (!job || job.userId !== userId) throw new Error("Job not found.");
    if (job.status !== "Approved") {
      throw new Error("Blocked: status changed after approval.");
    }
    await ctx.db.patch(jobId, { status: "Applied", appliedAt: Date.now() });
    await ctx.db.insert("activity", {
      userId,
      jobId,
      action: "applied (email)",
      detail: job.title,
      createdAt: Date.now(),
    });
  },
});

const RawJobValidator = v.object({
  source: v.string(),
  externalId: v.optional(v.string()),
  title: v.string(),
  organization: v.string(),
  location: v.optional(v.string()),
  remoteOk: v.boolean(),
  url: v.string(),
  description: v.optional(v.string()),
  applyEmail: v.optional(v.string()),
  opportunityType: v.string(),
  publishedAt: v.optional(v.number()),
});

/** Upsert collector results with fuzzy dedupe + blacklist + auto-scoring. */
export const ingestJobs = internalMutation({
  args: { jobs: v.array(RawJobValidator) },
  handler: async (ctx, { jobs }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in required.");

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    const existing = await ctx.db
      .query("jobs")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const blacklist = (profile?.blacklistCompanies ?? "")
      .split(/[,\n]/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    let inserted = 0;
    for (const raw of jobs) {
      const urlKey = raw.url.replace(/[#?].*$/, "");
      const isDupe = existing.some(
        (e) =>
          e.url.replace(/[#?].*$/, "") === urlKey ||
          (raw.externalId !== undefined &&
            e.externalId === raw.externalId &&
            e.source === raw.source) ||
          (e.organization.toLowerCase() === raw.organization.toLowerCase() &&
            (e.title.toLowerCase() === raw.title.toLowerCase() ||
              similarity(e.title, raw.title) > 0.82)),
      );
      const blacklisted = blacklist.some((b) =>
        raw.organization.toLowerCase().includes(b),
      );
      if (isDupe || blacklisted) continue;

      const jobId = await ctx.db.insert("jobs", {
        userId,
        source: raw.source,
        externalId: raw.externalId,
        url: raw.url,
        title: raw.title,
        organization: raw.organization,
        location: raw.location,
        remoteOk: raw.remoteOk,
        opportunityType: raw.opportunityType,
        description: raw.description,
        applyEmail: raw.applyEmail,
        applyMode: raw.applyEmail ? "email" : "manual",
        status: "New",
        scrapedAt: Date.now(),
      });
      const job = await ctx.db.get(jobId);
      if (profile && job) {
        const result = scoreMatch(profile, jobId, job);
        await ctx.db.patch(jobId, {
          matchScore: result.score,
          matchedSkills: result.matchedSkills,
          missingSkills: result.missingSkills,
          matchExplanation: result.explanation,
          status: result.score >= profile.minMatchScore ? "Shortlisted" : "New",
        });
      }
      existing.push({ ...raw, userId, _id: jobId, _creationTime: Date.now() } as never);
      inserted++;
    }
    return { inserted };
  },
});
