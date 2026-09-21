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
    applyMode: v.string(), // email | manual | url
    publishedAt: v.optional(v.number()),
    status: v.string(), // New | Shortlisted | Resume Ready | Approved | Applied | Interview | Offer | Rejected | Rejected - below score | Skipped - blacklist
    matchScore: v.optional(v.number()),
    matchedSkills: v.optional(v.array(v.string())),
    missingSkills: v.optional(v.array(v.string())),
    matchExplanation: v.optional(v.string()),
    resumeHtml: v.optional(v.string()),
    coverLetterHtml: v.optional(v.string()),
    resumeVersion: v.optional(v.number()),
    validationOk: v.optional(v.boolean()),
    validationNotes: v.optional(v.string()),
    approvedAt: v.optional(v.number()),
    appliedAt: v.optional(v.number()),
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
    createdAt: v.number(),
  }).index("by_user", ["userId"]),
});
