import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { GUARDRAILS } from "./policy";
import { parseSkillList } from "./skills";

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

/** Parses the profile form fields into the validated profile record. */
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
    skills: v.optional(v.array(v.string())),
    experience: v.optional(v.string()),
    projects: v.optional(v.string()),
    certifications: v.optional(v.string()),
    targetRoles: v.array(v.string()),
    opportunityTypes: v.array(v.string()),
    locations: v.optional(v.string()),
    openToRemote: v.boolean(),
    minMatchScore: v.number(),
    maxApplicationsPerDay: v.number(),
    blacklistCompanies: v.optional(v.string()),
    demoMode: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in required.");
    const cleaned = {
      ...args,
      email: args.email.trim(),
      skills: parseSkillList((args.skills ?? []).join(",")),
      targetRoles: args.targetRoles.map((t) => t.trim()).filter(Boolean),
      opportunityTypes: args.opportunityTypes.filter((t) => t.trim()),
      minMatchScore: Math.min(
        100,
        Math.max(
          GUARDRAILS.MIN_MATCH_SCORE_FLOOR,
          Math.round(args.minMatchScore),
        ),
      ),
      maxApplicationsPerDay: Math.min(
        GUARDRAILS.MAX_DAILY_CAP,
        Math.max(1, Math.round(args.maxApplicationsPerDay)),
      ),
      demoMode: args.demoMode === true,
      updatedAt: Date.now(),
    };
    const existing = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, cleaned);
      return existing._id;
    }
    return await ctx.db.insert("profiles", { userId, ...cleaned });
  },
});

/** Delete the profile together with all pipeline data (privacy: data stays local). */
export const deleteAllMyData = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { deleted: 0 };
    let deleted = 0;
    for await (const job of ctx.db
      .query("jobs")
      .withIndex("by_user", (q) => q.eq("userId", userId))) {
      await ctx.db.delete(job._id);
      deleted++;
    }
    for await (const a of ctx.db
      .query("activity")
      .withIndex("by_user", (q) => q.eq("userId", userId))) {
      await ctx.db.delete(a._id);
      deleted++;
    }
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (profile) {
      await ctx.db.delete(profile._id);
      deleted++;
    }
    return { deleted };
  },
});
