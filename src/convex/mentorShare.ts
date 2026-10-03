// Mentor Share Mode: Enables students to generate time-limited, view-only links
// for professors, career counselors, and alumni mentors to review their profile,
// tailored resumes, and opportunity pipeline without requiring mentor account creation.

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

export const DEFAULT_SHARE_DAYS = 14;
export const MAX_SHARE_DAYS = 30;

/** Pure helper to generate unguessable URL-safe share tokens. */
export function generateShareToken(): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let token = "";
  // 32 characters of high-entropy randomness
  for (let i = 0; i < 32; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

/** Check if a link has expired. */
export function isShareTokenExpired(
  expiresAt: number,
  nowMs: number = Date.now(),
): boolean {
  return nowMs > expiresAt;
}

/** Sanitizes student profile into a clean mentor review view. */
export function sanitizeProfileForMentor(
  profile: Record<string, unknown> | null,
  scope: string = "full_pipeline",
): Record<string, unknown> | null {
  if (!profile) return null;

  return {
    fullName: profile.fullName,
    headline: profile.headline,
    major: profile.major,
    university: profile.university,
    graduationYear: profile.graduationYear,
    gpa: profile.gpa,
    skills: profile.skills,
    experience: profile.experience,
    projects: profile.projects,
    relevantCoursework: profile.relevantCoursework,
    certifications: profile.certifications,
    targetRoles: profile.targetRoles,
    masterResumeText: profile.masterResumeText,
    scope,
  };
}

/** Create a new shareable mentor review link. */
export const createMentorShareLink = mutation({
  args: {
    mentorName: v.optional(v.string()),
    scope: v.string(), // "full_pipeline" | "resume_only"
    validDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in required.");

    const days = Math.min(MAX_SHARE_DAYS, Math.max(1, args.validDays ?? DEFAULT_SHARE_DAYS));
    const token = generateShareToken();
    const now = Date.now();
    const expiresAt = now + days * 24 * 60 * 60 * 1000;

    const linkId = await ctx.db.insert("shareLinks", {
      userId,
      token,
      scope: args.scope,
      mentorName: args.mentorName?.trim(),
      expiresAt,
      createdAt: now,
    });

    await ctx.db.insert("activity", {
      userId,
      action: "mentor link created",
      detail: args.mentorName ? `Shared with ${args.mentorName}` : "General mentor link",
      createdAt: now,
    });

    return { linkId, token, expiresAt };
  },
});

/** Revoke an existing share link immediately. */
export const revokeMentorShareLink = mutation({
  args: { linkId: v.id("shareLinks") },
  handler: async (ctx, { linkId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in required.");

    const link = await ctx.db.get(linkId);
    if (!link || link.userId !== userId) {
      throw new Error("Share link not found or access denied.");
    }

    await ctx.db.delete(linkId);

    await ctx.db.insert("activity", {
      userId,
      action: "mentor link revoked",
      detail: link.mentorName || "Share link deleted",
      createdAt: Date.now(),
    });

    return { success: true };
  },
});

/** List all active mentor links for the logged-in user. */
export const listMyShareLinks = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    return await ctx.db
      .query("shareLinks")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});

/** Public read-only query accessed via the shared token. */
export const getSharedPortfolio = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const link = await ctx.db
      .query("shareLinks")
      .withIndex("by_token", (q) => q.eq("token", token))
      .first();

    if (!link) {
      return { status: "not_found" as const };
    }

    if (isShareTokenExpired(link.expiresAt)) {
      return { status: "expired" as const };
    }

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", link.userId))
      .first();

    let jobs: unknown[] = [];
    if (link.scope === "full_pipeline") {
      const allJobs = await ctx.db
        .query("jobs")
        .withIndex("by_user", (q) => q.eq("userId", link.userId))
        .collect();

      // Only show shortlisted, resume ready, or applied jobs to mentors
      jobs = allJobs
        .filter((j) => ["Shortlisted", "Resume Ready", "Approved", "Applied", "Interview", "Offer"].includes(j.status))
        .map((j) => ({
          title: j.title,
          organization: j.organization,
          opportunityType: j.opportunityType,
          status: j.status,
          matchScore: j.matchScore,
          matchedSkills: j.matchedSkills,
          missingSkills: j.missingSkills,
          notes: j.notes,
        }));
    }

    return {
      status: "active" as const,
      mentorName: link.mentorName,
      expiresAt: link.expiresAt,
      profile: sanitizeProfileForMentor(profile as unknown as Record<string, unknown>, link.scope),
      pipeline: jobs,
    };
  },
});
