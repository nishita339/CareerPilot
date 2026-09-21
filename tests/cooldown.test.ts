import { describe, expect, test } from "bun:test";
import {
  applicationEvents,
  buildPriorApplications,
  checkCooldown,
  countApplicationsSince,
  UNDO_ACTION,
  clampCooldownDays,
  COOLDOWN_DEFAULTS,
  isApplicationAction,
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

describe("undoing a hand-recorded application", () => {
  const jobOrgs = new Map([
    ["job_manual", "Handshake Labs"],
    ["job_email", "Acme Cloud"],
  ]);
  const manualAt = NOW - 3 * 3_600_000; // applied 3h ago, same day

  const base = [
    {
      action: "applied (manual)",
      createdAt: manualAt,
      organization: "Handshake Labs",
      jobId: "job_manual",
    },
    {
      action: "applied (email)",
      createdAt: manualAt,
      organization: "Acme Cloud",
      jobId: "job_email",
    },
  ];

  test("a mis-clicked application stops counting once undone", () => {
    const activity = [
      ...base,
      {
        action: UNDO_ACTION,
        createdAt: manualAt + 60_000,
        organization: "Handshake Labs",
        jobId: "job_manual",
      },
    ];

    // Cap: only the emailed application is left today.
    expect(countApplicationsSince(activity, NOW - 12 * 3_600_000)).toBe(1);

    // Cooldown: the company is free again.
    const prior = buildPriorApplications({ activity, organizationByJobId: jobOrgs });
    expect(prior.map((p) => p.organization)).toEqual(["Acme Cloud"]);
    expect(
      checkCooldown({ organization: "Handshake Labs", prior, now: NOW }).blocked,
    ).toBe(false);
  });

  test("an undone application followed by a new one counts again", () => {
    const activity = [
      ...base,
      {
        action: UNDO_ACTION,
        createdAt: manualAt + 60_000,
        organization: "Handshake Labs",
        jobId: "job_manual",
      },
      {
        action: "applied (manual)",
        createdAt: manualAt + 120_000,
        organization: "Handshake Labs",
        jobId: "job_manual",
      },
    ];
    expect(countApplicationsSince(activity, NOW - 12 * 3_600_000)).toBe(2);
    expect(
      checkCooldown({
        organization: "Handshake Labs",
        prior: buildPriorApplications({ activity, organizationByJobId: jobOrgs }),
        now: NOW,
      }).blocked,
    ).toBe(true);
  });

  test("an email send is never undone, even if a marker row appears", () => {
    const activity = [
      {
        action: "applied (email)",
        createdAt: manualAt,
        organization: "Acme Cloud",
        jobId: "job_email",
      },
      {
        action: UNDO_ACTION,
        createdAt: manualAt + 60_000,
        organization: "Acme Cloud",
        jobId: "job_email",
      },
    ];
    // The marker only cancels hand-recorded rows; a delivered email stands.
    expect(applicationEvents(activity).map((e) => e.action)).toEqual([
      "applied (email)",
    ]);
    expect(
      checkCooldown({
        organization: "Acme Cloud",
        prior: buildPriorApplications({ activity, organizationByJobId: jobOrgs }),
        now: NOW,
      }).blocked,
    ).toBe(true);
  });

  test("an out-of-order marker does not cancel a later application", () => {
    const activity = [
      {
        action: UNDO_ACTION,
        createdAt: manualAt - 60_000, // before the application it mentions
        jobId: "job_manual",
      },
      ...base,
    ];
    expect(countApplicationsSince(activity, NOW - 12 * 3_600_000)).toBe(2);
  });

  test("non-application rows are still ignored entirely", () => {
    expect(
      countApplicationsSince(
        [
          { action: "tailored (v1, validated)", createdAt: NOW - 1000 },
          { action: UNDO_ACTION, createdAt: NOW - 500, jobId: "job_manual" },
        ],
        0,
      ),
    ).toBe(0);
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

describe("buildPriorApplications (audit trail -> cooldown history)", () => {
  const jobOrgs = new Map([
    ["job_email", "Acme Cloud"],
    ["job_manual", "Handshake Labs"],
    ["job_legacy", "Globex"],
  ]);

  const activity = [
    // Sent by CareerPilot after approval.
    {
      action: "applied (email)",
      createdAt: NOW - 5 * DAY,
      organization: "Acme Cloud",
      jobId: "job_email",
    },
    // Submitted by hand on the employer's site and recorded in the app.
    {
      action: "applied (manual)",
      createdAt: NOW - 2 * DAY,
      organization: "Handshake Labs",
      jobId: "job_manual",
    },
    // Row written before the organization field existed: fall back to the job.
    { action: "applied (email)", createdAt: NOW - 20 * DAY, jobId: "job_legacy" },
    // Everything below must never consume cooldown or quota.
    { action: "tailored (v2, validated)", createdAt: NOW - 4 * DAY, jobId: "job_email" },
    { action: "status → Approved", createdAt: NOW - 3 * DAY, jobId: "job_manual" },
    { action: "scored", createdAt: NOW - 1 * DAY },
    { action: "scheduled daily run", createdAt: NOW - 1 * DAY },
    { action: "exported resume PDF", createdAt: NOW - 1 * DAY, jobId: "job_manual" },
  ];

  test("counts hand-submitted applications exactly like emailed ones", () => {
    const prior = buildPriorApplications({ activity, organizationByJobId: jobOrgs });
    expect(prior).toHaveLength(3);
    expect(prior.map((p) => p.organization)).toEqual([
      "Acme Cloud",
      "Handshake Labs",
      "Globex",
    ]);
    expect(prior.every((p) => p.at > 0)).toBe(true);
  });

  test("a manual apply inside the window blocks the same company", () => {
    const prior = buildPriorApplications({ activity, organizationByJobId: jobOrgs });
    const decision = checkCooldown({
      organization: "Handshake Labs (demo)",
      prior,
      now: NOW,
    });
    expect(decision.blocked).toBe(true);
    expect(decision.lastAppliedAt).toBe(NOW - 2 * DAY);
    expect(decision.reason).toContain("Handshake Labs (demo)");
  });

  test("a manual apply outside the window is allowed", () => {
    const prior = buildPriorApplications({ activity, organizationByJobId: jobOrgs });
    const decision = checkCooldown({ organization: "Handshake Labs", prior, now: NOW + 6 * DAY });
    expect(decision.blocked).toBe(false);
  });

  test("only applied* actions are applications", () => {
    expect(isApplicationAction("applied (email)")).toBe(true);
    expect(isApplicationAction("applied (manual)")).toBe(true);
    expect(isApplicationAction("tailored (v1, validated)")).toBe(false);
    expect(isApplicationAction("status → Approved")).toBe(false);
  });

  test("non-application rows never count", () => {
    const prior = buildPriorApplications({
      activity: activity.filter((a) => !a.action.startsWith("applied")),
      organizationByJobId: jobOrgs,
    });
    expect(prior).toEqual([]);
  });

  test("a since-window filters by timestamp (daily quota semantics)", () => {
    const prior = buildPriorApplications({
      activity,
      organizationByJobId: jobOrgs,
      since: NOW - 3 * DAY,
    });
    expect(prior).toEqual([
      { organization: "Handshake Labs", at: NOW - 2 * DAY },
    ]);
  });
});
