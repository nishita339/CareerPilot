// Pure scheduling helpers (no Convex imports) so they are unit-testable.
//
// Convex cron expressions are static, so the cron fires every hour at :30 and
// each profile decides whether this is its hour. `lastDigestAt` guards against
// a duplicate run inside the same day.

export const SCHEDULE_DEFAULTS = {
  /** Default digest hour in UTC — 06:30 UTC = 12:00 IST. */
  DIGEST_HOUR_UTC: 6,
  MINUTE_UTC: 30,
  /** Do not send a second digest within this many hours. */
  MIN_HOURS_BETWEEN_DIGESTS: 20,
} as const;

export function clampDigestHourUtc(hour: number | undefined): number {
  if (hour === undefined || !Number.isFinite(hour)) {
    return SCHEDULE_DEFAULTS.DIGEST_HOUR_UTC;
  }
  return Math.min(23, Math.max(0, Math.round(hour)));
}

export interface ScheduleDecision {
  run: boolean;
  reason: "scheduled-hour" | "already-sent-today" | "not-this-hour";
  hourUtc: number;
}

/**
 * Should this profile's daily collect + score + digest run right now?
 * `now` is a timestamp; the current UTC hour must equal the profile's hour.
 */
export function shouldRunForProfile(args: {
  now: number;
  digestHourUtc?: number;
  lastDigestAt?: number;
}): ScheduleDecision {
  const hourUtc = clampDigestHourUtc(args.digestHourUtc);
  const nowHour = new Date(args.now).getUTCHours();
  if (nowHour !== hourUtc) {
    return { run: false, reason: "not-this-hour", hourUtc };
  }
  const sinceLast = args.lastDigestAt
    ? args.now - args.lastDigestAt
    : Number.POSITIVE_INFINITY;
  if (sinceLast < SCHEDULE_DEFAULTS.MIN_HOURS_BETWEEN_DIGESTS * 3_600_000) {
    return { run: false, reason: "already-sent-today", hourUtc };
  }
  return { run: true, reason: "scheduled-hour", hourUtc };
}

/** "06:30 UTC" — the UI adds the browser's local rendering on top of this. */
export function digestTimeUtcLabel(hourUtc: number | undefined): string {
  const hour = clampDigestHourUtc(hourUtc);
  return `${String(hour).padStart(2, "0")}:${SCHEDULE_DEFAULTS.MINUTE_UTC} UTC`;
}
