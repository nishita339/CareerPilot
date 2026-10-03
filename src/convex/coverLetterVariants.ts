// Cover Letter A/B Variant Generator
// Produces two distinct cover letter tones (Formal/Corporate vs. Conversational/Startup)
// grounded strictly in candidate profile facts, without hallucinating metrics or employers.
// Pure module: deterministic, unit testable.

export interface CoverLetterVariant {
  tone: "formal" | "conversational";
  headline: string;
  salutation: string;
  bodyParagraphs: string[];
  signOff: string;
  fullHtml: string;
  fullPlainText: string;
  bestSuitedFor: string;
}

export interface CoverLetterPair {
  jobTitle: string;
  organization: string;
  variantA_Formal: CoverLetterVariant;
  variantB_Conversational: CoverLetterVariant;
  generatedAt: number;
}

export function buildCoverLetterVariantsPrompt(
  profile: {
    fullName: string;
    major: string;
    university: string;
    skills: string[];
    experience?: string;
    projects?: string;
  },
  job: {
    title: string;
    organization: string;
    description?: string;
  },
): { system: string; user: string } {
  const system = `You are a career mentor crafting tailored cover letters for students and graduates.
Produce two contrasting cover letter styles for the candidate:
1. "formal": Professional, traditional corporate structure, respectful and metric-driven. Suitable for enterprise, finance, government, or established corporations.
2. "conversational": Direct, punchy, modern startup tone ("builder mindset"). Suitable for high-growth tech startups, lab teams, and agile software companies.

CRITICAL RULES:
- Use ONLY facts, skills, and projects from the profile. Never invent employers, certifications, or metrics.
- Keep each letter under 300 words (3-4 paragraphs max).
- Return strict JSON with no markdown wrapping:
{
  "variantA": {
    "headline": "Formal & Corporate Cover Letter",
    "salutation": "Dear Hiring Team at [Org],",
    "bodyParagraphs": ["para1", "para2", "para3"],
    "signOff": "Sincerely,\n[Name]"
  },
  "variantB": {
    "headline": "Conversational & Tech Startup Cover Letter",
    "salutation": "Hi [Org] Team,",
    "bodyParagraphs": ["para1", "para2", "para3"],
    "signOff": "Best regards,\n[Name]"
  }
}`;

  const user = `Candidate:
Name: ${profile.fullName}
Degree: ${profile.major}, ${profile.university}
Skills: ${profile.skills.join(", ")}
Experience: ${profile.experience || "None"}
Projects: ${profile.projects || "None"}

Target Role:
Title: ${job.title}
Company: ${job.organization}
Description: ${(job.description || "").slice(0, 1500)}`;

  return { system, user };
}

function assembleVariant(
  tone: "formal" | "conversational",
  headline: string,
  salutation: string,
  bodyParagraphs: string[],
  signOff: string,
  bestSuitedFor: string,
): CoverLetterVariant {
  const fullPlainText = [
    salutation,
    "",
    ...bodyParagraphs.map((p) => p.trim()),
    "",
    signOff,
  ].join("\n\n");

  const fullHtml = `
<div class="cover-letter cover-letter-${tone}">
  <p class="salutation"><strong>${salutation}</strong></p>
  ${bodyParagraphs.map((p) => `<p>${p}</p>`).join("\n  ")}
  <p class="signoff">${signOff.replace(/\n/g, "<br/>")}</p>
</div>
`.trim();

  return {
    tone,
    headline,
    salutation,
    bodyParagraphs,
    signOff,
    fullHtml,
    fullPlainText,
    bestSuitedFor,
  };
}

/**
 * Deterministic generation of two cover letter tones using candidate facts.
 */
export function generateDeterministicCoverLetters(
  profile: {
    fullName: string;
    major: string;
    university: string;
    skills: string[];
    experience?: string;
    projects?: string;
  },
  job: {
    title: string;
    organization: string;
    description?: string;
  },
): CoverLetterPair {
  const topSkill = profile.skills[0] || "software engineering";
  const secondSkill = profile.skills[1] || "technical problem solving";
  const projectSummary = profile.projects
    ? profile.projects.split("\n")[0]
    : `coursework in ${profile.major}`;

  // Variant A: Formal
  const formal = assembleVariant(
    "formal",
    "Formal / Enterprise Edition",
    `Dear Hiring Team at ${job.organization},`,
    [
      `I am writing to express my strong interest in the ${job.title} role at ${job.organization}. As a ${profile.major} student at ${profile.university}, I have developed hands-on technical foundations in ${topSkill} and ${secondSkill}, which align closely with the qualifications outlined for this position.`,
      `During my practical project work, specifically involving ${projectSummary}, I focused on engineering reliable and well-tested solutions. My background emphasizes structured problem solving, clean documentation, and practical execution.`,
      `I welcome the opportunity to discuss how my academic background and engineering projects can support ${job.organization}'s objectives. Thank you for your consideration.`,
    ],
    `Sincerely,\n${profile.fullName}`,
    "Best for enterprise companies, traditional organizations, and finance.",
  );

  // Variant B: Conversational
  const conversational = assembleVariant(
    "conversational",
    "Conversational / Startup Edition",
    `Hi ${job.organization} team,`,
    [
      `I've been following what ${job.organization} is building, and I was thrilled to see an opening for a ${job.title}. I'm a builder at heart, studying ${profile.major} at ${profile.university} and working extensively with ${topSkill} and ${secondSkill}.`,
      `Recently, I worked on ${projectSummary}. I love diving into complex problems, debugging fast, and turning ideas into production-ready software with minimal overhead.`,
      `I'd love to chat about how I can jump in and start contributing to your team. Let me know when you have 15 minutes!`,
    ],
    `Best regards,\n${profile.fullName}`,
    "Best for fast-moving startups, agile teams, and modern tech labs.",
  );

  return {
    jobTitle: job.title,
    organization: job.organization,
    variantA_Formal: formal,
    variantB_Conversational: conversational,
    generatedAt: Date.now(),
  };
}

/**
 * Parses JSON response from LLM into CoverLetterPair with fallback.
 */
export function parseCoverLetterVariantsResponse(
  rawJson: string,
  profile: {
    fullName: string;
    major: string;
    university: string;
    skills: string[];
    experience?: string;
    projects?: string;
  },
  job: {
    title: string;
    organization: string;
    description?: string;
  },
): CoverLetterPair {
  try {
    const cleaned = rawJson
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/, "")
      .replace(/\s*```$/, "")
      .trim();

    const parsed = JSON.parse(cleaned) as {
      variantA?: {
        headline?: string;
        salutation?: string;
        bodyParagraphs?: string[];
        signOff?: string;
      };
      variantB?: {
        headline?: string;
        salutation?: string;
        bodyParagraphs?: string[];
        signOff?: string;
      };
    };

    if (
      parsed.variantA?.bodyParagraphs?.length &&
      parsed.variantB?.bodyParagraphs?.length
    ) {
      const vA = assembleVariant(
        "formal",
        parsed.variantA.headline || "Formal & Corporate Cover Letter",
        parsed.variantA.salutation || `Dear Hiring Team at ${job.organization},`,
        parsed.variantA.bodyParagraphs,
        parsed.variantA.signOff || `Sincerely,\n${profile.fullName}`,
        "Best for enterprise companies, traditional organizations, and finance.",
      );

      const vB = assembleVariant(
        "conversational",
        parsed.variantB.headline || "Conversational & Startup Cover Letter",
        parsed.variantB.salutation || `Hi ${job.organization} Team,`,
        parsed.variantB.bodyParagraphs,
        parsed.variantB.signOff || `Best regards,\n${profile.fullName}`,
        "Best for fast-moving startups, agile teams, and modern tech labs.",
      );

      return {
        jobTitle: job.title,
        organization: job.organization,
        variantA_Formal: vA,
        variantB_Conversational: vB,
        generatedAt: Date.now(),
      };
    }
  } catch {
    // Fall back to deterministic generation
  }

  return generateDeterministicCoverLetters(profile, job);
}
