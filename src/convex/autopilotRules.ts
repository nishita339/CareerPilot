// Autopilot rules — the pure half of automatic applications.
//
// What autopilot is allowed to do: email a role that is already Shortlisted,
// whose match score clears the (higher) autopilot bar, whose tailored resume
// passed the validator, and whose company is not inside the cooldown window —
// up to a small separate daily limit.
//
// What it is never allowed to do: submit a web form, touch a login wall, or
// use any automation/anti-detection tooling. Forms always stay manual.

import {
  checkCooldown,
  type PriorApplication,
} from "./cooldown";

export const AUTOPILOT = {
  /** Audit-trail action name for an autopilot send (counts toward the cap). */
  ACTION: "applied (email, autopilot)",
  /** Written when autopilot approves a role without a human click. */
  APPROVAL_ACTION: "auto-approved",
  DEFAULT_MIN_SCORE: 85,
  /** The autopilot bar can never be set below this. */
  MIN_MIN_SCORE: 80,
  DEFAULT_DAILY_LIMIT: 2,
  /** Autopilot can never send more than this in a day, whatever the setting. */
  MAX_DAILY_LIMIT: 3,
  DEFAULT_TYPES: ["job", "internship"],
} as const;

export function clampAutoApplyMinScore(
  value: number | undefined,
  minMatchScore?: number,
): number {
  const floor = Math.max(AUTOPILOT.MIN_MIN_SCORE, minMatchScore ?? 0);
  const raw = Number.isFinite(value)
    ? Math.round(value as number)
    : AUTOPILOT.DEFAULT_MIN_SCORE;
  return Math.min(100, Math.max(floor, raw));
}

export function clampAutoApplyDailyLimit(value: number | undefined): number {
  const raw = Number.isFinite(value)
    ? Math.round(value as number)
    : AUTOPILOT.DEFAULT_DAILY_LIMIT;
  return Math.min(AUTOPILOT.MAX_DAILY_LIMIT, Math.max(1, raw));
}

/** Autopilot is limited to employment sections; scholarships and exams never auto-apply. */
export function normalizeAutoApplyTypes(value: string[] | undefined): string[] {
  const allowed = new Set(["job", "internship", "research", "fellowship"]);
  const picked = (value ?? AUTOPILOT.DEFAULT_TYPES).filter((t) => allowed.has(t));
  return picked.length > 0 ? picked : [...AUTOPILOT.DEFAULT_TYPES];
}

export interface AutopilotProfile {
  autoApplyEnabled?: boolean;
  autoApplyMinScore?: number;
  autoApplyDailyLimit?: number;
  autoApplyTypes?: string[];
  minMatchScore?: number;
}

export interface AutopilotSettings {
  enabled: boolean;
  minScore: number;
  dailyLimit: number;
  types: string[];
}

export function autopilotSettings(profile: AutopilotProfile): AutopilotSettings {
  return {
    enabled: profile.autoApplyEnabled === true,
    minScore: clampAutoApplyMinScore(
      profile.autoApplyMinScore,
      profile.minMatchScore,
    ),
    dailyLimit: clampAutoApplyDailyLimit(profile.autoApplyDailyLimit),
    types: normalizeAutoApplyTypes(profile.autoApplyTypes),
  };
}

export interface AutoApplyJob {
  jobId: string;
  title: string;
  organization: string;
  status: string;
  matchScore?: number;
  opportunityType: string;
  applyMode?: string;
  applyEmail?: string;
}

export interface AutopilotCandidate {
  jobId: string;
  title: string;
  organization: string;
  matchScore: number;
  opportunityType: string;
  applyEmail: string;
}

export interface SkippedCandidate {
  jobId: string;
  title: string;
  organization: string;
  reason: string;
}

export interface AutopilotPlan {
  enabled: boolean;
  candidates: AutopilotCandidate[];
  skipped: SkippedCandidate[];
  /** Slots autopilot could use today, after both the auto and overall caps. */
  availableSlots: number;
  settings: AutopilotSettings;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Which Shortlisted roles autopilot may email right now.
 * Pure: pass the clock, the caps and the application history in.
 */
export function selectAutopilotCandidates(args: {
  profile: AutopilotProfile;
  jobs: AutoApplyJob[];
  prior: PriorApplication[];
  now: number;
  /** Applications of any kind sent today (the overall daily cap). */
  sentToday: number;
  /** Applications sent today by autopilot (its own smaller limit). */
  autoSentToday: number;
  /** The user's overall daily cap. */
  cap: number;
  cooldownDays?: number;
}): AutopilotPlan {
  const settings = autopilotSettings(args.profile);
  const overallLeft = Math.max(0, args.cap - args.sentToday);
  const autoLeft = Math.max(0, settings.dailyLimit - args.autoSentToday);
  const availableSlots = Math.min(overallLeft, autoLeft);

  if (!settings.enabled) {
    return { enabled: false, candidates: [], skipped: [], availableSlots, settings };
  }

  const eligible = args.jobs
    .filter(
      (j) =>
        j.status === "Shortlisted" &&
        j.applyMode === "email" &&
        EMAIL_RE.test(j.applyEmail ?? "") &&
        settings.types.includes(j.opportunityType) &&
        (j.matchScore ?? 0) >= settings.minScore,
    )
    .sort(
      (a, b) =>
        (b.matchScore ?? 0) - (a.matchScore ?? 0) ||
        a.organization.localeCompare(b.organization),
    );

  const candidates: AutopilotCandidate[] = [];
  const skipped: SkippedCandidate[] = [];
  // Applications this run creates feed straight back into the cooldown check,
  // so autopilot can never email two roles at the same company in one pass.
  const workingPrior: PriorApplication[] = [...args.prior];

  for (const job of eligible) {
    const base = {
      jobId: job.jobId,
      title: job.title,
      organization: job.organization,
    };
    if (candidates.length >= availableSlots) {
      skipped.push({
        ...base,
        reason:
          availableSlots === 0
            ? `No autopilot slots left today (autopilot limit ${settings.dailyLimit}/day, overall cap ${args.cap}/day).`
            : `Autopilot already picked ${availableSlots} role${availableSlots === 1 ? "" : "s"} for today.`,
      });
      continue;
    }
    const cooldown = checkCooldown({
      organization: job.organization,
      prior: workingPrior,
      now: args.now,
      cooldownDays: args.cooldownDays,
    });
    if (cooldown.blocked) {
      skipped.push({ ...base, reason: cooldown.reason ?? "Company cooldown." });
      continue;
    }
    candidates.push({
      ...base,
      matchScore: job.matchScore ?? 0,
      opportunityType: job.opportunityType,
      applyEmail: job.applyEmail as string,
    });
    workingPrior.push({ organization: job.organization, at: args.now });
  }

  return { enabled: true, candidates, skipped, availableSlots, settings };
}

/** Applications autopilot itself sent at or after `since`. */
export function countAutopilotSentSince(
  activity: { action: string; createdAt: number }[],
  since: number,
): number {
  return activity.filter(
    (a) => a.action === AUTOPILOT.ACTION && a.createdAt >= since,
  ).length;
}

/** Start of the current calendar day in the deployment's timezone. */
export function startOfToday(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
