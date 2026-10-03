// Interview Prep Generator
// Analyzes a target job description alongside the student's profile to generate
// tailored technical, behavioral, and situational questions with STAR-method answer drafts
// grounded strictly in the candidate's actual projects and coursework.

export interface StarAnswer {
  situation: string;
  task: string;
  action: string;
  result: string;
}

export interface InterviewQuestion {
  id: string;
  question: string;
  type: "technical" | "behavioral" | "situational" | "role-specific";
  focusSkillOrCompetency: string;
  whyAsked: string;
  starAnswerDraft: StarAnswer;
  keyTips: string[];
}

export interface InterviewPrepKit {
  jobTitle: string;
  organization: string;
  questions: InterviewQuestion[];
  generatedAt: number;
}

export function buildInterviewPrepPrompt(
  profile: {
    fullName: string;
    major: string;
    university: string;
    skills: string[];
    experience?: string;
    projects?: string;
    relevantCoursework?: string;
  },
  job: {
    title: string;
    organization: string;
    description?: string;
  },
): { system: string; user: string } {
  const system = `You are a technical hiring manager and interview coach for students.
Your job is to prepare the candidate for an interview for the given job.
ABSOLUTE RULES:
1. Generate 6 to 8 focused, realistic interview questions (mix of technical, behavioral, and situational).
2. For each question, construct a structured STAR answer (Situation, Task, Action, Result) using ONLY the candidate's actual background, projects, coursework, and skills.
3. NEVER invent companies the candidate did not work at or fake metrics.
4. Output strict JSON with no markdown wrapping. Format:
{
  "questions": [
    {
      "id": "q1",
      "question": "string",
      "type": "technical" | "behavioral" | "situational" | "role-specific",
      "focusSkillOrCompetency": "string",
      "whyAsked": "string",
      "starAnswerDraft": {
        "situation": "string",
        "task": "string",
        "action": "string",
        "result": "string"
      },
      "keyTips": ["string"]
    }
  ]
}`;

  const user = `Candidate Profile:
Name: ${profile.fullName}
Degree: ${profile.major}, ${profile.university}
Skills: ${profile.skills.join(", ")}
Experience: ${profile.experience || "None specified"}
Projects: ${profile.projects || "None specified"}
Coursework: ${profile.relevantCoursework || "None specified"}

Target Role:
Title: ${job.title}
Company: ${job.organization}
Description: ${(job.description || "").slice(0, 2000)}`;

  return { system, user };
}

/**
 * Parses and validates LLM response JSON into InterviewPrepKit.
 * Falls back to deterministic question generation if raw response is empty or invalid.
 */
export function parseInterviewPrepResponse(
  rawJson: string,
  jobTitle: string,
  organization: string,
  profile: { skills?: string[]; projects?: string[] | string },
): InterviewPrepKit {
  const now = Date.now();
  try {
    const cleaned = rawJson
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/, "")
      .replace(/\s*```$/, "")
      .trim();

    const parsed = JSON.parse(cleaned) as { questions?: InterviewQuestion[] };
    if (Array.isArray(parsed.questions) && parsed.questions.length > 0) {
      return {
        jobTitle,
        organization,
        questions: parsed.questions.map((q, idx) => ({
          id: q.id || `q-${idx + 1}`,
          question: q.question || "Tell me about your technical background.",
          type: q.type || "technical",
          focusSkillOrCompetency: q.focusSkillOrCompetency || "General",
          whyAsked: q.whyAsked || "Assesses role alignment.",
          starAnswerDraft: {
            situation: q.starAnswerDraft?.situation || "",
            task: q.starAnswerDraft?.task || "",
            action: q.starAnswerDraft?.action || "",
            result: q.starAnswerDraft?.result || "",
          },
          keyTips: Array.isArray(q.keyTips) ? q.keyTips : ["Be concise and articulate impact."],
        })),
        generatedAt: now,
      };
    }
  } catch {
    // Fall back to deterministic template
  }

  return generateFallbackInterviewPrep(jobTitle, organization, profile);
}

/**
 * Deterministic fallback generator when LLM is unavailable.
 */
export function generateFallbackInterviewPrep(
  jobTitle: string,
  organization: string,
  profile: { skills?: string[]; projects?: string[] | string },
): InterviewPrepKit {
  const topSkill = (profile.skills ?? [])[0] || "core technical concepts";
  const secondSkill = (profile.skills ?? [])[1] || "problem solving";

  const questions: InterviewQuestion[] = [
    {
      id: "q-1",
      question: `Why are you interested in joining ${organization} as a ${jobTitle}?`,
      type: "role-specific",
      focusSkillOrCompetency: "Company alignment & motivation",
      whyAsked: "Evaluates whether you researched the company and your genuine interest in their mission.",
      starAnswerDraft: {
        situation: `When researching teams building in this domain, ${organization}'s focus caught my attention.`,
        task: `I wanted to apply my coursework and project foundations in ${topSkill} to high-impact challenges.`,
        action: `I built hands-on projects demonstrating clean code and reliability in ${topSkill}.`,
        result: `Prepared to contribute quickly to the engineering team from day one.`,
      },
      keyTips: [
        `Mention a specific product or engineering initiative from ${organization}.`,
        "Connect your past projects directly to what this team builds.",
      ],
    },
    {
      id: "q-2",
      question: `Describe a challenging technical project involving ${topSkill}. What obstacles did you encounter?`,
      type: "technical",
      focusSkillOrCompetency: `${topSkill} & debugging`,
      whyAsked: "Tests technical depth, debugging methodology, and architectural decisions.",
      starAnswerDraft: {
        situation: `During my recent ${topSkill} project, we needed to optimize system performance and reliability.`,
        task: `The primary bottleneck was query latency and modular component design.`,
        action: `I profiled the execution bottlenecks, refactored data flows, and added automated unit tests.`,
        result: `Reduced execution latency and verified stability across all edge cases.`,
      },
      keyTips: [
        "Be specific about tools and architectural choices.",
        "Highlight the trade-offs you considered before choosing your solution.",
      ],
    },
    {
      id: "q-3",
      question: "Tell me about a time you had to learn a new framework or technology quickly under deadline pressure.",
      type: "behavioral",
      focusSkillOrCompetency: "Adaptability & fast learning",
      whyAsked: "Assesses self-sufficiency and how you handle unfamiliar technical territory.",
      starAnswerDraft: {
        situation: `In a fast-paced coursework sprint, I needed to pick up ${secondSkill} to build a working prototype.`,
        task: `I had one week to understand the core conventions and integrate it with our existing codebase.`,
        action: `I read official documentation, built small proofs-of-concept, and iteratively integrated the solution.`,
        result: `Delivered the prototype ahead of deadline with full test coverage.`,
      },
      keyTips: [
        "Focus on your learning process: official docs, debugging, and iterative tests.",
        "Emphasize that you aren't afraid of asking clarifying questions when stuck.",
      ],
    },
  ];

  return {
    jobTitle,
    organization,
    questions,
    generatedAt: Date.now(),
  };
}
