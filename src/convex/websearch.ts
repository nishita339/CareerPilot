// Open-web discovery channel.
//
// How it stays inside the rules: we query a *search API* (Exa's neural web
// index) and read only what that index already returns publicly — title, URL,
// snippet, publish date. There is no login, no cookie jar, no browser
// automation, no fingerprint spoofing and no proxy rotation. If a page is not
// publicly indexable it simply does not appear. Each result is stored as a
// pointer plus a short snippet, so the user always lands on the original page.
//
// Pure planning/mapping helpers live here (no Convex imports) so they are
// unit-testable; the fetch call itself is isolated in collectWebSearch.

import {
  classifyOpportunity,
  envList,
  envValue,
  extractApplyEmail,
  MAX_PER_CHANNEL,
  organizationFromUrl,
  stripHtml,
  type OpportunityType,
  type RawJob,
} from "./opportunities";

export interface SearchProfile {
  major: string;
  targetRoles: string[];
  locations?: string;
  country?: string;
  opportunityTypes: string[];
}

export type SearchChannelKey =
  | "jobs"
  | "internships"
  | "research"
  | "scholarships"
  | "govt-exams"
  | "community";

export interface SearchChannel {
  key: SearchChannelKey;
  label: string;
  /** Fallback type when the result text gives no stronger signal. */
  hint: OpportunityType;
  buildQuery: (profile: SearchProfile, year: number) => string;
  /** Optional domain restriction (used by the community channel). */
  includeDomains?: string[];
}

function firstLocation(profile: SearchProfile): string {
  return (profile.locations ?? "").split(/[,\n]/)[0]?.trim() ?? "";
}

function country(profile: SearchProfile): string {
  const explicit = profile.country?.trim();
  if (explicit) return explicit;
  return firstLocation(profile);
}

function role(profile: SearchProfile): string {
  return profile.targetRoles.map((r) => r.trim()).filter(Boolean)[0] ?? profile.major;
}

export const SEARCH_CHANNELS: SearchChannel[] = [
  {
    key: "jobs",
    label: "Jobs",
    hint: "job",
    buildQuery: (p, year) =>
      `"${role(p)}" job opening ${firstLocation(p)} ${year} how to apply`.replace(/\s+/g, " ").trim(),
  },
  {
    key: "internships",
    label: "Internships",
    hint: "internship",
    buildQuery: (p, year) =>
      `"${role(p)}" internship ${firstLocation(p)} ${year} application deadline`.replace(/\s+/g, " ").trim(),
  },
  {
    key: "research",
    label: "Research & papers",
    hint: "research",
    buildQuery: (p, year) =>
      `${p.major} research assistant position OR call for papers ${year} undergraduate`.replace(/\s+/g, " ").trim(),
  },
  {
    key: "scholarships",
    label: "Scholarships",
    hint: "scholarship",
    buildQuery: (p, year) =>
      `${p.major} scholarship for undergraduate students ${country(p)} ${year} eligibility how to apply`.replace(/\s+/g, " ").trim(),
  },
  {
    key: "govt-exams",
    label: "Government exams",
    hint: "govt-exam",
    buildQuery: (p, year) =>
      `${country(p)} government exam notification for graduates ${p.major} ${year} apply online`.replace(/\s+/g, " ").trim(),
  },
  {
    key: "community",
    label: "Blogs & community",
    hint: "job",
    buildQuery: (p, year) =>
      `${role(p)} hiring opening ${year} announcement blog community post`.replace(/\s+/g, " ").trim(),
  },
];

/** Channel keys that the profile opted into. */
export function channelKeysFor(
  profile: SearchProfile | undefined,
): SearchChannelKey[] {
  const wanted = new Set(profile?.opportunityTypes ?? []);
  const keys: SearchChannelKey[] = [];
  if (wanted.has("job")) keys.push("jobs");
  if (wanted.has("internship")) keys.push("internships");
  if (wanted.has("research") || wanted.has("fellowship")) keys.push("research");
  if (wanted.has("scholarship")) keys.push("scholarships");
  if (wanted.has("govt-exam")) keys.push("govt-exams");
  return keys;
}

export interface ChannelPlan {
  channel: SearchChannel;
  query: string;
  includeDomains?: string[];
}

/**
 * Build the search plan for this profile. The community channel needs a domain
 * allow-list to be useful (blogs and forums), so it only runs when
 * EXA_COMMUNITY_DOMAINS is configured — otherwise it would just add noise.
 */
export function buildChannelPlan(
  profile: SearchProfile,
  now = Date.now(),
): ChannelPlan[] {
  const year = new Date(now).getUTCFullYear();
  const keys = channelKeysFor(profile);
  const communityDomains = envList("EXA_COMMUNITY_DOMAINS");
  if (communityDomains.length > 0) keys.push("community");

  return keys
    .map((key) => SEARCH_CHANNELS.find((c) => c.key === key))
    .filter((c): c is SearchChannel => Boolean(c))
    .map((channel) => ({
      channel,
      query: channel.buildQuery(profile, year),
      includeDomains:
        channel.key === "community" ? communityDomains : channel.includeDomains,
    }));
}

export function exaConfigured(): boolean {
  return Boolean(envValue("EXA_API_KEY"));
}

/* --------------------------- Exa request/response ------------------------ */

export interface ExaSearchResult {
  title?: string;
  url?: string;
  publishedDate?: string;
  author?: string;
  text?: string;
}

export interface ExaResponse {
  results?: ExaSearchResult[];
}

export function buildExaRequestBody(args: {
  query: string;
  numResults?: number;
  includeDomains?: string[];
}): Record<string, unknown> {
  return {
    query: args.query,
    numResults: args.numResults ?? MAX_PER_CHANNEL,
    type: "auto",
    contents: { text: { maxCharacters: 1400 } },
    ...(args.includeDomains && args.includeDomains.length
      ? { includeDomains: args.includeDomains }
      : {}),
  };
}

const DEADLINE_CUES =
  /(?:deadline|due|closes?|last date|apply (?:by|before)|closing date)[^.\n]{0,40}?(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*\d{4}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s*\d{4})/i;

/** Pick a deadline only when the text explicitly labels one. */
export function extractDeadlineFromText(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const match = text.match(DEADLINE_CUES);
  return match ? match[1].replace(/\s+/g, " ").trim() : undefined;
}

/** Map one indexed page into a pipeline row. Pure — no network, no clock drift. */
export function mapResultToRawJob(
  result: ExaSearchResult,
  plan: Pick<ChannelPlan, "channel">,
  now = Date.now(),
): RawJob | null {
  const url = result.url?.trim();
  const title = stripHtml(result.title ?? "").slice(0, 200);
  if (!url || !url.startsWith("http") || !title) return null;
  const text = stripHtml(result.text ?? "").slice(0, 3000);
  const combined = `${title} ${text}`;
  const published = result.publishedDate ? Date.parse(result.publishedDate) : NaN;

  return {
    source: `Web · ${plan.channel.label}`,
    externalId: url,
    title,
    organization: organizationFromUrl(url),
    location: undefined,
    remoteOk: /\bremote\b/i.test(combined),
    url,
    description: text,
    applyEmail: extractApplyEmail(combined),
    deadline: extractDeadlineFromText(combined),
    opportunityType: classifyOpportunity(title, text, plan.channel.hint),
    publishedAt: Number.isNaN(published) ? undefined : published,
  };
}

/* ------------------------------- the fetch ------------------------------- */

async function callExa(
  query: string,
  includeDomains: string[] | undefined,
  timeoutMs = 15000,
): Promise<ExaResponse> {
  const key = envValue("EXA_API_KEY");
  if (!key) throw new Error("EXA_API_KEY not set");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch("https://api.exa.ai/search", {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", "x-api-key": key },
      body: JSON.stringify(buildExaRequestBody({ query, includeDomains })),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as ExaResponse;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Run a single channel for a profile. Throws on failure so the caller can
 * report which channel misbehaved; the registry isolates that per source.
 */
export async function collectChannel(
  key: SearchChannelKey,
  profile: SearchProfile,
  now = Date.now(),
): Promise<RawJob[]> {
  const channel = SEARCH_CHANNELS.find((c) => c.key === key);
  if (!channel) return [];
  if (!channelKeysFor(profile).includes(key) && key !== "community") return [];
  const domains =
    channel.key === "community"
      ? envList("EXA_COMMUNITY_DOMAINS")
      : channel.includeDomains;
  if (channel.key === "community" && (domains ?? []).length === 0) return [];
  const year = new Date(now).getUTCFullYear();
  const data = await callExa(channel.buildQuery(profile, year), domains);
  return (data.results ?? [])
    .map((result) => mapResultToRawJob(result, { channel }, now))
    .filter((job): job is RawJob => job !== null);
}

/**
 * Run every planned channel. One channel failing never stops the others — the
 * caller reports the failures.
 */
export async function collectWebSearch(
  profile: SearchProfile,
  now = Date.now(),
): Promise<{ jobs: RawJob[]; ran: string[]; errors: string[] }> {
  const plan = buildChannelPlan(profile, now);
  const jobs: RawJob[] = [];
  const ran: string[] = [];
  const errors: string[] = [];

  for (const entry of plan) {
    try {
      const data = await callExa(entry.query, entry.includeDomains);
      for (const result of data.results ?? []) {
        const job = mapResultToRawJob(result, entry, now);
        if (job) jobs.push(job);
      }
      ran.push(entry.channel.label);
    } catch (err) {
      errors.push(
        `${entry.channel.label}: ${err instanceof Error ? err.message : "search failed"}`,
      );
    }
  }
  return { jobs, ran, errors };
}
