import { describe, expect, test } from "bun:test";
import { calculateAtsScore } from "../src/convex/atsScore";

const strongResume = `
Aarav Sharma
aarav@example.com | +91 9876543210 | Pune, India | linkedin.com/in/aarav

Education
Bachelor of Technology in Computer Science, University of Pune (2025)
Relevant Coursework: Data Structures, Algorithms, Database Systems

Technical Skills
Languages: Python, TypeScript, SQL, C++
Frameworks & Libraries: React, Node.js, PyTorch, Pandas, FastAPI
Tools & Cloud: Docker, Git, Linux, AWS

Experience
Software Engineering Intern | TechCorp (June 2024 - Dec 2024)
• Developed scalable REST APIs using Python and FastAPI, handling 15k daily requests.
• Optimized PostgreSQL database queries, reducing query response times by 35%.
• Automated CI/CD pipeline deployments using Docker and GitHub Actions.

Projects
Transit Intelligence System (Python, Pandas, React)
• Analyzed 50k rows of municipal transit logs using Pandas to identify route delay bottlenecks.
• Engineered interactive dashboard in React and Tailwind, improving visualization rendering speed by 40%.
• Deployed production Docker containers on AWS EC2 with 99.9% uptime.
`.trim();

describe("calculateAtsScore", () => {
  test("gives a high score to a clean, quantified, keyword-rich resume", () => {
    const result = calculateAtsScore(
      strongResume,
      "Software Engineer Intern (Python / React)",
      "Looking for a software engineer intern proficient in Python, React, SQL, and Docker. Experience with REST APIs and databases required.",
    );

    expect(result.overallScore).toBeGreaterThanOrEqual(75);
    expect(result.verdict).toMatch(/Strong|Excellent/);
    expect(result.categoryScores.keywordMatch.score).toBeGreaterThan(25);
    expect(result.categoryScores.formatCompliance.score).toBeGreaterThanOrEqual(20);
    expect(result.categoryScores.impactAndVerbs.details.metricsCount).toBeGreaterThan(2);
    expect(result.categoryScores.impactAndVerbs.details.actionVerbsCount).toBeGreaterThan(3);
    expect(result.categoryScores.impactAndVerbs.details.slopPhrases).toHaveLength(0);
  });

  test("penalizes missing contact information and missing sections", () => {
    const brokenResume = `
I am a passionate and dynamic results-driven coder.
I worked on some stuff with Python and my friend.
We built a small website.
    `.trim();

    const result = calculateAtsScore(
      brokenResume,
      "Backend Engineer",
      "Requires Python, SQL, Docker, AWS, PostgreSQL.",
    );

    expect(result.overallScore).toBeLessThan(50);
    expect(result.verdict).toBe("Needs Improvement");
    expect(result.categoryScores.formatCompliance.details.failedChecks.length).toBeGreaterThan(1);
    expect(result.categoryScores.impactAndVerbs.details.slopPhrases.length).toBeGreaterThan(0);
    expect(result.topSuggestions.length).toBeGreaterThan(0);
  });

  test("identifies missing required skills accurately", () => {
    const result = calculateAtsScore(
      strongResume,
      "Machine Learning Engineer",
      "Requires Kubernetes, TensorFlow, Computer Vision, and Go.",
    );

    const missing = result.categoryScores.keywordMatch.details.missingSkills;
    expect(missing).toContain("Kubernetes");
    expect(missing).toContain("TensorFlow");
  });

  test("clamps scores reliably between 0 and 100", () => {
    const emptyResult = calculateAtsScore("", "", "");
    expect(emptyResult.overallScore).toBeGreaterThanOrEqual(0);
    expect(emptyResult.overallScore).toBeLessThanOrEqual(100);

    const fullResult = calculateAtsScore(strongResume, "Python Developer", "Python SQL Git");
    expect(fullResult.overallScore).toBeLessThanOrEqual(100);
  });
});
