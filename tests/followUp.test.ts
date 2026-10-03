import { describe, expect, test } from "bun:test";
import {
  generateFollowUpMessage,
  isEligibleForFollowUp,
  type FollowUpCandidateContext,
  type FollowUpJobContext,
} from "../src/convex/followUp";

const candidate: FollowUpCandidateContext = {
  fullName: "Aarav Sharma",
  email: "aarav@example.com",
  phone: "+91 9876543210",
  major: "Computer Science",
  topSkills: ["Python", "FastAPI"],
};

const job: FollowUpJobContext = {
  title: "Backend Engineer",
  organization: "Ramp",
};

describe("followUp generator", () => {
  test("generates polite status check email with candidate specifics", () => {
    const msg = generateFollowUpMessage("status_check", candidate, job);

    expect(msg.subject).toContain("Following Up: Backend Engineer");
    expect(msg.body).toContain("Aarav Sharma");
    expect(msg.body).toContain("Ramp");
    expect(msg.body).toContain("Python");
    expect(msg.tips.length).toBeGreaterThan(0);
  });

  test("generates post-interview thank you email referencing interviewer", () => {
    const interviewJob: FollowUpJobContext = {
      ...job,
      interviewerName: "Sarah Jenkins",
    };
    const msg = generateFollowUpMessage("post_interview", candidate, interviewJob);

    expect(msg.subject).toContain("Thank You");
    expect(msg.body).toContain("Dear Sarah Jenkins");
    expect(msg.body).toContain("Python");
  });

  test("accurately computes eligibility window (5-14 days after applying)", () => {
    const now = new Date("2026-10-15T00:00:00Z").getTime();
    const oneDay = 24 * 60 * 60 * 1000;

    // Applied 2 days ago: too early
    expect(isEligibleForFollowUp(now - 2 * oneDay, "Applied", now)).toBe(false);

    // Applied 7 days ago: prime time
    expect(isEligibleForFollowUp(now - 7 * oneDay, "Applied", now)).toBe(true);

    // Applied 16 days ago: past window
    expect(isEligibleForFollowUp(now - 16 * oneDay, "Applied", now)).toBe(false);

    // Already interviewed: not a generic status check
    expect(isEligibleForFollowUp(now - 7 * oneDay, "Interview", now)).toBe(false);
  });
});
