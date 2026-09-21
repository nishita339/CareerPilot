// Policy constants for the human-in-the-loop application pipeline.

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
