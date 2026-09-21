// Pure deadline helpers (no Convex imports) so they are unit-testable.
// Listings carry deadlines as free text ("2026-10-15", "15 Oct 2026",
// "Rolling"), so parsing is deliberately forgiving and never throws.

const NON_DATES = /rolling|ongoing|open until|asap|tbd|n\/a|until filled|no deadline/i;
const DAY_MS = 86_400_000;

/** Parse a deadline string into a timestamp, or null when it is not a date. */
export function parseDeadlineValue(
  value: string | undefined | null,
  now = Date.now(),
): number | null {
  if (!value) return null;
  const text = value.trim();
  if (!text || text.length > 40 || NON_DATES.test(text)) return null;

  // ISO-ish: 2026-10-15, 2026/10/15, optionally with a time.
  const iso = text.match(/^(\d{4})[-/.](\d{1,2})(?:[-/.](\d{1,2}))?/);
  if (iso) {
    const ts = Date.UTC(
      Number(iso[1]),
      Number(iso[2]) - 1,
      iso[3] ? Number(iso[3]) : 1,
    );
    return sane(ts, now) ? ts : null;
  }

  // Fallback: anything else Date.parse understands ("Oct 15, 2026").
  if (/[a-z]{3}/i.test(text)) {
    const ts = Date.parse(text);
    if (!Number.isNaN(ts) && sane(ts, now)) return ts;
  }
  return null;
}

/** Reject nonsense parses (typos, far-future years) instead of trusting them. */
function sane(ts: number, now: number): boolean {
  if (Number.isNaN(ts)) return false;
  const fiveYears = now + 5 * 365 * DAY_MS;
  // Allow a little slack for listings that just closed.
  const twoYearsAgo = now - 2 * 365 * DAY_MS;
  return ts > twoYearsAgo && ts < fiveYears;
}

/** Whole days from `now` until the deadline (negative when it has passed). */
export function daysUntil(deadline: number, now = Date.now()): number {
  return Math.ceil((deadline - now) / DAY_MS);
}

/** Deadline is in the future and within `windowDays` (inclusive). */
export function isDueWithin(
  value: string | undefined | null,
  windowDays: number,
  now = Date.now(),
): boolean {
  const ts = parseDeadlineValue(value, now);
  if (ts === null) return false;
  const left = daysUntil(ts, now);
  return left >= 0 && left <= windowDays;
}

export { DAY_MS };
