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

describe("classifyOpportunity — study abroad", () => {
  test("detects programmes about studying in another country", () => {
    expect(
      classifyOpportunity("Study in Germany — Master's Programme in Data Science"),
    ).toBe("study-abroad");
    expect(classifyOpportunity("Semester Abroad Exchange Programme 2027")).toBe(
      "study-abroad",
    );
    expect(
      classifyOpportunity(
        "Admission requirements for international students",
        "what you need before you study abroad",
      ),
    ).toBe("study-abroad");
    expect(classifyOpportunity("Master's in Canada", "two-year programme")).toBe(
      "study-abroad",
    );
  });

  test("a funded programme stays a scholarship", () => {
    expect(
      classifyOpportunity("DAAD Scholarship for Master's Studies in Germany"),
    ).toBe("scholarship");
    expect(classifyOpportunity("Erasmus+ Scholarship", "study in europe")).toBe(
      "scholarship",
    );
  });

  test("research and fellowships keep winning", () => {
    expect(classifyOpportunity("PhD position — study abroad programme")).toBe(
      "research",
    );
    // "research fellow" has no research marker from the taxonomy's point of
    // view — fellowship wording wins, which keeps it in the Research section
    // anyway (that section covers research + fellowship).
    expect(
      classifyOpportunity("Visiting Research Fellow", "semester abroad exchange"),
    ).toBe("fellowship");
    expect(classifyOpportunity("Fulbright Fellowship", "study in the united states")).toBe(
      "fellowship",
    );
  });

  test("a domestic course page is not study abroad", () => {
    expect(
      classifyOpportunity(
        "Master's Programme in Computer Science",
        "admissions open for the 2027 batch",
      ),
    ).toBe("job");
    expect(classifyOpportunity("Study material for semester exams")).toBe("job");
  });

  test("falls back to the study-abroad channel hint", () => {
    expect(
      classifyOpportunity("Universities with rolling admissions", "", "study-abroad"),
    ).toBe("study-abroad");
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

  test("labels the official portals behind the new sections", () => {
    expect(organizationFromUrl("https://www.daad.de/en/study-in-germany/")).toBe(
      "DAAD (Germany)",
    );
    expect(organizationFromUrl("https://erasmus-plus.ec.europa.eu/opportunities")).toBe(
      "Erasmus+ (EU)",
    );
    expect(organizationFromUrl("https://upsc.gov.in/examinations")).toBe("UPSC");
    expect(organizationFromUrl("https://www.ssc.gov.in/portal")).toBe("SSC");
    expect(organizationFromUrl("https://study-in-germany.de/programmes")).toBe(
      "Study in Germany (DAAD)",
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
