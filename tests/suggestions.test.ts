import { describe, expect, test } from "bun:test";
import {
  buildSuggestions,
  REQUIRED_FIELDS,
  setupStatus,
  suggestionCounts,
  type SuggestionInput,
  type SuggestionJob,
} from "../src/convex/suggestions";

const complete = {
  fullName: "Aarav Sharma",
  email: "aarav@example.com",
  phone: "+91 90000 00000",
  location: "Pune, India",
  headline: "CS junior — data & backend",
  major: "Computer Science",
  university: "University of Pune",
  graduationYear: "2027",
  gpa: "8.6",
  relevantCoursework: "Databases, Machine Learning",
  links: "github.com/aarav",
  skills: ["Python", "SQL", "Pandas", "React"],
  experience: "Data Science Intern at Northwind — built ETL handling 40k rows daily",
  projects:
    "Transit delay analysis in Pandas on 50k rows\nCut manual review time from 3h to 40min",
  certifications: "AWS Cloud Practitioner",
  targetRoles: ["Software Engineer Intern"],
  opportunityTypes: ["job", "internship"],
  masterResumeText: "Aarav Sharma — Computer Science junior. ".padEnd(140, "Details. "),
  minMatchScore: 70,
};

const baseInput: SuggestionInput = { profile: complete, jobs: [] };

function ids(input: SuggestionInput) {
  return buildSuggestions(input).map((s) => s.id);
}

describe("setupStatus", () => {
  test("an empty profile is incomplete and lists every required field", () => {
    const status = setupStatus({});
    expect(status.complete).toBe(false);
    expect(status.percent).toBe(0);
    expect(status.missing).toHaveLength(REQUIRED_FIELDS.length);
    expect(status.missing.map((m) => m.field)).toContain("masterResumeText");
  });

  test("null profile is handled", () => {
    expect(setupStatus(null).missing).toHaveLength(REQUIRED_FIELDS.length);
  });

  test("a complete profile reports 100%", () => {
    const status = setupStatus(complete);
    expect(status.complete).toBe(true);
    expect(status.percent).toBe(100);
    expect(status.missing).toHaveLength(0);
  });

  test("a weak email, short phone or thin skill list does not count", () => {
    expect(setupStatus({ ...complete, email: "not-an-email" }).complete).toBe(false);
    expect(setupStatus({ ...complete, phone: "12" }).complete).toBe(false);
    expect(setupStatus({ ...complete, skills: ["Python", "SQL"] }).complete).toBe(false);
  });

  test("either a resume file or pasted text satisfies the resume requirement", () => {
    const withFile = { ...complete, masterResumeText: undefined, resumeFileName: "cv.pdf" };
    expect(setupStatus(withFile).complete).toBe(true);
    const withNeither = { ...complete, masterResumeText: undefined };
    const status = setupStatus(withNeither);
    expect(status.complete).toBe(false);
    expect(status.missing.map((m) => m.field)).toEqual(["masterResumeText"]);
    expect(status.missing[0].label).toBe("Your resume");
  });
});

describe("buildSuggestions", () => {
  test("a complete profile with no pipeline raises nothing", () => {
    expect(buildSuggestions(baseInput)).toHaveLength(0);
  });

  test("the biggest gap is listed first and points at the missing fields", () => {
    const list = buildSuggestions({ profile: { fullName: "Aarav" }, jobs: [] });
    expect(list[0].id).toBe("setup-required");
    expect(list[0].severity).toBe("high");
    expect(list[0].detail).toContain("At least 3 skills");
    expect(list[0].detail).toContain("Your resume");
  });

  test("advises on missing metrics", () => {
    const list = buildSuggestions({
      ...baseInput,
      profile: {
        ...complete,
        experience: "Data Science Intern at Northwind — built ETL in Python",
        projects: "Transit analysis in Pandas\nPersonal blog in TypeScript",
      },
    });
    expect(list.map((s) => s.id)).toContain("resume-metrics");
  });

  test("flags filler phrasing and first-person pronouns", () => {
    const list = buildSuggestions({
      ...baseInput,
      profile: {
        ...complete,
        projects: "I built a passionate, results-driven data platform in 2026",
      },
    });
    const ids = list.map((s) => s.id);
    expect(ids).toContain("resume-slop");
    expect(ids).toContain("resume-first-person");
  });

  test("suggests a LinkedIn/GitHub link and a headline", () => {
    const list = buildSuggestions({
      ...baseInput,
      profile: { ...complete, links: "", headline: "" },
    });
    const ids = list.map((s) => s.id);
    expect(ids).toContain("setup-links");
    expect(ids).toContain("setup-headline");
  });

  test("surfaces recurring skill gaps without ever suggesting fabrication", () => {
    const jobs: SuggestionJob[] = [
      {
        title: "SWE Intern",
        organization: "Acme",
        opportunityType: "internship",
        status: "Shortlisted",
        missingSkills: ["GraphQL", "Kubernetes"],
      },
      {
        title: "Backend Intern",
        organization: "Cobalt",
        opportunityType: "internship",
        status: "Shortlisted",
        missingSkills: ["GraphQL"],
      },
    ];
    const gaps = buildSuggestions({ profile: complete, jobs }).find(
      (s) => s.id === "skills-gaps",
    );
    expect(gaps?.detail).toContain("GraphQL (2)");
    expect(gaps?.detail).toContain("only if you genuinely have them");
  });

  test("raises validator flags as a high-severity blocker", () => {
    const jobs: SuggestionJob[] = [
      {
        title: "SWE Intern",
        organization: "Acme",
        opportunityType: "internship",
        status: "Resume Ready",
        validationNotes: "Skill \"Kubernetes\" is not in your profile",
      },
    ];
    const flags = buildSuggestions({ profile: complete, jobs }).find(
      (s) => s.id === "validator-flags",
    );
    expect(flags?.severity).toBe("high");
    expect(flags?.detail).toContain("never be sent");
  });

  test("warns about deadlines inside a week", () => {
    const list = buildSuggestions({ ...baseInput, dueSoon: 3 });
    expect(list.map((s) => s.id)).toContain("opportunities-deadlines");
    expect(list.find((s) => s.id === "opportunities-deadlines")?.title).toContain("3");
  });

  test("nudges autopilot for roles that already qualify", () => {
    const jobs: SuggestionJob[] = [
      {
        title: "SWE Intern",
        organization: "Acme",
        opportunityType: "internship",
        status: "Shortlisted",
        applyMode: "email",
        matchScore: 92,
      },
    ];
    const off = buildSuggestions({ profile: complete, jobs }).find(
      (s) => s.id === "autopilot-off",
    );
    expect(off?.title).toContain("qualify for autopilot");
    expect(off?.detail).toContain("Web forms are never automated");

    const armed = buildSuggestions({
      profile: { ...complete, autoApplyEnabled: true },
      jobs,
    });
    expect(armed.map((s) => s.id)).not.toContain("autopilot-off");
    expect(armed.map((s) => s.id)).not.toContain("autopilot-nothing");
  });

  test("tells an armed autopilot that nothing qualifies", () => {
    const jobs: SuggestionJob[] = [
      {
        title: "Data Analyst",
        organization: "Cobalt",
        opportunityType: "job",
        status: "Shortlisted",
        applyMode: "form",
        matchScore: 95,
      },
    ];
    const list = buildSuggestions({
      profile: { ...complete, autoApplyEnabled: true },
      jobs,
    });
    expect(list.map((s) => s.id)).toContain("autopilot-nothing");
  });

  test("warns when nothing clears the score floor", () => {
    const jobs: SuggestionJob[] = [
      {
        title: "Junior Dev",
        organization: "Acme",
        opportunityType: "job",
        status: "Rejected",
        matchScore: 40,
      },
    ];
    const list = buildSuggestions({ profile: complete, jobs });
    expect(list.map((s) => s.id)).toContain("opportunities-none");
  });

  test("orders high severity before medium before low", () => {
    const list = buildSuggestions({
      profile: { fullName: "Aarav", links: "" },
      jobs: [],
      dueSoon: 1,
    });
    const rank = { high: 0, medium: 1, low: 2 } as const;
    for (let i = 1; i < list.length; i++) {
      expect(rank[list[i].severity]).toBeGreaterThanOrEqual(
        rank[list[i - 1].severity],
      );
    }
  });

  test("suggestionCounts totals by severity", () => {
    const list = buildSuggestions({ profile: { fullName: "Aarav" }, jobs: [] });
    const counts = suggestionCounts(list);
    expect(counts.total).toBe(list.length);
    expect(counts.high).toBeGreaterThan(0);
    expect(counts.high + counts.medium + counts.low).toBe(counts.total);
  });

  test("is deterministic for the same input", () => {
    expect(ids(baseInput)).toEqual(ids(baseInput));
  });
});
