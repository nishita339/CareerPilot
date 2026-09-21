import { describe, expect, test } from "bun:test";
import {
  asResumeDoc,
  buildResumeDoc,
  renderResumeHtml,
  renderResumeText,
} from "../src/convex/resume";

const profile = {
  fullName: "Aarav Sharma",
  headline: "CS student — data & backend",
  email: "aarav@example.com",
  phone: "+91 90000 00000",
  location: "Pune, India",
  links: "github.com/aarav",
  major: "Computer Science",
  university: "University of Pune",
  graduationYear: "2027",
  gpa: "8.6",
  relevantCoursework: "Databases, Machine Learning",
  certifications: "AWS Cloud Practitioner",
};

const tailored = {
  summary: "Computer Science student focused on Python data analysis.",
  skills: ["Python", "Pandas", "SQL"],
  bullets: ["Analyzed 50k rows of transit data in Python and Pandas"],
};

describe("resume model", () => {
  test("builds a single-column document with the expected sections", () => {
    const doc = buildResumeDoc(profile, tailored);
    expect(doc.name).toBe("Aarav Sharma");
    expect(doc.sections.map((s) => s.heading)).toEqual([
      "Education",
      "Skills",
      "Experience & Projects",
      "Certifications",
      "Summary",
    ]);
    expect(doc.contact).toContain("aarav@example.com");
    expect(doc.sections.find((s) => s.heading === "Experience & Projects")?.kind).toBe(
      "bullets",
    );
  });

  test("omits optional sections when the profile has none", () => {
    const doc = buildResumeDoc(
      { ...profile, certifications: undefined, relevantCoursework: undefined },
      { ...tailored, summary: "" },
    );
    expect(doc.sections.map((s) => s.heading)).toEqual([
      "Education",
      "Skills",
      "Experience & Projects",
    ]);
  });

  test("HTML output is escaped and uses no tables or images", () => {
    const doc = buildResumeDoc(profile, {
      ...tailored,
      bullets: ["Built <script>alert(1)</script> demo in Python"],
    });
    const html = renderResumeHtml(doc);
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<table");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
  });

  test("plain-text rendering keeps one line per bullet", () => {
    const text = renderResumeText(buildResumeDoc(profile, tailored));
    expect(text).toContain("- Analyzed 50k rows of transit data in Python and Pandas");
    expect(text).toContain("SKILLS");
  });

  test("asResumeDoc rejects junk and narrows valid documents", () => {
    expect(asResumeDoc(null)).toBeNull();
    expect(asResumeDoc({ name: "x" })).toBeNull();
    const round = asResumeDoc(buildResumeDoc(profile, tailored));
    expect(round?.name).toBe("Aarav Sharma");
    expect(round?.sections.length).toBe(5);
  });
});
