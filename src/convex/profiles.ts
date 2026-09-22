import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { GUARDRAILS } from "./policy";
import { parseSkillList } from "./skills";
import { clampCooldownDays } from "./cooldown";
import { clampDigestHourUtc } from "./schedule";
import {
  clampAutoApplyDailyLimit,
  clampAutoApplyMinScore,
  normalizeAutoApplyTypes,
} from "./autopilotRules";
import { parseFileRefs } from "./fileRefs";

export const getProfile = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    return await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
  },
});

/**
 * Parses the profile form fields into the validated profile record.
 * Optional fields are only written when the caller actually sent them, so a
 * partial save (the onboarding step, for example) never blanks stored values.
 */
export const saveProfile = mutation({
  args: {
    fullName: v.string(),
    headline: v.string(),
    email: v.string(),
    phone: v.string(),
    location: v.string(),
    links: v.optional(v.string()),
    major: v.string(),
    university: v.string(),
    graduationYear: v.string(),
    gpa: v.optional(v.string()),
    relevantCoursework: v.optional(v.string()),
    country: v.optional(v.string()),
    skills: v.optional(v.array(v.string())),
    experience: v.optional(v.string()),
    projects: v.optional(v.string()),
    certifications: v.optional(v.string()),
    masterResumeText: v.optional(v.string()),
    targetRoles: v.array(v.string()),
    opportunityTypes: v.array(v.string()),
    locations: v.optional(v.string()),
    openToRemote: v.boolean(),
    minMatchScore: v.number(),
    maxApplicationsPerDay: v.number(),
    blacklistCompanies: v.optional(v.string()),
    demoMode: v.optional(v.boolean()),
    cooldownDays: v.optional(v.number()),
    /** Hour (UTC) for the daily collect + score + digest run; cron fires at :30. */
    digestHourUtc: v.optional(v.number()),
    /** Autopilot: pre-authorised email applications. */
    autoApplyEnabled: v.optional(v.boolean()),
    autoApplyMinScore: v.optional(v.number()),
    autoApplyDailyLimit: v.optional(v.number()),
    autoApplyTypes: v.optional(v.array(v.string())),
    onboardedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in required.");

    const minMatchScore = Math.min(
      100,
      Math.max(GUARDRAILS.MIN_MATCH_SCORE_FLOOR, Math.round(args.minMatchScore)),
    );

    const base = {
      fullName: args.fullName.trim(),
      headline: args.headline.trim(),
      email: args.email.trim(),
      phone: args.phone.trim(),
      location: args.location.trim(),
      major: args.major.trim(),
      university: args.university.trim(),
      graduationYear: args.graduationYear.trim(),
      skills: parseSkillList((args.skills ?? []).join(",")),
      targetRoles: args.targetRoles.map((t) => t.trim()).filter(Boolean),
      opportunityTypes: args.opportunityTypes.filter((t) => t.trim()),
      openToRemote: args.openToRemote,
      minMatchScore,
      maxApplicationsPerDay: Math.min(
        GUARDRAILS.MAX_DAILY_CAP,
        Math.max(1, Math.round(args.maxApplicationsPerDay)),
      ),
      demoMode: args.demoMode === true,
      cooldownDays: clampCooldownDays(args.cooldownDays),
      digestHourUtc: clampDigestHourUtc(args.digestHourUtc),
      updatedAt: Date.now(),
    };

    const optional = {
      ...(args.links !== undefined ? { links: args.links } : {}),
      ...(args.gpa !== undefined ? { gpa: args.gpa } : {}),
      ...(args.relevantCoursework !== undefined
        ? { relevantCoursework: args.relevantCoursework }
        : {}),
      ...(args.country !== undefined ? { country: args.country } : {}),
      ...(args.experience !== undefined ? { experience: args.experience } : {}),
      ...(args.projects !== undefined ? { projects: args.projects } : {}),
      ...(args.certifications !== undefined
        ? { certifications: args.certifications }
        : {}),
      ...(args.masterResumeText !== undefined
        ? { masterResumeText: args.masterResumeText }
        : {}),
      ...(args.locations !== undefined ? { locations: args.locations } : {}),
      ...(args.blacklistCompanies !== undefined
        ? { blacklistCompanies: args.blacklistCompanies }
        : {}),
      ...(args.autoApplyEnabled !== undefined
        ? { autoApplyEnabled: args.autoApplyEnabled === true }
        : {}),
      ...(args.autoApplyMinScore !== undefined
        ? {
            autoApplyMinScore: clampAutoApplyMinScore(
              args.autoApplyMinScore,
              minMatchScore,
            ),
          }
        : {}),
      ...(args.autoApplyDailyLimit !== undefined
        ? { autoApplyDailyLimit: clampAutoApplyDailyLimit(args.autoApplyDailyLimit) }
        : {}),
      ...(args.autoApplyTypes !== undefined
        ? { autoApplyTypes: normalizeAutoApplyTypes(args.autoApplyTypes) }
        : {}),
      ...(args.onboardedAt !== undefined ? { onboardedAt: args.onboardedAt } : {}),
    };

    const patch = { ...base, ...optional };
    const existing = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }
    return await ctx.db.insert("profiles", { userId, ...patch });
  },
});

/**
 * Arm or disarm autopilot on its own, so a stray profile save can never turn it
 * on and the limits are always clamped server-side.
 */
export const setAutopilot = mutation({
  args: {
    enabled: v.boolean(),
    minScore: v.optional(v.number()),
    dailyLimit: v.optional(v.number()),
    types: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in required.");
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (!profile) throw new Error("Complete your Master Profile first.");
    await ctx.db.patch(profile._id, {
      autoApplyEnabled: args.enabled,
      ...(args.minScore !== undefined
        ? {
            autoApplyMinScore: clampAutoApplyMinScore(
              args.minScore,
              profile.minMatchScore,
            ),
          }
        : {}),
      ...(args.dailyLimit !== undefined
        ? { autoApplyDailyLimit: clampAutoApplyDailyLimit(args.dailyLimit) }
        : {}),
      ...(args.types !== undefined
        ? { autoApplyTypes: normalizeAutoApplyTypes(args.types) }
        : {}),
      updatedAt: Date.now(),
    });
    await ctx.db.insert("activity", {
      userId,
      action: args.enabled ? "autopilot armed" : "autopilot disarmed",
      detail: args.enabled
        ? `email applications above score ${clampAutoApplyMinScore(args.minScore, profile.minMatchScore)}, max ${clampAutoApplyDailyLimit(args.dailyLimit)}/day`
        : "every application now needs your approval",
      createdAt: Date.now(),
    });
    return { ok: true };
  },
});

/**
 * Stores an uploaded resume in the deployment's file storage and records the
 * extracted text when extraction actually worked. Called by the upload action.
 */
export const attachResumeFile = mutation({
  args: {
    storageId: v.id("_storage"),
    fileName: v.string(),
    extractedText: v.optional(v.string()),
  },
  handler: async (ctx, { storageId, fileName, extractedText }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in required.");
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (!profile) {
      throw new Error("Save the first onboarding step before uploading a resume.");
    }
    await ctx.db.patch(profile._id, {
      resumeFileId: storageId,
      resumeFileName: fileName,
      ...(extractedText ? { masterResumeText: extractedText } : {}),
      updatedAt: Date.now(),
    });
    await ctx.db.insert("activity", {
      userId,
      action: "uploaded resume",
      detail: `${fileName}${extractedText ? ` · extracted ${extractedText.length} characters` : " · stored only (no text extracted)"}`,
      createdAt: Date.now(),
    });
    return { ok: true };
  },
});

/**
 * Delete the profile together with all pipeline data (privacy: data stays in
 * your account until you ask for this). Stored files — the uploaded resume and
 * every generated export — are removed as well, not just their rows.
 */
export const deleteAllMyData = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { deleted: 0, files: 0 };
    let deleted = 0;

    for await (const job of ctx.db
      .query("jobs")
      .withIndex("by_user", (q) => q.eq("userId", userId))) {
      await ctx.db.delete(job._id);
      deleted++;
    }

    const details: string[] = [];
    const activityIds = [];
    for await (const a of ctx.db
      .query("activity")
      .withIndex("by_user", (q) => q.eq("userId", userId))) {
      details.push(a.detail ?? "");
      activityIds.push(a._id);
    }
    for (const id of activityIds) {
      await ctx.db.delete(id);
      deleted++;
    }

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    // Generated exports recorded their ids in the audit trail.
    const storageIds = new Set(parseFileRefs(details));
    if (profile?.resumeFileId) storageIds.add(profile.resumeFileId);
    let files = 0;
    for (const id of storageIds) {
      try {
        await ctx.storage.delete(id as never);
        files++;
      } catch {
        // An already-expired blob is not an error worth failing deletion over.
      }
    }

    if (profile) {
      await ctx.db.delete(profile._id);
      deleted++;
    }
    return { deleted, files };
  },
});
