import { describe, expect, test } from "bun:test";
import {
  checkCooldown,
  clampCooldownDays,
  COOLDOWN_DEFAULTS,
  normalizeOrgName,
  sameCompany,
} from "../src/convex/cooldown";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 8, 21, 12, 0, 0); // 2026-09-21

const appliedDaysAgo = (organization: string, days: number) => ({
  organization,
  at: NOW - days * DAY,
});

describe("normalizeOrgName", () => {
  test("strips legal entity words and parentheticals", () => {
    expect(normalizeOrgName("Acme Inc")).toBe("acme");
    expect(normalizeOrgName("ACME")).toBe("acme");
    expect(normalizeOrgName("Acme Cloud (demo)")).toBe("acme cloud");
    expect(normalizeOrgName("Northwind Analytics, Ltd.")).toBe("northwind analytics");
    expect(normalizeOrgName("Acme Group Holdings")).toBe("acme");
  });

  test("keeps meaningful words and handles ampersands", () => {
    // Industry words stay: stripping "labs"/"cloud" would merge distinct firms.
    expect(normalizeOrgName("Ben & Jerry's Labs")).toBe("ben and jerry s labs");
    expect(normalizeOrgName("Acme Cloud")).toBe("acme cloud");
    expect(normalizeOrgName("")).toBe("");
    expect(normalizeOrgName(undefined)).toBe("");
  });
});

describe("sameCompany", () => {
  test("treats name variants of one employer as the same", () => {
    expect(sameCompany("Acme Inc", "ACME")).toBe(true);
    expect(sameCompany("Acme Cloud", "Acme Cloud Ltd")).toBe(true);
    expect(sameCompany("Nordic AI Institute (demo)", "Nordic AI Institute")).toBe(true);
  });

  test("does not merge a single-word brand with a longer name", () => {
    expect(sameCompany("Acme", "Acme Cloud")).toBe(false);
    expect(sameCompany("Acme Cloud", "Acme Foods")).toBe(false);
    expect(sameCompany("Cobalt Retail", "Cobalt Analytics")).toBe(false);
  });

  test("empty input never matches", () => {
    expect(sameCompany("", "Acme")).toBe(false);
    expect(sameCompany("Acme", "")).toBe(false);
  });
});

describe("checkCooldown", () => {
  test("blocks an application to the same org inside the window", () => {
    const decision = checkCooldown({
      organization: "Acme Cloud",
      prior: [appliedDaysAgo("Acme Cloud", 3)],
      now: NOW,
    });
    expect(decision.blocked).toBe(true);
    expect(decision.reason).toContain("Company cooldown");
    expect(decision.reason).toContain("Acme Cloud");
    expect(decision.reason).toContain("7-day window");
    expect(decision.availableAt).toBe(NOW - 3 * DAY + 7 * DAY);
  });

  test("blocks name variants of the same employer", () => {
    const decision = checkCooldown({
      organization: "ACME",
      prior: [appliedDaysAgo("Acme Inc", 2)],
      now: NOW,
    });
    expect(decision.blocked).toBe(true);
  });

  test("allows an application just outside the window", () => {
    const decision = checkCooldown({
      organization: "Acme Cloud",
      prior: [appliedDaysAgo("Acme Cloud", 7)],
      now: NOW,
    });
    expect(decision.blocked).toBe(false);
  });

  test("allows a different organization", () => {
    const decision = checkCooldown({
      organization: "Globex",
      prior: [appliedDaysAgo("Acme Cloud", 1)],
      now: NOW,
    });
    expect(decision.blocked).toBe(false);
  });

  test("allows an application when there is no history at all", () => {
    expect(
      checkCooldown({ organization: "Acme Cloud", prior: [], now: NOW }).blocked,
    ).toBe(false);
  });

  test("the most recent application to the same company decides", () => {
    const decision = checkCooldown({
      organization: "Acme Cloud",
      prior: [
        appliedDaysAgo("Acme Cloud", 30), // too old on its own
        appliedDaysAgo("Acme Cloud Ltd", 2), // same employer, recent
        appliedDaysAgo("Globex", 1), // different employer
      ],
      now: NOW,
    });
    expect(decision.blocked).toBe(true);
    expect(decision.lastAppliedAt).toBe(NOW - 2 * DAY);
  });

  test("a custom window outside the defaults is respected and clamped", () => {
    const shorter = checkCooldown({
      organization: "Acme Cloud",
      prior: [appliedDaysAgo("Acme Cloud", 4)],
      now: NOW,
      cooldownDays: 3, // below the floor -> clamped to 3 -> 4 days ago is allowed
    });
    expect(shorter.cooldownDays).toBe(COOLDOWN_DEFAULTS.MIN_DAYS);
    expect(shorter.blocked).toBe(false);

    const longer = checkCooldown({
      organization: "Acme Cloud",
      prior: [appliedDaysAgo("Acme Cloud", 20)],
      now: NOW,
      cooldownDays: 30,
    });
    expect(longer.blocked).toBe(true);
    expect(longer.availableAt).toBe(NOW - 20 * DAY + 30 * DAY);
  });

  test("ignores unusable timestamps instead of blocking forever", () => {
    const decision = checkCooldown({
      organization: "Acme Cloud",
      prior: [{ organization: "Acme Cloud", at: 0 }],
      now: NOW,
    });
    expect(decision.blocked).toBe(false);
  });
});

describe("clampCooldownDays", () => {
  test("defaults, floors and ceilings are enforced", () => {
    expect(clampCooldownDays(undefined)).toBe(COOLDOWN_DEFAULTS.DEFAULT_DAYS);
    expect(clampCooldownDays(1)).toBe(COOLDOWN_DEFAULTS.MIN_DAYS);
    expect(clampCooldownDays(7)).toBe(7);
    expect(clampCooldownDays(500)).toBe(COOLDOWN_DEFAULTS.MAX_DAYS);
    expect(clampCooldownDays(Number.NaN)).toBe(COOLDOWN_DEFAULTS.DEFAULT_DAYS);
  });
});
