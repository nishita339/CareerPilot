// Shared vocabulary for every discovery channel (job boards, public boards,
// preprint feeds and web search). Pure module — no Convex imports, no network —
// so classification and extraction stay unit-testable.

export type OpportunityType =
  | "job"
  | "internship"
  | "research"
  | "fellowship"
  | "scholarship"
  | "govt-exam";

export interface RawJob {
  title: string;
  organization: string;
  location?: string;
  remoteOk: boolean;
  url: string;
  externalId?: string;
  description?: string;
  applyEmail?: string;
  deadline?: string;
  opportunityType: OpportunityType;
  source: string;
  publishedAt?: number;
}

export const USER_AGENT =
  "CareerPilot/1.0 (student job search; public APIs and public boards only)";

/** Per-source cap so a single run stays small, polite and cheap. */
export const MAX_PER_SOURCE = 20;

/** Cap for the web-search channels — one query per category, few results. */
export const MAX_PER_CHANNEL = 8;

export function envValue(name: string): string | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function envList(name: string): string[] {
  return (envValue(name) ?? "")
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function stripHtml(input: string): string {
  return input
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/* --------------------------- classification ---------------------------- */

const RESEARCH_RE =
  /\b(phd|postdoc|post-doc|research assistant|research intern|research scientist|research associate|preprint|call for papers|paper submission)\b/;
const GOV_RE =
  /\b(government|govt|sarkari|public service commission|upsc|ssc|ibps|rrb|ntpc|upsc cse|state psc|civil services|national testing agency|nta|exam notification)\b/;
const EXAM_RE = /\b(exam|recruitment|notification|vacancy|vacancies|merit list|admit card|cutoff)\b/;
const SCHOLARSHIP_RE =
  /\b(scholarship|bursary|tuition|fee waiver|study grant|financial aid award|scholarship program)\b/;
const INTERNSHIP_RE = /\b(intern|internship|placement|working student|trainee)\b/;
const FELLOWSHIP_RE = /\b(fellow|fellowship|scholar program)\b/;

/**
 * Heuristic classification from title + description text.
 * Order matters: "research intern" is a research role, a government exam
 * notification is not a job posting, and a scholarship is its own category.
 */
export function classifyOpportunity(
  title: string,
  description = "",
  sourceHint?: OpportunityType,
): OpportunityType {
  const text = `${title} ${description}`.toLowerCase();
  if (RESEARCH_RE.test(text)) return "research";
  // Only the strong markers reach here, so a corporate "recruitment" ad with
  // no government term never lands in the exam section.
  if (GOV_RE.test(text) && EXAM_RE.test(text)) return "govt-exam";
  if (SCHOLARSHIP_RE.test(text)) return "scholarship";
  if (INTERNSHIP_RE.test(text)) return "internship";
  if (FELLOWSHIP_RE.test(text)) return "fellowship";
  return sourceHint ?? "job";
}

/** Human label for the type, used in the UI and the Excel sheets. */
export const OPPORTUNITY_TYPE_LABELS: Record<string, string> = {
  job: "Job",
  internship: "Internship",
  research: "Research",
  fellowship: "Fellowship",
  scholarship: "Scholarship",
  "govt-exam": "Government exam",
};

/** The three sections that describe *employment*, used for section counts. */
export const WORK_TYPES: OpportunityType[] = [
  "job",
  "internship",
  "research",
  "fellowship",
];

/* ------------------------- contact extraction --------------------------- */

/** Addresses that are never a real application inbox. */
const NOISE_EMAIL =
  /(no-?reply|donotreply|example\.(com|org)|sentry|wixpress|@sentry|privacy@|abuse@|postmaster@|webmaster@)/i;

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/**
 * Pull a usable application address out of listing text.
 * Only the first plausible address is used — sending to a guessing-game
 * address is worse than leaving the role as manual-apply.
 */
export function extractApplyEmail(text: string | undefined): string | undefined {
  if (!text) return undefined;
  for (const match of text.match(EMAIL_RE) ?? []) {
    const candidate = match.replace(/[.,;:)]+$/, "");
    if (NOISE_EMAIL.test(candidate)) continue;
    if (candidate.length > 80) continue;
    return candidate;
  }
  return undefined;
}

/** Organization label for a web result: prefer the page's host name. */
export function organizationFromUrl(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const known: Record<string, string> = {
      "linkedin.com": "LinkedIn (public listing)",
      "in.linkedin.com": "LinkedIn (public listing)",
      "indeed.com": "Indeed (public listing)",
      "naukri.com": "Naukri (public listing)",
      "greenhouse.io": "Greenhouse board",
      "lever.co": "Lever board",
      "scholarships.gov.in": "National Scholarship Portal",
      "buddy4study.com": "Buddy4Study",
      "upwork.com": "Upwork",
      "github.com": "GitHub",
      "medium.com": "Medium",
    };
    for (const [domain, label] of Object.entries(known)) {
      if (host === domain || host.endsWith(`.${domain}`)) return label;
    }
    return host;
  } catch {
    return "Web result";
  }
}
