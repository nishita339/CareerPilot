// Policy constants for the application pipeline.

import type { OpportunityType } from "./opportunities";

export const PIPELINE_STATUSES = [
  "New",
  "Shortlisted",
  "Resume Ready",
  "Approved",
  "Applied",
  "Interview",
  "Offer",
  "Rejected",
  "Skipped",
] as const;
export type PipelineStatus = (typeof PIPELINE_STATUSES)[number];

// "form" = a web form the user submits by hand (the application kit covers it).
// "manual" is kept for rows ingested before the rename.
export const APPLY_MODES = ["email", "form", "url", "manual"] as const;

/** True when the role must be submitted by hand on the employer's site. */
export function isFormApply(applyMode: string | undefined): boolean {
  return applyMode !== "email";
}

/** Guardrails from the prompt: low, slow, targeted volume. */
export const GUARDRAILS = {
  DEFAULT_DAILY_CAP: 10,
  MAX_DAILY_CAP: 10, // hard ceiling — no scaling past it
  DEFAULT_MIN_MATCH_SCORE: 70,
  MIN_MATCH_SCORE_FLOOR: 50,
} as const;

/**
 * The pipeline is grouped into sections so jobs, internships, research,
 * scholarships and government exams never blur into one list — in the UI and in
 * the Excel export alike.
 */
export const OPPORTUNITY_SECTIONS: {
  key: string;
  label: string;
  types: OpportunityType[];
}[] = [
  {
    key: "all",
    label: "All",
    types: [
      "job",
      "internship",
      "research",
      "fellowship",
      "scholarship",
      "govt-exam",
    ],
  },
  { key: "job", label: "Jobs", types: ["job"] },
  { key: "internship", label: "Internships", types: ["internship"] },
  { key: "research", label: "Research", types: ["research", "fellowship"] },
  { key: "scholarship", label: "Scholarships", types: ["scholarship"] },
  { key: "govt-exam", label: "Government exams", types: ["govt-exam"] },
];

/** Opportunity types that describe paid employment (never scholarships/exams). */
export const EMPLOYMENT_TYPES: OpportunityType[] = [
  "job",
  "internship",
  "research",
  "fellowship",
];

/** Every opportunity type the pipeline understands, for validation. */
export const ALL_OPPORTUNITY_TYPES: string[] =
  OPPORTUNITY_SECTIONS.find((s) => s.key === "all")?.types ?? EMPLOYMENT_TYPES;

/** Types that must never be auto-applied: scholarships and exams need you. */
export function isAutoApplicableType(type: string): boolean {
  return EMPLOYMENT_TYPES.includes(type as OpportunityType);
}
