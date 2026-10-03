import { describe, expect, test } from "bun:test";
import { explainMatchScore } from "../src/convex/scoreExplainer";

const profile = {
  skills: ["Python", "FastAPI", "React", "Docker", "PostgreSQL"],
  experience: "SWE Intern for 1 year handling backend APIs",
  projects: "Transit delay prediction engine",
  relevantCoursework: "Distributed Systems, Database Engineering",
  targetRoles: ["Backend Engineer", "Software Engineer"],
  opportunityTypes: ["internship", "job"],
  locations: "Pune, Bangalore",
  openToRemote: true,
  major: "Computer Science",
};

const job = {
  title: "Backend Engineer Intern",
  organization: "Stripe",
  opportunityType: "internship",
  location: "Bangalore",
  remoteOk: true,
  description: "Requires Python, Docker, PostgreSQL, and REST APIs. Distributed systems coursework is a plus.",
};

describe("scoreExplainer", () => {
  test("deconstructs score into all 6 distinct dimensions", () => {
    const explanation = explainMatchScore(profile, job);

    expect(explanation.overallScore).toBeGreaterThanOrEqual(75);
    expect(explanation.tier).toBe("Top Match");
    expect(explanation.dimensions).toHaveLength(6);

    const names = explanation.dimensions.map((d) => d.name);
    expect(names).toContain("Technical Skills");
    expect(names).toContain("Role & Title Alignment");
    expect(names).toContain("Experience Level");
    expect(names).toContain("Location & Remote");
    expect(names).toContain("Opportunity Category");
    expect(names).toContain("Relevant Coursework");

    expect(explanation.matchedSkills).toContain("Python");
    expect(explanation.matchedSkills).toContain("Docker");
  });

  test("generates actionable score booster tips for lower-scoring dimensions", () => {
    const sparseProfile = {
      skills: ["HTML"],
      targetRoles: ["Data Scientist"],
      opportunityTypes: ["job"],
      openToRemote: false,
    };

    const explanation = explainMatchScore(sparseProfile, job);
    expect(explanation.overallScore).toBeLessThan(50);
    expect(explanation.boosterTips.length).toBeGreaterThan(0);

    const boosterDims = explanation.boosterTips.map((b) => b.dimension);
    expect(boosterDims).toContain("Skills");
  });

  test("clamps overall score between 0 and 100", () => {
    const emptyProfile = {
      targetRoles: [],
      opportunityTypes: [],
      openToRemote: false,
    };
    const explanation = explainMatchScore(emptyProfile, {
      title: "Unknown",
      organization: "Unknown",
      opportunityType: "unknown",
      remoteOk: false,
    });

    expect(explanation.overallScore).toBeGreaterThanOrEqual(0);
    expect(explanation.overallScore).toBeLessThanOrEqual(100);
  });
});
