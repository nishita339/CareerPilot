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

export const APPLY_MODES = ["email", "url", "manual"] as const;

/** Guardrails from the prompt: low, slow, targeted volume. */
export const GUARDRAILS = {
  DEFAULT_DAILY_CAP: 10,
  MAX_DAILY_CAP: 10, // hard ceiling — no scaling past it
  DEFAULT_MIN_MATCH_SCORE: 70,
  MIN_MATCH_SCORE_FLOOR: 50,
} as const;
