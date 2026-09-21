// Internal Convex functions shared by the collect/tailor/apply/export/digest
// actions. Kept in a separate module so public action modules never
// self-reference (which would make their inferred types circular).
import { getAuthUserId } from "@convex-dev/auth/server";
import { internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { scoreMatch } from "./matcher";
import { isBlacklisted, isDuplicate, parseBlacklist } from "./dedupe";
import {
  buildPriorApplications,
  countApplicationsSince,
} from "./cooldown";
import { isDueWithin, parseDeadlineValue, daysUntil } from "./deadlines";

/* ------------------------------- raw jobs -------------------------------- */

export const rawJobValidator = v.object({
  source: v.string(),
  externalId: v.optional(v.string()),
  title: v.string(),
  organization: v.string(),
  location: v.optional(v.string()),
  remoteOk: v.boolean(),
  url: v.string(),
  description: v.optional(v.string()),
  applyEmail: v.optional(v.string()),
  deadline: v.optional(v.string()),
  opportunityType: v.string(),
  publishedAt: v.optional(v.number()),
});

type RawJobInput = {
  source: string;
  externalId?: string;
  title: string;
  organization: string;
  location?: string;
  remoteOk: boolean;
  url: string;
  description?: string;
  applyEmail?: string;
  deadline?: string;
  opportunityType: string;
  publishedAt?: number;
};

/* ------------------------------ shared reads ----------------------------- */

async function loadUserData(ctx: QueryCtx | MutationCtx, userId: Id<"users">) {
  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
  const jobs = await ctx.db
    .query("jobs")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  return { profile, jobs };
}

/** One read for the tailor flow: profile + job. */
export const getProfileAndJob = internalQuery({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, { jobId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { profile: null, job: null };
    const { profile } = await loadUserData(ctx, userId);
    const job = await ctx.db.get(jobId);
    if (!job || job.userId !== userId) return { profile, job: null };
    return { profile, job };
  },
});

/** Profile + every job for the signed-in user (Excel export, digests). */
export const getMyData = internalQuery({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in required.");
    return await loadUserData(ctx, userId);
  },
});

/** Profile + every job for an explicit user (scheduled runs). */
export const getDataForUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => await loadUserData(ctx, userId),
});

/** All profiles — used by the daily scheduled pipeline. */
export const listProfiles = internalQuery({
  args: {},
  handler: async (ctx) => await ctx.db.query("profiles").collect(),
});

/* ------------------------------- tailoring ------------------------------- */

export const saveTailored = internalMutation({
  args: {
    jobId: v.id("jobs"),
    resumeHtml: v.string(),
    resumeData: v.any(),
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
      resumeData: args.resumeData,
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

/* --------------------------------- apply --------------------------------- */

/**
 * One read for the apply flow: profile, job, applications sent today, and the
 * history the company cooldown needs.
 */
export const getApplyContext = internalQuery({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, { jobId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in required.");
    const { profile, jobs } = await loadUserData(ctx, userId);
    const job = jobs.find((j) => j._id === jobId);
    if (!job) throw new Error("Job not found.");

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const orgByJob = new Map(jobs.map((j) => [String(j._id), j.organization]));

    // The audit trail is the single source of truth for both the daily cap and
    // the company cooldown, so applies recorded by hand count exactly like
    // ones this app sent.
    const activity: {
      action: string;
      createdAt: number;
      organization?: string;
      jobId?: string;
    }[] = [];
    for await (const a of ctx.db
      .query("activity")
      .withIndex("by_user", (q) => q.eq("userId", userId))) {
      activity.push({
        action: a.action,
        createdAt: a.createdAt,
        organization: a.organization,
        jobId: a.jobId ? String(a.jobId) : undefined,
      });
    }
    const sentToday = countApplicationsSince(activity, startOfDay.getTime());
    const prior = buildPriorApplications({
      activity,
      organizationByJobId: orgByJob,
    });
    return { profile, job, sentToday, prior };
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
    const now = Date.now();
    await ctx.db.patch(jobId, { status: "Applied", appliedAt: now });
    await ctx.db.insert("activity", {
      userId,
      jobId,
      action: "applied (email)",
      detail: job.title,
      organization: job.organization,
      createdAt: now,
    });
  },
});

/* -------------------------------- ingest --------------------------------- */

interface IngestResult {
  inserted: number;
  duplicates: number;
  blacklisted: number;
}

async function ingestForUser(
  ctx: MutationCtx,
  userId: Id<"users">,
  jobs: RawJobInput[],
): Promise<IngestResult> {
  const { profile, jobs: existing } = await loadUserData(ctx, userId);
  const blacklist = parseBlacklist(profile?.blacklistCompanies);

  let inserted = 0;
  let duplicates = 0;
  let blacklisted = 0;

  for (const raw of jobs) {
    const candidate = {
      title: raw.title,
      organization: raw.organization,
      url: raw.url,
      externalId: raw.externalId,
      source: raw.source,
    };
    if (isBlacklisted(raw.organization, blacklist)) {
      blacklisted++;
      continue;
    }
    if (
      existing.some((e) =>
        isDuplicate(candidate, {
          title: e.title,
          organization: e.organization,
          url: e.url,
          externalId: e.externalId,
          source: e.source,
        }),
      )
    ) {
      duplicates++;
      continue;
    }

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
      applyMode: raw.applyEmail ? "email" : "form",
      status: "New",
      deadline: raw.deadline,
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
    existing.push({ ...raw, userId, _id: jobId } as never);
    inserted++;
  }

  return { inserted, duplicates, blacklisted };
}

/** Ingest for the signed-in user (the interactive collect action). */
export const ingestJobs = internalMutation({
  args: { jobs: v.array(rawJobValidator) },
  handler: async (ctx, { jobs }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in required.");
    return await ingestForUser(ctx, userId, jobs);
  },
});

/** Ingest for an explicit user (the scheduled daily run). */
export const ingestJobsForUser = internalMutation({
  args: { userId: v.id("users"), jobs: v.array(rawJobValidator) },
  handler: async (ctx, { userId, jobs }) => await ingestForUser(ctx, userId, jobs),
});

/* -------------------------------- scoring -------------------------------- */

async function scoreForUser(ctx: MutationCtx, userId: Id<"users">) {
  const { profile, jobs } = await loadUserData(ctx, userId);
  if (!profile) return { scored: 0, shortlisted: 0 };

  let scored = 0;
  let shortlisted = 0;
  for (const job of jobs) {
    if (["Applied", "Approved", "Interview", "Offer"].includes(job.status)) {
      continue; // never re-touch advanced pipeline stages
    }
    const result = scoreMatch(profile, job._id, job);
    const passes = result.score >= profile.minMatchScore;
    await ctx.db.patch(job._id, {
      matchScore: result.score,
      matchedSkills: result.matchedSkills,
      missingSkills: result.missingSkills,
      matchExplanation: result.explanation,
      status: job.status === "New" ? (passes ? "Shortlisted" : "Rejected") : job.status,
    });
    scored++;
    if (passes && job.status === "New") shortlisted++;
  }
  return { scored, shortlisted };
}

/** Score every job for an explicit user (scheduled pipeline). */
export const scoreAllForUser = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => await scoreForUser(ctx, userId),
});

/* -------------------------------- activity ------------------------------- */

export const logActivity = internalMutation({
  args: {
    userId: v.id("users"),
    jobId: v.optional(v.id("jobs")),
    action: v.string(),
    detail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("activity", {
      userId: args.userId,
      jobId: args.jobId,
      action: args.action,
      detail: args.detail,
      createdAt: Date.now(),
    });
  },
});

/** Everything the digest needs, pre-aggregated server-side. */
export const getDigestData = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const { profile, jobs } = await loadUserData(ctx, userId);
    if (!profile) return null;
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const brief = (j: (typeof jobs)[number]) => ({
      title: j.title,
      organization: j.organization,
      matchScore: j.matchScore,
      status: j.status,
      url: j.url,
    });
    const now = Date.now();
    const dueSoon = jobs
      .map((j) => ({ job: j, deadline: parseDeadlineValue(j.deadline, now) }))
      .filter(
        (entry): entry is { job: (typeof jobs)[number]; deadline: number } =>
          entry.deadline !== null && isDueWithin(entry.job.deadline, 7, now),
      )
      .sort((a, b) => a.deadline - b.deadline)
      .slice(0, 10)
      .map(({ job, deadline }) => ({
        ...brief(job),
        deadline: new Date(deadline).toISOString().slice(0, 10),
        daysLeft: daysUntil(deadline, now),
      }));
    return {
      dueSoon,
      profile: {
        fullName: profile.fullName,
        email: profile.email,
        maxApplicationsPerDay: profile.maxApplicationsPerDay,
        lastDigestAt: profile.lastDigestAt,
      },
      shortlisted: jobs
        .filter((j) => j.status === "Shortlisted")
        .sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0))
        .map(brief),
      resumeReady: jobs.filter((j) => j.status === "Resume Ready").map(brief),
      appliedToday: jobs.filter(
        (j) => j.status === "Applied" && (j.appliedAt ?? 0) >= startOfDay.getTime(),
      ).length,
      totalJobs: jobs.length,
    };
  },
});

export const markDigestSent = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (profile) await ctx.db.patch(profile._id, { lastDigestAt: Date.now() });
  },
});
