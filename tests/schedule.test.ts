import { describe, expect, test } from "bun:test";
import {
  clampDigestHourUtc,
  digestTimeUtcLabel,
  SCHEDULE_DEFAULTS,
  shouldRunForProfile,
} from "../src/convex/schedule";

const HOUR = 3_600_000;
/** 2026-09-21 06:31 UTC — the cron fires at :30, so 06:30 is "now". */
const AT_0631_UTC = Date.UTC(2026, 8, 21, 6, 31);

describe("clampDigestHourUtc", () => {
  test("defaults to 06 and clamps to 0-23", () => {
    expect(clampDigestHourUtc(undefined)).toBe(
      SCHEDULE_DEFAULTS.DIGEST_HOUR_UTC,
    );
    expect(clampDigestHourUtc(-4)).toBe(0);
    expect(clampDigestHourUtc(23.4)).toBe(23);
    expect(clampDigestHourUtc(48)).toBe(23);
    expect(clampDigestHourUtc(Number.NaN)).toBe(
      SCHEDULE_DEFAULTS.DIGEST_HOUR_UTC,
    );
  });
});

describe("shouldRunForProfile", () => {
  test("runs at the profile's hour when no digest has been sent", () => {
    const decision = shouldRunForProfile({
      now: AT_0631_UTC,
      digestHourUtc: 6,
    });
    expect(decision).toEqual({ run: true, reason: "scheduled-hour", hourUtc: 6 });
  });

  test("an unset hour falls back to the 06:30 UTC default", () => {
    expect(
      shouldRunForProfile({ now: AT_0631_UTC, digestHourUtc: undefined }).run,
    ).toBe(true);
    // 07:31 UTC is outside the default hour.
    expect(
      shouldRunForProfile({ now: AT_0631_UTC + HOUR, digestHourUtc: undefined })
        .run,
    ).toBe(false);
  });

  test("does not run during the other 23 hourly ticks", () => {
    const decision = shouldRunForProfile({
      now: Date.UTC(2026, 8, 21, 14, 31),
      digestHourUtc: 6,
    });
    expect(decision.run).toBe(false);
    expect(decision.reason).toBe("not-this-hour");
  });

  test("a digest sent 20 hours ago still blocks a second run the same day", () => {
    const decision = shouldRunForProfile({
      now: AT_0631_UTC,
      digestHourUtc: 6,
      lastDigestAt: AT_0631_UTC - 2 * HOUR, // e.g. a manual "Send digest" click
    });
    expect(decision.run).toBe(false);
    expect(decision.reason).toBe("already-sent-today");
  });

  test("a digest sent 21 hours ago no longer blocks today's run", () => {
    const decision = shouldRunForProfile({
      now: AT_0631_UTC,
      digestHourUtc: 6,
      lastDigestAt: AT_0631_UTC - 21 * HOUR,
    });
    expect(decision.run).toBe(true);
  });

  test("a custom hour (e.g. 18 UTC for an evening digest) is honoured", () => {
    expect(
      shouldRunForProfile({
        now: Date.UTC(2026, 8, 21, 18, 31),
        digestHourUtc: 18,
      }).run,
    ).toBe(true);
    expect(
      shouldRunForProfile({
        now: Date.UTC(2026, 8, 21, 6, 31),
        digestHourUtc: 18,
      }).run,
    ).toBe(false);
  });
});

describe("digestTimeUtcLabel", () => {
  test("renders HH:30 UTC with the default applied", () => {
    expect(digestTimeUtcLabel(undefined)).toBe("06:30 UTC");
    expect(digestTimeUtcLabel(18)).toBe("18:30 UTC");
    expect(digestTimeUtcLabel(3)).toBe("03:30 UTC");
  });
});
