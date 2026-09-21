// Pure per-company cooldown logic (no Convex imports) so it is unit-testable.
//
// Rationale: hammering one employer looks like spam and burns a relationship.
// The gate blocks sending another application to the same organization inside
// the configured window. Only applications recorded by this app (the audit
// trail) can feed it — applies you did elsewhere are invisible by design.

export const COOLDOWN_DEFAULTS = {
  DEFAULT_DAYS: 7,
  /** Never let the window be tightened below this — the point is restraint. */
  MIN_DAYS: 3,
  MAX_DAYS: 90,
} as const;

const DAY_MS = 86_400_000;

/** Corporate-form words that do not identify a company. */
const ENTITY_WORDS = new Set([
  "inc",
  "incorporated",
  "llc",
  "llp",
  "ltd",
  "limited",
  "corp",
  "corporation",
  "co",
  "company",
  "gmbh",
  "ag",
  "bv",
  "nv",
  "sa",
  "sarl",
  "sas",
  "plc",
  "pvt",
  "private",
  "pte",
  "oy",
  "ab",
  "as",
  "spa",
  "srl",
  "holdings",
  "group",
  "the",
]);

/**
 * Normalize an organization name for comparison:
 * "Acme Inc (demo)" -> "acme", "ACME" -> "acme", "Stripe Payments Ltd" ->
 * "stripe payments".
 */
export function normalizeOrgName(name: string | undefined | null): string {
  if (!name) return "";
  const withoutParens = name.replace(/\([^)]*\)/g, " ");
  return withoutParens
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .filter((w) => !ENTITY_WORDS.has(w))
    .join(" ")
    .trim();
}

function tokens(name: string): string[] {
  const n = normalizeOrgName(name);
  return n ? n.split(" ").filter(Boolean) : [];
}

/**
 * Do two organization names refer to the same employer?
 * True when the normalized names match, or when the shorter name's words are
 * all present in the longer one (both at least two words, so "Acme" alone does
 * not swallow "Acme Cloud" and "Acme Foods").
 */
export function sameCompany(a: string, b: string): boolean {
  const na = normalizeOrgName(a);
  const nb = normalizeOrgName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const ta = tokens(a);
  const tb = tokens(b);
  const [small, big] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  if (small.length < 2) return false;
  return small.every((t) => big.includes(t));
}

export function clampCooldownDays(days: number | undefined): number {
  const value = Number.isFinite(days) ? Math.round(days as number) : COOLDOWN_DEFAULTS.DEFAULT_DAYS;
  return Math.min(
    COOLDOWN_DEFAULTS.MAX_DAYS,
    Math.max(COOLDOWN_DEFAULTS.MIN_DAYS, value),
  );
}

export interface PriorApplication {
  organization: string;
  at: number;
}

export interface CooldownDecision {
  blocked: boolean;
  /** Human-readable reason shown in the UI when blocked. */
  reason?: string;
  availableAt?: number;
  lastAppliedAt?: number;
  cooldownDays: number;
}

function isoDate(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

/**
 * Decide whether an application to `organization` is allowed right now.
 * The most recent recorded application to the same company wins.
 */
export function checkCooldown(args: {
  organization: string;
  prior: PriorApplication[];
  now: number;
  cooldownDays?: number;
}): CooldownDecision {
  const cooldownDays = clampCooldownDays(args.cooldownDays);
  const relevant = args.prior.filter(
    (p) => p.at > 0 && sameCompany(p.organization, args.organization),
  );
  if (relevant.length === 0) return { blocked: false, cooldownDays };

  const latest = relevant.reduce((max, p) => (p.at > max ? p.at : max), 0);
  const availableAt = latest + cooldownDays * DAY_MS;
  if (args.now >= availableAt) return { blocked: false, cooldownDays };

  return {
    blocked: true,
    cooldownDays,
    lastAppliedAt: latest,
    availableAt,
    reason: `Company cooldown: you already applied to ${args.organization} on ${isoDate(latest)}. You can apply again on ${isoDate(availableAt)} (${cooldownDays}-day window).`,
  };
}

export { DAY_MS };
