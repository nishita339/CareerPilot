import { describe, expect, test } from "bun:test";
import {
  buildInterviewPrepPrompt,
  parseInterviewPrepResponse,
  generateFallbackInterviewPrep,
} from "../src/convex/interviewPrep";

const sampleProfile = {
  fullName: "Aarav Sharma",
  major: "Computer Science",
  university: "University of Pune",
  skills: ["Python", "FastAPI", "React", "Docker"],
  experience: "SWE Intern at TechCorp",
  projects: "Transit delay prediction engine in Python & Pandas",
  relevantCoursework: "Distributed Systems, Database Engineering",
};

const sampleJob = {
  title: "Junior Backend Developer",
  organization: "Stripe",
  description: "Building scalable payment infrastructure with Python and REST APIs.",
};

describe("interviewPrep", () => {
  test("builds grounded prompt with candidate facts and target job", () => {
    const prompt = buildInterviewPrepPrompt(sampleProfile, sampleJob);

    expect(prompt.system).toContain("STAR answer");
    expect(prompt.system).toContain("NEVER invent companies");
    expect(prompt.user).toContain("Aarav Sharma");
    expect(prompt.user).toContain("Junior Backend Developer");
    expect(prompt.user).toContain("Stripe");
    expect(prompt.user).toContain("Transit delay prediction engine");
  });

  test("parses structured JSON response from LLM into questions and STAR drafts", () => {
    const mockLlmJson = JSON.stringify({
      questions: [
        {
          id: "q-1",
          question: "How did you design your Transit delay prediction engine?",
          type: "technical",
          focusSkillOrCompetency: "System architecture",
          whyAsked: "Tests practical project implementation skills.",
          starAnswerDraft: {
            situation: "City transit buses experienced unpredicted schedule delays.",
            task: "Build an automated pipeline to forecast delays based on telemetry.",
            action: "Ingested 50k rows in Python and trained regression models with Pandas.",
            result: "Identified the top 3 congestion bottlenecks accurately.",
          },
          keyTips: ["Mention the data scale", "Discuss model evaluation metrics"],
        },
      ],
    });

    const kit = parseInterviewPrepResponse(
      mockLlmJson,
      sampleJob.title,
      sampleJob.organization,
      sampleProfile,
    );

    expect(kit.questions).toHaveLength(1);
    expect(kit.questions[0].question).toContain("Transit delay prediction");
    expect(kit.questions[0].starAnswerDraft.action).toContain("Python and trained regression models");
    expect(kit.questions[0].keyTips).toHaveLength(2);
  });

  test("falls back cleanly to deterministic interview prep if JSON is invalid", () => {
    const invalidJson = "Not valid JSON at all";
    const kit = parseInterviewPrepResponse(
      invalidJson,
      sampleJob.title,
      sampleJob.organization,
      sampleProfile,
    );

    expect(kit.questions.length).toBeGreaterThanOrEqual(3);
    expect(kit.jobTitle).toBe("Junior Backend Developer");
    expect(kit.organization).toBe("Stripe");
    expect(kit.questions[0].starAnswerDraft.situation.length).toBeGreaterThan(5);
  });

  test("fallback generator properly incorporates profile skills and company name", () => {
    const fallback = generateFallbackInterviewPrep("ML Engineer", "DeepMind", sampleProfile);

    expect(fallback.questions.length).toBe(3);
    const companyQuestion = fallback.questions.find((q) => q.question.includes("DeepMind"));
    expect(companyQuestion).toBeDefined();

    const techQuestion = fallback.questions.find((q) => q.type === "technical");
    expect(techQuestion?.focusSkillOrCompetency).toContain("Python");
  });
});
