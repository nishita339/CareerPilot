import { describe, expect, test } from "bun:test";
import {
  classifyOpportunity,
  extractApplyEmail,
  organizationFromUrl,
} from "../src/convex/opportunities";

describe("classifyOpportunity — new sections", () => {
  test("detects scholarships", () => {
    expect(
      classifyOpportunity("Merit Scholarship for Undergraduate STEM Students"),
    ).toBe("scholarship");
    expect(
      classifyOpportunity("Post Matric Scholarship 2027", "tuition fee waiver for eligible students"),
    ).toBe("scholarship");
    expect(classifyOpportunity("Study Grant", "bursary of 5000 per year")).toBe(
      "scholarship",
    );
  });

  test("detects government exam notifications", () => {
    expect(
      classifyOpportunity("UPSC Civil Services Examination 2026 Notification"),
    ).toBe("govt-exam");
    expect(classifyOpportunity("SSC CHSL Recruitment 2026 — Apply Online")).toBe(
      "govt-exam",
    );
    expect(
      classifyOpportunity(
        "Government of India recruitment notification for graduates",
        "online application closes soon",
      ),
    ).toBe("govt-exam");
  });

  test("a corporate recruitment ad is not a government exam", () => {
    expect(classifyOpportunity("Backend Engineer — Recruitment Drive at Acme")).toBe(
      "job",
    );
    expect(classifyOpportunity("Data Analyst", "we are hiring; recruitment is ongoing")).toBe(
      "job",
    );
  });

  test("a government exam needs both a government and an exam marker", () => {
    // "notification" alone (no government term) stays a plain job.
    expect(classifyOpportunity("New Notification: Product Update")).toBe("job");
  });

  test("research still wins over scholarship and internship", () => {
    expect(classifyOpportunity("PhD Scholarship in Machine Learning")).toBe("research");
    expect(classifyOpportunity("Research Intern", "scholarship available")).toBe(
      "research",
    );
  });

  test("fellowships and internships are unchanged", () => {
    expect(classifyOpportunity("Research Fellow")).toBe("fellowship");
    expect(classifyOpportunity("Software Engineering Intern")).toBe("internship");
    expect(classifyOpportunity("Working Student Backend")).toBe("internship");
  });

  test("falls back to the source hint", () => {
    expect(classifyOpportunity("Trending topic in data science", "", "scholarship")).toBe(
      "scholarship",
    );
  });
});

describe("extractApplyEmail", () => {
  test("returns the first usable address", () => {
    expect(
      extractApplyEmail("Send your CV to careers@some-uni.edu before the deadline."),
    ).toBe("careers@some-uni.edu");
    expect(
      extractApplyEmail("Two options: hr@acme.io or talent@acme.io"),
    ).toBe("hr@acme.io");
  });

  test("skips machine and noise addresses", () => {
    expect(
      extractApplyEmail("no-reply@company.com — questions? write to hr@company.com"),
    ).toBe("hr@company.com");
    expect(extractApplyEmail("privacy@company.com")).toBeUndefined();
    expect(extractApplyEmail("someone@example.com")).toBeUndefined();
  });

  test("strips trailing punctuation and ignores empty text", () => {
    expect(extractApplyEmail("Apply: jobs@acme.io.")).toBe("jobs@acme.io");
    expect(extractApplyEmail(undefined)).toBeUndefined();
    expect(extractApplyEmail("no address here")).toBeUndefined();
  });

  test("rejects absurdly long candidates", () => {
    const long = `${"a".repeat(90)}@example.org`;
    expect(extractApplyEmail(long)).toBeUndefined();
  });
});

describe("organizationFromUrl", () => {
  test("maps well-known hosts to readable labels", () => {
    expect(organizationFromUrl("https://www.linkedin.com/jobs/view/123")).toBe(
      "LinkedIn (public listing)",
    );
    expect(organizationFromUrl("https://boards.greenhouse.io/acme")).toBe(
      "Greenhouse board",
    );
    expect(organizationFromUrl("https://scholarships.gov.in/list")).toBe(
      "National Scholarship Portal",
    );
  });

  test("falls back to the bare host", () => {
    expect(organizationFromUrl("https://careers.some-uni.edu/apply")).toBe(
      "careers.some-uni.edu",
    );
  });

  test("never throws on junk", () => {
    expect(organizationFromUrl("not a url")).toBe("Web result");
  });
});
