import { describe, expect, test } from "bun:test";
import {
  SKILL_COURSE_CATALOG,
  getRecommendedCoursesForSkills,
} from "../src/convex/courseMap";

describe("courseMap", () => {
  test("catalog contains popular student skills with valid URLs", () => {
    const keys = Object.keys(SKILL_COURSE_CATALOG);
    expect(keys).toContain("Python");
    expect(keys).toContain("SQL");
    expect(keys).toContain("React");
    expect(keys).toContain("Docker");
    expect(keys).toContain("Git");

    for (const [skill, courses] of Object.entries(SKILL_COURSE_CATALOG)) {
      expect(courses.length).toBeGreaterThan(0);
      for (const course of courses) {
        expect(course.url).toMatch(/^https:\/\//);
        expect(course.title.length).toBeGreaterThan(3);
        expect(course.freeTier).toBe(true);
      }
    }
  });

  test("retrieves recommended courses case-insensitively", () => {
    const recommendations = getRecommendedCoursesForSkills(["python", "DOCKER", "sql"]);
    expect(recommendations).toHaveLength(3);

    const skills = recommendations.map((r) => r.skill);
    expect(skills).toContain("Python");
    expect(skills).toContain("Docker");
    expect(skills).toContain("SQL");

    for (const rec of recommendations) {
      expect(rec.resources.length).toBeGreaterThan(0);
    }
  });

  test("gracefully skips unknown or niche skills", () => {
    const recommendations = getRecommendedCoursesForSkills(["unknown_ancient_skill_xyz"]);
    expect(recommendations).toHaveLength(0);
  });
});
