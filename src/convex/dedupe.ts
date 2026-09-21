// Pure dedupe + blacklist helpers (no Convex imports) so they are unit-testable.

import { similarity } from "./skills";

/** Canonical key for a listing URL: strips query strings, fragments and slash. */
export function urlKey(url: string): string {
  return url
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[#?].*$/, "")
    .replace(/\/+$/, "");
}

export interface DedupeCandidate {
  title: string;
  organization: string;
  url?: string;
  externalId?: string;
  source?: string;
}

/** Fraction (0-1) of a title's words that overlap another title's words. */
export function titleOverlap(a: string, b: string): number {
  return similarity(a, b);
}

function words(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1),
  );
}

/**
 * Titles describe the same role when they are fuzzy-identical, or when the
 * shorter title's words are fully contained in the longer one — which is how
 * reposts look in practice: "Software Engineer Intern" vs
 * "Software Engineer Intern (Remote)".
 */
export function titlesMatch(a: string, b: string): boolean {
  if (similarity(a, b) > 0.82) return true;
  const wa = words(a);
  const wb = words(b);
  const [small, big] = wa.size <= wb.size ? [wa, wb] : [wb, wa];
  if (small.size < 2) return false; // one-word titles are too ambiguous
  for (const w of small) if (!big.has(w)) return false;
  return true;
}

/**
 * Two listings are duplicates when any of these hold:
 *  - same canonical URL
 *  - same externalId from the same source
 *  - same organization (case-insensitive) AND the titles are identical or
 *    fuzzy-similar (>= 0.82) — catches reposts with tracking suffixes
 */
export function isDuplicate(
  a: DedupeCandidate,
  b: DedupeCandidate,
): boolean {
  if (a.url && b.url && urlKey(a.url) === urlKey(b.url)) return true;
  if (
    a.externalId !== undefined &&
    b.externalId !== undefined &&
    a.externalId === b.externalId &&
    a.source !== undefined &&
    b.source !== undefined &&
    a.source === b.source
  ) {
    return true;
  }
  const sameOrg =
    a.organization.trim().toLowerCase() === b.organization.trim().toLowerCase();
  if (!sameOrg) return false;
  return titlesMatch(a.title, b.title);
}

/** Parse a comma/newline separated blacklist string into lowercase terms. */
export function parseBlacklist(raw: string | undefined | null): string[] {
  return (raw ?? "")
    .split(/[,\n]/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** True when the organization matches any blacklisted term. */
export function isBlacklisted(
  organization: string,
  blacklist: string[] | string | undefined,
): boolean {
  const terms = Array.isArray(blacklist) ? blacklist : parseBlacklist(blacklist);
  const org = organization.trim().toLowerCase();
  return terms.some((term) => term.length > 1 && org.includes(term));
}
