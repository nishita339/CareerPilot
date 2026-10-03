import { describe, expect, test } from "bun:test";
import {
  OFFICIAL_EXAMS,
  matchExamsForProfile,
  getUpcomingDeadlines,
  type ExamOpportunity,
} from "../src/convex/examDeadlines";

describe("examDeadlines", () => {
  test("contains verified official portals with valid https URLs", () => {
    expect(OFFICIAL_EXAMS.length).toBeGreaterThanOrEqual(10);
    for (const exam of OFFICIAL_EXAMS) {
      expect(exam.officialUrl).toMatch(/^https:\/\//);
      expect(exam.conductingBody.length).toBeGreaterThan(2);
      expect(exam.windows.length).toBeGreaterThan(0);
    }
  });

  test("prioritizes foreign admission exams for students looking for study abroad", () => {
    const profile = {
      major: "Computer Science",
      opportunityTypes: ["study-abroad"],
      country: "Germany",
    };

    const matches = matchExamsForProfile(profile);
    expect(matches.length).toBeGreaterThan(0);

    const topExam = matches[0].exam;
    expect(["gre-general", "ielts-academic", "toefl-ibt"]).toContain(topExam.id);
    expect(matches[0].relevanceScore).toBeGreaterThanOrEqual(70);
  });

  test("prioritizes government exams for govt-exam seekers", () => {
    const profile = {
      major: "Civil Engineering",
      opportunityTypes: ["govt-exam"],
      country: "India",
    };

    const matches = matchExamsForProfile(profile);
    const govtExams = matches.filter((m) => m.exam.category === "govt-recruitment");
    expect(govtExams.length).toBeGreaterThan(0);
    expect(govtExams[0].relevanceScore).toBeGreaterThanOrEqual(60);
  });

  test("accurately calculates upcoming deadlines within a time window", () => {
    const mockExams: ExamOpportunity[] = [
      {
        id: "mock-1",
        name: "Mock Exam 1",
        category: "admission-national",
        conductingBody: "Test Agency",
        officialUrl: "https://example.org",
        eligibility: "All",
        frequency: "Annual",
        tags: ["stem"],
        windows: [
          {
            label: "Registration",
            deadline: "2026-10-15",
          },
        ],
      },
      {
        id: "mock-2",
        name: "Mock Exam 2 (Far away)",
        category: "admission-foreign",
        conductingBody: "Global Agency",
        officialUrl: "https://example.org",
        eligibility: "All",
        frequency: "Annual",
        tags: ["stem"],
        windows: [
          {
            label: "Registration",
            deadline: "2027-05-01",
          },
        ],
      },
    ];

    const fixedNow = new Date("2026-10-01T00:00:00Z").getTime();
    const upcoming = getUpcomingDeadlines(mockExams, 20, fixedNow);

    expect(upcoming).toHaveLength(1);
    expect(upcoming[0].exam.id).toBe("mock-1");
    expect(upcoming[0].daysRemaining).toBe(14);
  });
});
