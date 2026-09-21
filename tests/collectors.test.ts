import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  classifyOpportunity,
  collectorStatuses,
  envList,
  envValue,
} from "../src/convex/collectors";

const MANAGED = [
  "ADZUNA_APP_ID",
  "ADZUNA_APP_KEY",
  "JOOBLE_API_KEY",
  "GREENHOUSE_BOARD_TOKENS",
  "LEVER_BOARD_TOKENS",
  "SEMANTIC_SCHOLAR_API_KEY",
];
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const name of MANAGED) {
    saved[name] = process.env[name];
    delete process.env[name];
  }
});

afterEach(() => {
  for (const name of MANAGED) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
});

describe("classifyOpportunity", () => {
  test("detects research roles from the title", () => {
    expect(classifyOpportunity("Undergraduate Research Assistant")).toBe("research");
    expect(classifyOpportunity("PhD Position in Robotics")).toBe("research");
    expect(classifyOpportunity("Postdoc, Computational Biology")).toBe("research");
  });

  test("detects internships and working-student roles", () => {
    expect(classifyOpportunity("Software Engineer Intern")).toBe("internship");
    expect(classifyOpportunity("Data Science Internship (Summer)")).toBe("internship");
    expect(classifyOpportunity("Working Student Backend")).toBe("internship");
  });

  test("detects fellowships", () => {
    expect(classifyOpportunity("Research Fellow")).toBe("fellowship");
  });

  test("uses description text when the title is generic", () => {
    // "research intern" is a research role, not a generic internship.
    expect(
      classifyOpportunity("Open Position", "We are hiring a research intern for our lab."),
    ).toBe("research");
    expect(
      classifyOpportunity("Open Position", "Summer intern on the payments team."),
    ).toBe("internship");
  });

  test("falls back to a plain job, honouring an explicit source hint", () => {
    expect(classifyOpportunity("Backend Engineer")).toBe("job");
    expect(classifyOpportunity("Data Analyst", "", "research")).toBe("research");
  });

  test("research beats internship when both appear", () => {
    expect(
      classifyOpportunity("Research Intern", "assist the research group"),
    ).toBe("research");
  });
});

describe("environment-driven collector config", () => {
  test("envValue trims and treats blanks as unset", () => {
    process.env.ADZUNA_APP_ID = "  abc123  ";
    process.env.ADZUNA_APP_KEY = "   ";
    expect(envValue("ADZUNA_APP_ID")).toBe("abc123");
    expect(envValue("ADZUNA_APP_KEY")).toBeUndefined();
    expect(envValue("NOT_SET_ANYWHERE")).toBeUndefined();
  });

  test("envList splits commas, spaces and newlines", () => {
    process.env.GREENHOUSE_BOARD_TOKENS = "stripe, figma\nnotion  ramp";
    expect(envList("GREENHOUSE_BOARD_TOKENS")).toEqual([
      "stripe",
      "figma",
      "notion",
      "ramp",
    ]);
  });

  test("collectors without credentials are reported as configured", () => {
    const statuses = collectorStatuses();
    const byName = new Map(statuses.map((s) => [s.name, s]));
    expect(statuses).toHaveLength(8);
    expect(byName.get("RemoteOK")?.configured).toBe(true);
    expect(byName.get("Remotive")?.configured).toBe(true);
    expect(byName.get("arXiv")?.configured).toBe(true);
  });

  test("keyed collectors stay inactive until their env vars exist", () => {
    const before = new Map(
      collectorStatuses().map((s) => [s.name, s.configured]),
    );
    expect(before.get("Adzuna")).toBe(false);
    expect(before.get("Jooble")).toBe(false);
    expect(before.get("Greenhouse")).toBe(false);
    expect(before.get("Lever")).toBe(false);

    process.env.ADZUNA_APP_ID = "id";
    process.env.ADZUNA_APP_KEY = "key";
    process.env.JOOBLE_API_KEY = "key";
    process.env.LEVER_BOARD_TOKENS = "ramp";

    const after = new Map(
      collectorStatuses().map((s) => [s.name, s.configured]),
    );
    expect(after.get("Adzuna")).toBe(true);
    expect(after.get("Jooble")).toBe(true);
    expect(after.get("Lever")).toBe(true);
    expect(after.get("Greenhouse")).toBe(false); // still unset
  });

  test("status output never leaks a credential value", () => {
    process.env.JOOBLE_API_KEY = "super-secret-value";
    const serialized = JSON.stringify(collectorStatuses());
    expect(serialized).not.toContain("super-secret-value");
    expect(serialized).toContain("JOOBLE_API_KEY"); // the variable name is shown
  });
});
