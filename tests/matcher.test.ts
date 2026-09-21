import { describe, expect, test } from "bun:test";
import { scoreMatch } from "../src/convex/matcher";

type Profile = Parameters<typeof scoreMatch>[0];
type Job = Parameters<typeof scoreMatch>[2];

const baseProfile: Profile = {
  targetRoles: ["Software Engineer Intern"],
  opportunityTypes: ["internship", "job"],
  openToRemote: true,
};

const sweInternJob: Job = {
  title: "Software Engineer Intern",
  organization: "Acme Cloud",
  opportunityType: "internship",
  location: "Remote",
  remoteOk: true,
  description:
    "Requirements: TypeScript, React, Node.js, REST APIs, testing, Git. " +
    "1+ years of experience building projects.",
};

const dataJob: Job = {
  title: "Junior Backend Engineer",
  organization: "Cobalt Retail",
  opportunityType: "job",
  location: "Remote",
  remoteOk: true,
  description:
    "Requirements: Go, Kubernetes, Rust, SQL, Docker, system design. 4+ years of experience.",
};

describe("scoreMatch", () => {
  test("strong skill overlap beats a mismatched role", () => {
    const strong = scoreMatch(
      { ...baseProfile, skills: ["TypeScript", "React", "Node.js", "REST APIs", "Git"] },
      null,
      sweInternJob,
    );
    const weak = scoreMatch(
      { ...baseProfile, skills: ["MATLAB / R"], experience: "no overlap" },
      null,
      sweInternJob,
    );
    expect(strong.score).toBeGreaterThan(weak.score);
  });

  test("a well-matched internship clears the default 70 threshold", () => {
    const result = scoreMatch(
      {
        ...baseProfile,
        skills: ["TypeScript", "React", "Node.js", "REST APIs", "Git", "Testing"],
        experience: "1 years of experience building side projects",
        projects: "Chat app in TypeScript and React",
        relevantCoursework: "Databases",
      },
      null,
      sweInternJob,
    );
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.matchedSkills).toContain("TypeScript");
    expect(result.missingSkills).not.toContain("TypeScript");
  });

  test("missing must-have skills are reported, not hidden", () => {
    const result = scoreMatch({ ...baseProfile, skills: ["React"] }, null, dataJob);
    expect(result.missingSkills).toContain("Go");
    expect(result.missingSkills).toContain("Rust");
    expect(result.score).toBeLessThan(70);
  });

  test("score is always clamped to 0-100", () => {
    const perfect = scoreMatch(
      {
        ...baseProfile,
        skills: ["Go", "Kubernetes", "Rust", "SQL", "Docker", "System Design"],
        experience: "5 years of experience",
        projects: "Distributed systems work",
        relevantCoursework: "Operating Systems",
      },
      null,
      dataJob,
    );
    expect(perfect.score).toBeLessThanOrEqual(100);
    expect(perfect.score).toBeGreaterThanOrEqual(0);
  });

  test("remote-friendly profile gains location credit, on-site elsewhere does not", () => {
    const remote = scoreMatch(
      { ...baseProfile, openToRemote: true, locations: "Boston" },
      null,
      sweInternJob,
    );
    const onSiteElsewhere = scoreMatch(
      {
        ...baseProfile,
        openToRemote: false,
        locations: "Boston",
      },
      null,
      { ...sweInternJob, location: "Tokyo, Japan", remoteOk: false },
    );
    expect(remote.explanation).toContain("location");
    expect(remote.score).toBeGreaterThan(onSiteElsewhere.score);
  });

  test("opportunity type mismatch costs points", () => {
    const internFocused = scoreMatch(
      { ...baseProfile, opportunityTypes: ["internship"] },
      null,
      sweInternJob,
    );
    const jobFocused = scoreMatch(
      { ...baseProfile, opportunityTypes: ["job"] },
      null,
      sweInternJob,
    );
    expect(internFocused.score).toBeGreaterThan(jobFocused.score);
  });

  test("explanation names the matched skills", () => {
    const result = scoreMatch(
      { ...baseProfile, skills: ["TypeScript", "React"] },
      null,
      sweInternJob,
    );
    expect(result.explanation).toContain("TypeScript");
    expect(result.explanation.length).toBeGreaterThan(20);
  });
});
