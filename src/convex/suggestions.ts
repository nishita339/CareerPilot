// Setup completeness + improvement suggestions. Pure module (no Convex, no
// network) so the rules can be unit-tested and the UI just renders them.

import { extractSkills } from "./skills";
import { OPPORTUNITY_TYPE_LABELS } from "./opportunities";

export interface SetupProfile {
  fullName?: string;
  email?: string;
  phone?: string;
  location?: string;
  headline?: string;
  major?: string;
  university?: string;
  graduationYear?: string;
  country?: string;
  gpa?: string;
  relevantCoursework?: string;
  links?: string;
  skills?: string[];
  experience?: string;
  projects?: string;
  certifications?: string;
  targetRoles?: string[];
  opportunityTypes?: string[];
  masterResumeText?: string;
  resumeFileName?: string;
  minMatchScore?: number;
  maxApplicationsPerDay?: number;
  autoApplyEnabled?: boolean;
}

export interface MissingField {
  field: keyof SetupProfile;
  label: string;
  hint: string;
}

const has = (value: string | undefined, min = 1) =>
  (value ?? "").trim().length >= min;

/**
 * The fields that must be present before the pipeline is useful. Anything a
 * generated resume could be tempted to fake (skills, education, experience) is
 * mandatory here precisely because the validator compares against it.
 */
export const REQUIRED_FIELDS: {
  field: keyof SetupProfile;
  label: string;
  hint: string;
  isSet: (p: SetupProfile) => boolean;
}[] = [
  {
    field: "fullName",
    label: "Full name",
    hint: "Appears at the top of every resume.",
    isSet: (p) => has(p.fullName),
  },
  {
    field: "email",
    label: "Email",
    hint: "Used for the digest and as the reply address on applications.",
    isSet: (p) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test((p.email ?? "").trim()),
  },
  {
    field: "phone",
    label: "Phone",
    hint: "Most application forms require it.",
    isSet: (p) => has(p.phone, 6),
  },
  {
    field: "location",
    label: "Current location",
    hint: "Drives the location part of the match score.",
    isSet: (p) => has(p.location),
  },
  {
    field: "major",
    label: "Major / field",
    hint: "Used to target research, scholarship and exam searches.",
    isSet: (p) => has(p.major),
  },
  {
    field: "university",
    label: "University",
    hint: "Education line on the resume; verified by the validator.",
    isSet: (p) => has(p.university),
  },
  {
    field: "graduationYear",
    label: "Graduation year",
    hint: "Many internships and scholarships are year-gated.",
    isSet: (p) => has(p.graduationYear),
  },
  {
    field: "skills",
    label: "At least 3 skills",
    hint: "The only skill list the tailoring engine may draw from.",
    isSet: (p) => (p.skills ?? []).filter((s) => s.trim()).length >= 3,
  },
  {
    field: "targetRoles",
    label: "Target roles",
    hint: "Search terms for discovery and the role-fit part of the score.",
    isSet: (p) => (p.targetRoles ?? []).filter((s) => s.trim()).length >= 1,
  },
  {
    field: "opportunityTypes",
    label: "Opportunity types",
    hint: "Which sections to fill: jobs, internships, research, scholarships, exams.",
    isSet: (p) => (p.opportunityTypes ?? []).filter((s) => s.trim()).length >= 1,
  },
  {
    field: "masterResumeText",
    label: "Your resume",
    hint: "Paste your current resume, or upload the PDF and we extract the text.",
    isSet: (p) => has(p.masterResumeText, 80) || has(p.resumeFileName, 1),
  },
];

export interface SetupStatus {
  complete: boolean;
  percent: number;
  missing: MissingField[];
}

export function setupStatus(profile: SetupProfile | null | undefined): SetupStatus {
  const p = profile ?? {};
  const missing = REQUIRED_FIELDS.filter((f) => !f.isSet(p)).map(
    ({ field, label, hint }) => ({ field, label, hint }),
  );
  const total = REQUIRED_FIELDS.length;
  const done = total - missing.length;
  return {
    complete: missing.length === 0,
    percent: Math.round((done / total) * 100),
    missing,
  };
}

/* ----------------------------- suggestions ------------------------------- */

export type SuggestionArea = "Setup" | "Resume" | "Skills" | "Opportunities" | "Autopilot";
export type SuggestionSeverity = "high" | "medium" | "low";

export interface Suggestion {
  id: string;
  area: SuggestionArea;
  severity: SuggestionSeverity;
  title: string;
  detail: string;
}

export interface SuggestionJob {
  title: string;
  organization: string;
  opportunityType: string;
  status: string;
  matchScore?: number;
  missingSkills?: string[];
  deadline?: string;
  validationNotes?: string;
  applyMode?: string;
  autoApplied?: boolean;
}

export interface SuggestionInput {
  profile: SetupProfile;
  jobs: SuggestionJob[];
  /** Applications already sent today, for the cap note. */
  appliedToday?: number;
  /** Days-until-deadline values already parsed upstream (server side). */
  dueSoon?: number;
}

const SLOP = [
  "passionate",
  "dynamic",
  "results-driven",
  "results driven",
  "team player",
  "hardworking",
  "hard-working",
  "synergy",
  "detail-oriented",
  "go-getter",
  "self-starter",
  "thought leader",
  "guru",
  "ninja",
  "rockstar",
];

const SEVERITY_RANK: Record<SuggestionSeverity, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

/** Deterministic, explainable improvement list. No LLM involved. */
export function buildSuggestions(input: SuggestionInput): Suggestion[] {
  const { profile, jobs } = input;
  const out: Suggestion[] = [];
  const push = (s: Suggestion) => out.push(s);

  /* ---- Setup ---- */
  const setup = setupStatus(profile);
  if (!setup.complete) {
    push({
      id: "setup-required",
      area: "Setup",
      severity: "high",
      title: `${setup.missing.length} required field${setup.missing.length === 1 ? "" : "s"} still empty`,
      detail: `Finish: ${setup.missing.map((m) => m.label).join(", ")}. Generated resumes can only use what is in the profile, so gaps here become weaker applications.`,
    });
  }
  if (!has(profile.links)) {
    push({
      id: "setup-links",
      area: "Setup",
      severity: "medium",
      title: "Add a LinkedIn or GitHub link",
      detail:
        "Recruiters look for proof of work. A profile link is the cheapest credibility you can put on a resume.",
    });
  }
  if (!has(profile.headline)) {
    push({
      id: "setup-headline",
      area: "Setup",
      severity: "low",
      title: "Write a one-line headline",
      detail:
        'Something like "CS junior — data & backend". It anchors the resume summary and the digest.',
    });
  }
  if (!has(profile.gpa)) {
    push({
      id: "setup-gpa",
      area: "Setup",
      severity: "low",
      title: "Add your GPA if it helps you",
      detail:
        "Many research roles and scholarships filter on GPA. If yours is strong, include it; if not, leave it out — the resume simply omits it.",
    });
  }
  if (!has(profile.relevantCoursework)) {
    push({
      id: "setup-coursework",
      area: "Setup",
      severity: "low",
      title: "List 3–5 relevant courses",
      detail:
        "Coursework is the strongest honest evidence a student can give for skills they have not used in a job yet.",
    });
  }

  /* ---- Resume quality ---- */
  const resumeBody = [profile.experience ?? "", profile.projects ?? ""].join("\n");
  const bullets = resumeBody
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (bullets.length === 0) {
    push({
      id: "resume-empty",
      area: "Resume",
      severity: "high",
      title: "Add experience or project bullets",
      detail:
        "The resume needs substance: 3–5 lines describing what you built, with what, and what changed as a result.",
    });
  } else {
    if (!/\d/.test(resumeBody)) {
      push({
        id: "resume-metrics",
        area: "Resume",
        severity: "medium",
        title: "Add numbers to your bullets",
        detail:
          'No digits found in your experience or projects. Concrete scale reads far better than adjectives: "analyzed 50k rows", "cut review time from 3h to 40min", "4-person team".',
      });
    }
    const longOnes = bullets.filter((b) => b.length > 220);
    if (longOnes.length > 0) {
      push({
        id: "resume-long-bullets",
        area: "Resume",
        severity: "low",
        title: `${longOnes.length} bullet${longOnes.length === 1 ? " is" : "s are"} too long`,
        detail:
          "Keep each line under ~200 characters (roughly two printed lines). Long paragraphs get skimmed, not read.",
      });
    }
    const slopHits = SLOP.filter((word) => resumeBody.toLowerCase().includes(word));
    if (slopHits.length > 0) {
      push({
        id: "resume-slop",
        area: "Resume",
        severity: "medium",
        title: `Remove filler phrasing: ${slopHits.slice(0, 3).join(", ")}`,
        detail:
          'Words like "passionate" and "results-driven" are the strongest AI-slop signals recruiters screen for. Replace them with what you actually did.',
      });
    }
    if (/\b(I|my)\b/.test(resumeBody)) {
      push({
        id: "resume-first-person",
        area: "Resume",
        severity: "low",
        title: "Drop first-person pronouns",
        detail:
          'Resume bullets read better without "I" and "my" — start with the verb: "Built", "Analyzed", "Automated".',
      });
    }
    if (bullets.length < 3) {
      push({
        id: "resume-thin",
        area: "Resume",
        severity: "medium",
        title: "Only a couple of bullets so far",
        detail:
          "Aim for at least three concrete lines. Each tailored resume is built from these, so more honest material means less repetition across applications.",
      });
    }
  }

  /* ---- Skills gaps across matched roles ---- */
  const live = jobs.filter((j) =>
    ["Shortlisted", "Resume Ready", "Approved"].includes(j.status),
  );
  const gapCounts = new Map<string, number>();
  for (const job of live) {
    for (const skill of job.missingSkills ?? []) {
      gapCounts.set(skill, (gapCounts.get(skill) ?? 0) + 1);
    }
  }
  const topGaps = [...gapCounts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .filter(([, count]) => count >= 2 || live.length <= 3);
  if (topGaps.length > 0) {
    push({
      id: "skills-gaps",
      area: "Skills",
      severity: "medium",
      title: "Recurring skill gaps in roles you match",
      detail: topGaps
        .map(([skill, count]) => `${skill} (${count})`)
        .join(", ") +
        " — add these to your profile only if you genuinely have them. Otherwise treat the list as a learning plan; the validator will not let a fabricated skill through anyway.",
    });
  }

  /* ---- Tailored documents ---- */
  const flagged = jobs.filter((j) => (j.validationNotes ?? "").trim().length > 0);
  if (flagged.length > 0) {
    push({
      id: "validator-flags",
      area: "Resume",
      severity: "high",
      title: `${flagged.length} tailored resume${flagged.length === 1 ? "" : "s"} with unresolved validator flags`,
      detail: `Fix the profile or re-tailor before approving: ${flagged
        .slice(0, 3)
        .map((j) => `${j.organization} — ${j.title}`)
        .join("; ")}. Flagged documents can never be sent.`,
    });
  }

  /* ---- Opportunities ---- */
  const awaiting = jobs.filter((j) => j.status === "Resume Ready").length;
  if (awaiting > 0) {
    push({
      id: "opportunities-approval",
      area: "Opportunities",
      severity: "medium",
      title: `${awaiting} application${awaiting === 1 ? "" : "s"} waiting on your review`,
      detail: "Open the pipeline, read the validator notes, then approve or send back.",
    });
  }
  if ((input.dueSoon ?? 0) > 0) {
    push({
      id: "opportunities-deadlines",
      area: "Opportunities",
      severity: "high",
      title: `${input.dueSoon} deadline${input.dueSoon === 1 ? "" : "s"} within 7 days`,
      detail: "Sort by deadline in the pipeline before your daily cap resets.",
    });
  }
  if (jobs.length > 0 && live.length === 0) {
    push({
      id: "opportunities-none",
      area: "Opportunities",
      severity: "medium",
      title: "Nothing scored above your floor",
      detail: `Your minimum match score is ${profile.minMatchScore ?? 70}. Lowering it, adding target roles, or adding collector keys all widen the net.`,
    });
  }

  /* ---- Autopilot ---- */
  const armed = profile.autoApplyEnabled === true;
  const autoReady = jobs.filter(
    (j) =>
      j.status === "Shortlisted" &&
      j.applyMode === "email" &&
      (j.matchScore ?? 0) >= Math.max(80, profile.minMatchScore ?? 70),
  );
  if (!armed && autoReady.length > 0) {
    push({
      id: "autopilot-off",
      area: "Autopilot",
      severity: "medium",
      title: `${autoReady.length} role${autoReady.length === 1 ? "" : "s"} already qualify for autopilot`,
      detail:
        "Autopilot only ever emails roles above your autopilot score, with a clean validator verdict, inside the auto daily limit and the company cooldown. Web forms are never automated. You can arm it in Preferences.",
    });
  }
  if (armed && autoReady.length === 0 && live.length > 0) {
    push({
      id: "autopilot-nothing",
      area: "Autopilot",
      severity: "low",
      title: "Autopilot is armed but nothing qualifies yet",
      detail:
        "No shortlisted role is above the autopilot score with an email apply address. Collect again, or lower the autopilot score in Preferences.",
    });
  }

  return out.sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
  );
}

/** Convenience for the dashboard header: "Fix 3 things". */
export function suggestionCounts(list: Suggestion[]) {
  return {
    total: list.length,
    high: list.filter((s) => s.severity === "high").length,
    medium: list.filter((s) => s.severity === "medium").length,
    low: list.filter((s) => s.severity === "low").length,
  };
}

/** Label helper for the opportunity-type chips. */
export function typeLabel(type: string): string {
  return OPPORTUNITY_TYPE_LABELS[type] ?? type;
}

/** Re-exported so the UI and tests share one vocabulary. */
export { extractSkills };
