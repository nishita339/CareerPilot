import { describe, expect, test } from "bun:test";
import {
  buildCoverLetterVariantsPrompt,
  generateDeterministicCoverLetters,
  parseCoverLetterVariantsResponse,
} from "../src/convex/coverLetterVariants";

const sampleProfile = {
  fullName: "Aarav Sharma",
  major: "Computer Science",
  university: "University of Pune",
  skills: ["Python", "FastAPI", "React", "Docker"],
  experience: "Backend Intern at CloudScale",
  projects: "Transit delay prediction engine handling 50k events daily",
};

const sampleJob = {
  title: "Junior Backend Developer",
  organization: "Ramp",
  description: "Looking for an engineer to build financial APIs in Python and SQL.",
};

describe("coverLetterVariants", () => {
  test("generates two distinct and contrasting cover letters deterministically", () => {
    const pair = generateDeterministicCoverLetters(sampleProfile, sampleJob);

    expect(pair.variantA_Formal.tone).toBe("formal");
    expect(pair.variantA_Formal.salutation).toContain("Dear Hiring Team at Ramp");
    expect(pair.variantA_Formal.signOff).toContain("Sincerely");
    expect(pair.variantA_Formal.fullPlainText).toContain("Aarav Sharma");

    expect(pair.variantB_Conversational.tone).toBe("conversational");
    expect(pair.variantB_Conversational.salutation).toContain("Hi Ramp team");
    expect(pair.variantB_Conversational.signOff).toContain("Best regards");
    expect(pair.variantB_Conversational.bodyParagraphs.length).toBeGreaterThanOrEqual(3);
  });

  test("builds grounded prompt with profile data and role expectations", () => {
    const prompt = buildCoverLetterVariantsPrompt(sampleProfile, sampleJob);

    expect(prompt.system).toContain("formal");
    expect(prompt.system).toContain("conversational");
    expect(prompt.user).toContain("Aarav Sharma");
    expect(prompt.user).toContain("Ramp");
    expect(prompt.user).toContain("Transit delay prediction engine");
  });

  test("parses structured JSON response from LLM into both variants", () => {
    const mockJson = JSON.stringify({
      variantA: {
        headline: "Custom Enterprise Letter",
        salutation: "To the Hiring Committee at Ramp,",
        bodyParagraphs: ["Para 1 about Python.", "Para 2 about experience."],
        signOff: "Respectfully,\nAarav Sharma",
      },
      variantB: {
        headline: "Startup Builder Note",
        salutation: "Hey Ramp team!",
        bodyParagraphs: ["Excited to contribute to your fintech APIs."],
        signOff: "Cheers,\nAarav",
      },
    });

    const parsed = parseCoverLetterVariantsResponse(mockJson, sampleProfile, sampleJob);
    expect(parsed.variantA_Formal.salutation).toBe("To the Hiring Committee at Ramp,");
    expect(parsed.variantB_Conversational.salutation).toBe("Hey Ramp team!");
  });

  test("falls back cleanly on invalid LLM responses", () => {
    const fallback = parseCoverLetterVariantsResponse("malformed json {", sampleProfile, sampleJob);
    expect(fallback.variantA_Formal.tone).toBe("formal");
    expect(fallback.variantB_Conversational.tone).toBe("conversational");
  });
});
