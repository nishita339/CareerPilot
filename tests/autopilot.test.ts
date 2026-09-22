import { describe, expect, test } from "bun:test";
import {
  AUTOPILOT,
  autopilotSettings,
  clampAutoApplyDailyLimit,
  clampAutoApplyMinScore,
  countAutopilotSentSince,
  normalizeAutoApplyTypes,
  selectAutopilotCandidates,
  startOfToday,
  type AutoApplyJob,
} from "../src/convex/autopilotRules";

const armed = {
  autoApplyEnabled: true,
  minMatchScore: 70,
};

function job(overrides: Partial<AutoApplyJob>): AutoApplyJob {
  return {
    jobId: "j1",
    title: "SWE Intern",
    organization: "Acme",
    status: "Shortlisted",
    matchScore: 90,
    opportunityType: "internship",
    applyMode: "email",
    applyEmail: "jobs@acme.io",
    ...overrides,
  };
}

const base = {
  prior: [],
  now: Date.UTC(2026, 8, 22),
  sentToday: 0,
  autoSentToday: 0,
  cap: 10,
};

describe("autopilot settings clamps", () => {
  test("the score floor can never drop below 80", () => {
    expect(clampAutoApplyMinScore(undefined)).toBe(AUTOPILOT.DEFAULT_MIN_SCORE);
    expect(clampAutoApplyMinScore(50)).toBe(AUTOPILOT.MIN_MIN_SCORE);
    expect(clampAutoApplyMinScore(88)).toBe(88);
    expect(clampAutoApplyMinScore(150)).toBe(100);
  });

  test("autopilot can never be looser than the overall match floor", () => {
    expect(clampAutoApplyMinScore(82, 90)).toBe(90);
    expect(clampAutoApplyMinScore(95, 90)).toBe(95);
  });

  test("the daily limit defaults to 2 and is capped at 3", () => {
    expect(clampAutoApplyDailyLimit(undefined)).toBe(AUTOPILOT.DEFAULT_DAILY_LIMIT);
    expect(clampAutoApplyDailyLimit(0)).toBe(1);
    expect(clampAutoApplyDailyLimit(9)).toBe(AUTOPILOT.MAX_DAILY_LIMIT);
    expect(clampAutoApplyDailyLimit(2.4)).toBe(2);
  });

  test("only employment sections are ever auto-applied", () => {
    expect(normalizeAutoApplyTypes(["scholarship", "govt-exam"])).toEqual([
      "job",
      "internship",
    ]);
    expect(normalizeAutoApplyTypes(["research"])).toEqual(["research"]);
    expect(normalizeAutoApplyTypes(undefined)).toEqual(["job", "internship"]);
  });

  test("settings are assembled with the clamps applied", () => {
    expect(autopilotSettings({})).toEqual({
      enabled: false,
      minScore: 85,
      dailyLimit: 2,
      types: ["job", "internship"],
    });
    expect(
      autopilotSettings({
        autoApplyEnabled: true,
        autoApplyMinScore: 99,
        autoApplyDailyLimit: 7,
        autoApplyTypes: ["internship", "govt-exam"],
        minMatchScore: 70,
      }),
    ).toEqual({
      enabled: true,
      minScore: 99,
      dailyLimit: 3,
      types: ["internship"],
    });
  });
});

describe("selectAutopilotCandidates", () => {
  test("does nothing until it is armed", () => {
    const plan = selectAutopilotCandidates({
      ...base,
      profile: { minMatchScore: 70 },
      jobs: [job({})],
    });
    expect(plan.enabled).toBe(false);
    expect(plan.candidates).toHaveLength(0);
  });

  test("picks a high-scoring email role", () => {
    const plan = selectAutopilotCandidates({
      ...base,
      profile: armed,
      jobs: [job({ matchScore: 91 })],
    });
    expect(plan.candidates).toHaveLength(1);
    expect(plan.candidates[0]).toMatchObject({
      organization: "Acme",
      matchScore: 91,
      applyEmail: "jobs@acme.io",
    });
  });

  test("ignores roles below the autopilot score, form roles and non-employment types", () => {
    const plan = selectAutopilotCandidates({
      ...base,
      profile: armed,
      jobs: [
        job({ jobId: "low", matchScore: 84 }),
        job({ jobId: "form", applyMode: "form", applyEmail: undefined }),
        job({ jobId: "exam", opportunityType: "govt-exam", matchScore: 99 }),
        job({ jobId: "no-email", applyEmail: undefined }),
        job({ jobId: "already", status: "Resume Ready" }),
        job({ jobId: "goods", matchScore: 88 }),
      ],
    });
    expect(plan.candidates.map((c) => c.jobId)).toEqual(["goods"]);
  });

  test("respects the autopilot daily limit and the overall cap", () => {
    const jobs = [job({ jobId: "a", matchScore: 99 }), job({ jobId: "b", organization: "Cobalt", matchScore: 98 })];

    const limitReached = selectAutopilotCandidates({
      ...base,
      autoSentToday: 2,
      profile: armed,
      jobs,
    });
    expect(limitReached.availableSlots).toBe(0);
    expect(limitReached.candidates).toHaveLength(0);
    expect(limitReached.skipped[0]?.reason).toContain("No autopilot slots left today");

    const capReached = selectAutopilotCandidates({
      ...base,
      sentToday: 10,
      profile: armed,
      jobs,
    });
    expect(capReached.availableSlots).toBe(0);
    expect(capReached.candidates).toHaveLength(0);

    const oneSlot = selectAutopilotCandidates({
      ...base,
      sentToday: 9,
      profile: armed,
      jobs,
    });
    expect(oneSlot.availableSlots).toBe(1);
    expect(oneSlot.candidates).toHaveLength(1);
  });

  test("takes the highest scores first", () => {
    const plan = selectAutopilotCandidates({
      ...base,
      profile: armed,
      jobs: [
        job({ jobId: "mid", organization: "Beta", matchScore: 86 }),
        job({ jobId: "top", organization: "Alpha", matchScore: 97 }),
        job({ jobId: "low", organization: "Gamma", matchScore: 85 }),
      ],
    });
    expect(plan.candidates.map((c) => c.jobId)).toEqual(["top", "mid"]);
  });

  test("blocks a company inside the cooldown window, with a readable reason", () => {
    const plan = selectAutopilotCandidates({
      ...base,
      profile: armed,
      jobs: [job({})],
      prior: [{ organization: "Acme Inc", at: base.now - 2 * 86_400_000 }],
    });
    expect(plan.candidates).toHaveLength(0);
    expect(plan.skipped[0]?.reason).toContain("Company cooldown");
  });

  test("allows a company whose cooldown has expired", () => {
    const plan = selectAutopilotCandidates({
      ...base,
      profile: armed,
      jobs: [job({})],
      prior: [{ organization: "Acme", at: base.now - 10 * 86_400_000 }],
    });
    expect(plan.candidates).toHaveLength(1);
  });

  test("never emails the same company twice in a single run", () => {
    const plan = selectAutopilotCandidates({
      ...base,
      profile: armed,
      jobs: [
        job({ jobId: "first", matchScore: 95 }),
        job({
          jobId: "second",
          title: "Backend Intern",
          organization: "ACME",
          matchScore: 94,
        }),
      ],
    });
    expect(plan.candidates.map((c) => c.jobId)).toEqual(["first"]);
    expect(plan.skipped.map((s) => s.jobId)).toEqual(["second"]);
  });

  test("honours a custom cooldown window", () => {
    const plan = selectAutopilotCandidates({
      ...base,
      profile: armed,
      jobs: [job({})],
      prior: [{ organization: "Acme", at: base.now - 5 * 86_400_000 }],
      cooldownDays: 3,
    });
    expect(plan.candidates).toHaveLength(1);
  });

  test("the autopilot bar follows a stricter overall floor", () => {
    const plan = selectAutopilotCandidates({
      ...base,
      profile: { autoApplyEnabled: true, minMatchScore: 95 },
      jobs: [job({ matchScore: 92 })],
    });
    expect(plan.candidates).toHaveLength(0);
    expect(plan.settings.minScore).toBe(95);
  });
});

describe("counting", () => {
  test("counts only autopilot sends, at or after the cut-off", () => {
    const now = Date.UTC(2026, 8, 22, 12);
    const rows = [
      { action: "applied (email)", createdAt: now - 1000 },
      { action: AUTOPILOT.ACTION, createdAt: now - 1000 },
      { action: AUTOPILOT.ACTION, createdAt: now - 90_000_000 },
      { action: "auto-approved", createdAt: now },
    ];
    expect(countAutopilotSentSince(rows, now - 60_000)).toBe(1);
    expect(countAutopilotSentSince(rows, 0)).toBe(2);
  });

  test("startOfToday is local midnight", () => {
    const noon = new Date(2026, 8, 22, 12, 30).getTime();
    const start = new Date(startOfToday(noon));
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(startOfToday(noon)).toBeLessThanOrEqual(noon);
  });
});
