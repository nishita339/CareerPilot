import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

const roleValidator = v.union(
  v.literal("admin"),
  v.literal("user"),
  v.literal("member"),
);

export default defineSchema({
  ...authTables,

  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    role: v.optional(roleValidator),
  }).index("email", ["email"]),

  // CareerPilot master profile (one per user)
  profiles: defineTable({
    userId: v.id("users"),
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
    /** Country used to target scholarship and government-exam searches. */
    country: v.optional(v.string()),
    /** The student's own resume: pasted text, and/or an uploaded PDF kept in
     *  storage with its filename. This is the only resume the tailoring engine
     *  is allowed to draw facts from. */
    masterResumeText: v.optional(v.string()),
    resumeFileId: v.optional(v.id("_storage")),
    resumeFileName: v.optional(v.string()),
    /** Set once the mandatory setup step has been completed. */
    onboardedAt: v.optional(v.number()),
    /** Autopilot: pre-authorised email applications. Off unless armed, and
     *  bounded by its own score floor and daily limit (see autopilotRules). */
    autoApplyEnabled: v.optional(v.boolean()),
    autoApplyMinScore: v.optional(v.number()),
    autoApplyDailyLimit: v.optional(v.number()),
    autoApplyTypes: v.optional(v.array(v.string())),
    /** Demo mode: include sample listings so the pipeline can be explored
     *  without configuring any collector API keys. Off by default. */
    demoMode: v.optional(v.boolean()),
    /** Per-company cooldown window in days (clamped to 3-90). */
    cooldownDays: v.optional(v.number()),
    /** Preferred hour (UTC, 0-23) for the daily collect + score + digest run.
     *  The cron fires hourly at :30 and only runs profiles whose hour matches. */
    digestHourUtc: v.optional(v.number()),
    lastDigestAt: v.optional(v.number()),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  // Discovered opportunities and their pipeline state
  jobs: defineTable({
    userId: v.id("users"),
    source: v.string(), // RemoteOK | Remotive | ARXIV_DEMO | ...
    externalId: v.optional(v.string()),
    url: v.string(),
    title: v.string(),
    organization: v.string(),
    location: v.optional(v.string()),
    remoteOk: v.boolean(),
    opportunityType: v.string(), // job | internship | research | fellowship
    description: v.optional(v.string()),
    applyEmail: v.optional(v.string()),
    applyMode: v.string(), // email | form | url  ("manual" is a legacy value for form)
    publishedAt: v.optional(v.number()),
    status: v.string(), // New | Shortlisted | Resume Ready | Approved | Applied | Interview | Offer | Rejected | Rejected - below score | Skipped - blacklist
    matchScore: v.optional(v.number()),
    matchedSkills: v.optional(v.array(v.string())),
    missingSkills: v.optional(v.array(v.string())),
    matchExplanation: v.optional(v.string()),
    resumeHtml: v.optional(v.string()),
    coverLetterHtml: v.optional(v.string()),
    /** Structured resume (single source for HTML and PDF rendering). */
    resumeData: v.optional(v.any()),
    resumeVersion: v.optional(v.number()),
    deadline: v.optional(v.string()),
    validationOk: v.optional(v.boolean()),
    validationNotes: v.optional(v.string()),
    approvedAt: v.optional(v.number()),
    appliedAt: v.optional(v.number()),
    /** Status to restore if the user undoes a hand-recorded application.
     *  Only set by the manual path — email sends cannot be undone. */
    preApplyStatus: v.optional(v.string()),
    /** True when autopilot approved and sent this role without a human click. */
    autoApplied: v.optional(v.boolean()),
    autoAppliedAt: v.optional(v.number()),
    scrapedAt: v.number(),
    notes: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_user_status", ["userId", "status"])
    .index("by_user_score", ["userId", "matchScore"]),

  // Append-only audit log for every mutating action (human-in-the-loop trail)
  activity: defineTable({
    userId: v.id("users"),
    jobId: v.optional(v.id("jobs")),
    action: v.string(),
    detail: v.optional(v.string()),
    /** Organization at the time of the action — powers the company cooldown
     *  even if the listing row is later deleted. */
    organization: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_user", ["userId"]),
});
