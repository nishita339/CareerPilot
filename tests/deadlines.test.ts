import { describe, expect, test } from "bun:test";
import {
  daysUntil,
  isDueWithin,
  parseDeadlineValue,
} from "../src/convex/deadlines";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 8, 21, 6, 0, 0); // 2026-09-21

describe("parseDeadlineValue", () => {
  test("parses ISO and slash-separated dates", () => {
    expect(parseDeadlineValue("2026-10-15", NOW)).toBe(Date.UTC(2026, 9, 15));
    expect(parseDeadlineValue("2026/10/15", NOW)).toBe(Date.UTC(2026, 9, 15));
    expect(parseDeadlineValue("2026-10", NOW)).toBe(Date.UTC(2026, 9, 1));
  });

  test("parses written dates", () => {
    expect(parseDeadlineValue("15 Oct 2026", NOW)).toBe(Date.UTC(2026, 9, 15));
    expect(parseDeadlineValue("Oct 15, 2026", NOW)).toBe(Date.UTC(2026, 9, 15));
  });

  test("treats open-ended text as no deadline", () => {
    for (const value of [
      "Rolling",
      "rolling admissions",
      "Open until filled",
      "ASAP",
      "TBD",
      "n/a",
      "",
      undefined,
      null,
    ]) {
      expect(parseDeadlineValue(value, NOW)).toBeNull();
    }
  });

  test("rejects nonsense rather than trusting it", () => {
    expect(parseDeadlineValue("2026-99-99", NOW)).toBeNull();
    expect(parseDeadlineValue("2099-01-01", NOW)).toBeNull(); // typo guard
    expect(parseDeadlineValue("15/10/2026", NOW)).toBeNull(); // ambiguous format
  });
});

describe("daysUntil / isDueWithin", () => {
  test("counts whole days and handles today", () => {
    expect(daysUntil(Date.UTC(2026, 8, 21, 23, 0, 0), NOW)).toBe(1);
    expect(daysUntil(Date.UTC(2026, 8, 24), NOW)).toBe(3);
    expect(daysUntil(Date.UTC(2026, 8, 20), NOW)).toBeLessThan(0);
  });

  test("7-day window is inclusive and excludes past deadlines", () => {
    expect(isDueWithin("2026-09-21", 7, NOW)).toBe(true); // closes today
    expect(isDueWithin("2026-09-28", 7, NOW)).toBe(true); // exactly 7 days
    expect(isDueWithin("2026-09-29", 7, NOW)).toBe(false); // 8 days out
    expect(isDueWithin("2026-09-01", 7, NOW)).toBe(false); // already passed
    expect(isDueWithin("Rolling", 7, NOW)).toBe(false);
    expect(isDueWithin(undefined, 7, NOW)).toBe(false);
  });

  test("window size is configurable", () => {
    expect(isDueWithin("2026-10-15", 30, NOW)).toBe(true);
    expect(isDueWithin("2026-10-15", 7, NOW)).toBe(false);
  });
});
