import { describe, expect, test } from "bun:test";
import { validateClaims } from "../src/convex/validator";

const profile = {
  fullName: "Aarav Sharma",
  skills: ["Python", "Pandas", "SQL", "TypeScript"],
  experience:
    "Data Science Intern at Northwind Analytics — built ETL scripts in Python and SQL",
  projects:
    "Transit delay analysis in Pandas on 50k rows using Python; personal blog in TypeScript",
  university: "University of Pune",
  major: "Computer Science",
  certifications: "AWS Cloud Practitioner",
};

describe("validateClaims", () => {
  test("accepts a truthful, profile-derived resume", () => {
    const result = validateClaims(profile, {
      summary: "Computer Science student focused on Python data analysis and SQL.",
      skills: ["Python", "Pandas", "SQL"],
      bullets: [
        "Analyzed 50k rows of transit data in Python and Pandas",
        "Built ETL scripts in Python and SQL as a Data Science Intern",
      ],
    });
    expect(result.ok).toBe(true);
    expect(result.notes).toHaveLength(0);
  });

  test("flags a skill that is not in the profile", () => {
    const result = validateClaims(profile, {
      summary: "Python data analysis student.",
      skills: ["Python", "Kubernetes"],
      bullets: ["Analyzed 50k rows of transit data in Python and Pandas"],
    });
    expect(result.ok).toBe(false);
    expect(result.notes.join(" ")).toContain("Kubernetes");
  });

  test("flags an invented metric", () => {
    const result = validateClaims(profile, {
      summary: "Python and SQL student.",
      skills: ["Python", "SQL"],
      bullets: ["Cut reporting latency by 47% using Python and SQL"],
    });
    expect(result.ok).toBe(false);
    expect(result.notes.join(" ")).toContain("47%");
  });

  test("flags a fabricated employer", () => {
    const result = validateClaims(profile, {
      summary: "Python and SQL student.",
      skills: ["Python", "SQL"],
      bullets: ["Led a platform migration at Netflix using Python and SQL"],
    });
    expect(result.ok).toBe(false);
    expect(result.notes.length).toBeGreaterThan(0);
  });

  test("flags AI-slop phrasing that cannot be traced to the profile", () => {
    const result = validateClaims(profile, {
      summary: "Passionate dynamic innovator with proven excellence.",
      skills: ["Python", "SQL"],
      bullets: ["Analyzed 50k rows of transit data in Python and Pandas"],
    });
    expect(result.ok).toBe(false);
    expect(result.notes.join(" ").toLowerCase()).toContain("claim cannot be traced");
  });

  test("returns deduplicated notes and never throws on empty input", () => {
    const result = validateClaims(profile, {
      summary: "",
      skills: [],
      bullets: [],
    });
    expect(result.ok).toBe(true);
    const dupes = validateClaims(profile, {
      summary: "Kubernetes expert.",
      skills: ["Kubernetes", "Kubernetes"],
      bullets: [],
    });
    expect(new Set(dupes.notes).size).toBe(dupes.notes.length);
  });
});
