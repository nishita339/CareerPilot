// ATS Score Simulator: Evaluates resume content against a target job description
// for ATS (Applicant Tracking System) parsing compatibility, keyword match,
// quantifiable impact, formatting hygiene, and readability.
// Pure module: deterministic, no network calls, fully unit testable.

import { extractSkills } from "./skills";

export interface AtsCategoryScore<T = unknown> {
  score: number;
  max: number;
  details: T;
}

export interface AtsScoreBreakdown {
  overallScore: number; // 0 - 100
  verdict: "Excellent" | "Strong" | "Average" | "Needs Improvement";
  categoryScores: {
    keywordMatch: AtsCategoryScore<{
      matchedSkills: string[];
      missingSkills: string[];
      matchPercentage: number;
    }>;
    formatCompliance: AtsCategoryScore<{
      passedChecks: string[];
      failedChecks: string[];
    }>;
    impactAndVerbs: AtsCategoryScore<{
      metricsCount: number;
      actionVerbsCount: number;
      slopPhrases: string[];
    }>;
    readabilityAndLength: AtsCategoryScore<{
      wordCount: number;
      firstPersonCount: number;
      avgBulletLength: number;
    }>;
  };
  topSuggestions: string[];
}

const ACTION_VERBS = [
  "built",
  "developed",
  "designed",
  "engineered",
  "implemented",
  "created",
  "deployed",
  "optimized",
  "automated",
  "scaled",
  "analyzed",
  "architected",
  "integrated",
  "reduced",
  "increased",
  "improved",
  "spearheaded",
  "led",
  "refactored",
  "orchestrated",
  "trained",
  "evaluated",
];

const SLOP_WORDS = [
  "passionate",
  "dynamic",
  "results-driven",
  "results driven",
  "team player",
  "hardworking",
  "hard-working",
  "synergy",
  "detail-oriented",
  "go-getter",
  "self-starter",
  "guru",
  "ninja",
  "rockstar",
];

const METRIC_REGEX = /\b\d+(?:[.,]\d+)?(?:\s?%|\s?k|\s?x|\s?m|\+)?\b/gi;
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/;
const PHONE_REGEX = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|\b\d{10}\b/;

export function calculateAtsScore(
  resumeText: string,
  jobTitle: string = "",
  jobDescription: string = "",
): AtsScoreBreakdown {
  const suggestions: string[] = [];
  const text = resumeText.trim();
  const lowerText = text.toLowerCase();

  /* ---------------- 1. Keyword & Skills Matching (Max 40) ---------------- */
  const jdCombined = `${jobTitle} ${jobDescription}`.trim();
  const jdSkills = extractSkills(jdCombined);
  const resumeSkills = extractSkills(text);

  const resumeSkillsLower = new Set(resumeSkills.map((s) => s.toLowerCase()));
  const matchedSkills: string[] = [];
  const missingSkills: string[] = [];

  for (const s of jdSkills) {
    if (resumeSkillsLower.has(s.toLowerCase())) {
      matchedSkills.push(s);
    } else {
      missingSkills.push(s);
    }
  }

  let keywordScore = 0;
  let matchPercentage = 100;
  if (jdSkills.length > 0) {
    matchPercentage = Math.round((matchedSkills.length / jdSkills.length) * 100);
    keywordScore = Math.round((matchedSkills.length / jdSkills.length) * 35);
  } else {
    // If JD has no detected taxonomy skills, reward having a strong baseline set of skills
    keywordScore = Math.min(35, resumeSkills.length * 5);
  }

  // Bonus for job title alignment (5 pts)
  const titleTokens = jobTitle
    .toLowerCase()
    .split(/[\s/,-]+/)
    .filter((t) => t.length > 3 && !["senior", "junior", "lead", "staff"].includes(t));
  const hasTitleMatch = titleTokens.some((token) => lowerText.includes(token));
  if (hasTitleMatch || titleTokens.length === 0) {
    keywordScore += 5;
  } else {
    suggestions.push(`Target role title keywords ("${jobTitle}") not prominent in resume.`);
  }

  if (missingSkills.length > 0) {
    suggestions.push(
      `Add missing target skills if you have them: ${missingSkills.slice(0, 4).join(", ")}.`,
    );
  }

  /* ---------------- 2. Format & ATS Compliance (Max 25) ------------------ */
  const passedChecks: string[] = [];
  const failedChecks: string[] = [];
  let formatScore = 0;

  // Check contact info
  if (EMAIL_REGEX.test(text)) {
    passedChecks.push("Valid email address detected");
    formatScore += 5;
  } else {
    failedChecks.push("No email address found");
    suggestions.push("Ensure a clear email address is at the top of your resume.");
  }

  if (PHONE_REGEX.test(text)) {
    passedChecks.push("Phone number detected");
    formatScore += 4;
  } else {
    failedChecks.push("No phone number found");
    suggestions.push("Add a phone number to your contact header.");
  }

  // Check standard sections
  const hasEducation = /\b(education|university|college|b\.tech|bachelor|master|degree)\b/i.test(lowerText);
  if (hasEducation) {
    passedChecks.push("Education section detected");
    formatScore += 5;
  } else {
    failedChecks.push("Missing standard Education section");
    suggestions.push("Include a clearly labeled Education section.");
  }

  const hasSkillsSection = /\b(skills|technical skills|technologies|tools)\b/i.test(lowerText);
  if (hasSkillsSection) {
    passedChecks.push("Skills section detected");
    formatScore += 5;
  } else {
    failedChecks.push("Missing standard Skills section");
    suggestions.push("Include a dedicated Technical Skills section for ATS parsers.");
  }

  const hasExperienceOrProjects = /\b(experience|projects|work history|employment|internships)\b/i.test(lowerText);
  if (hasExperienceOrProjects) {
    passedChecks.push("Experience / Projects section detected");
    formatScore += 4;
  } else {
    failedChecks.push("Missing Experience or Projects section");
    suggestions.push("Add an Experience or Projects section with clear headers.");
  }

  // Single column check (no markdown table syntax)
  if (!/\|[\s-:]+\|/.test(text)) {
    passedChecks.push("Linear single-column format (ATS friendly)");
    formatScore += 2;
  } else {
    failedChecks.push("Avoid multi-column tables which scramble in older ATS parsers");
  }

  /* ------------ 3. Action Verbs & Measurable Metrics (Max 20) ------------ */
  let metricsCount = 0;
  const metricsMatches = text.match(METRIC_REGEX) ?? [];
  // Filter out dates / years like 2024, 2025, 2026
  for (const m of metricsMatches) {
    const num = parseInt(m, 10);
    if (!(num >= 1990 && num <= 2035 && m.length === 4)) {
      metricsCount++;
    }
  }

  let actionVerbsCount = 0;
  for (const verb of ACTION_VERBS) {
    const verbRe = new RegExp(`\\b${verb}\\b`, "i");
    if (verbRe.test(text)) {
      actionVerbsCount++;
    }
  }

  const slopPhrases: string[] = [];
  for (const word of SLOP_WORDS) {
    if (lowerText.includes(word)) {
      slopPhrases.push(word);
    }
  }

  let impactScore = 0;
  // Metrics: up to 8 points
  if (metricsCount >= 4) impactScore += 8;
  else if (metricsCount >= 2) impactScore += 5;
  else if (metricsCount >= 1) impactScore += 3;
  else {
    suggestions.push("Quantify achievements with numbers, % increases, or scale (e.g. 'reduced latency by 35%').");
  }

  // Action verbs: up to 8 points
  if (actionVerbsCount >= 6) impactScore += 8;
  else if (actionVerbsCount >= 3) impactScore += 5;
  else if (actionVerbsCount >= 1) impactScore += 3;
  else {
    suggestions.push("Start bullet points with strong action verbs (e.g. 'Developed', 'Optimized', 'Architected').");
  }

  // Slop penalty: up to 4 points
  if (slopPhrases.length === 0) {
    impactScore += 4;
  } else {
    suggestions.push(`Remove filler buzzwords: "${slopPhrases.slice(0, 3).join('", "')}".`);
  }

  /* ------------- 4. Readability, Length & Hygiene (Max 15) -------------- */
  const words = text.split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  const firstPersonMatches = (lowerText.match(/\b(i|my|we|our|me)\b/g) ?? []).length;

  const lines = text.split(/\n+/).map((l) => l.trim()).filter((l) => l.startsWith("•") || l.startsWith("-") || l.length > 20);
  const avgBulletLength = lines.length > 0 ? Math.round(lines.reduce((a, b) => a + b.length, 0) / lines.length) : 0;

  let readabilityScore = 0;

  // Length: 200 - 800 words is standard for 1 page ATS
  if (wordCount >= 250 && wordCount <= 750) {
    readabilityScore += 7;
  } else if (wordCount > 150 && wordCount < 1000) {
    readabilityScore += 4;
  } else if (wordCount < 150) {
    suggestions.push("Resume is too sparse (under 150 words). Provide more detailed project and work bullet points.");
  } else {
    suggestions.push("Resume may be too long for a clean 1-page ATS scan (over 1000 words).");
  }

  // No first-person pronouns
  if (firstPersonMatches === 0) {
    readabilityScore += 5;
  } else if (firstPersonMatches <= 2) {
    readabilityScore += 2;
    suggestions.push("Avoid first-person pronouns ('I', 'my'). Use third-person action phrasing.");
  } else {
    suggestions.push("Found multiple first-person pronouns ('I', 'my', 'we'). Remove them for standard ATS style.");
  }

  // Reasonable line lengths (not overly brief, not massive paragraphs)
  if (avgBulletLength >= 40 && avgBulletLength <= 220) {
    readabilityScore += 3;
  } else if (avgBulletLength > 220) {
    suggestions.push("Some bullets are overly long paragraphs. Keep bullets between 1 and 2 lines (60-180 characters).");
  }

  /* --------------------------- Overall Score --------------------------- */
  const overallScore = Math.max(0, Math.min(100, keywordScore + formatScore + impactScore + readabilityScore));

  let verdict: AtsScoreBreakdown["verdict"] = "Needs Improvement";
  if (overallScore >= 85) verdict = "Excellent";
  else if (overallScore >= 70) verdict = "Strong";
  else if (overallScore >= 50) verdict = "Average";

  return {
    overallScore,
    verdict,
    categoryScores: {
      keywordMatch: {
        score: keywordScore,
        max: 40,
        details: { matchedSkills, missingSkills, matchPercentage },
      },
      formatCompliance: {
        score: formatScore,
        max: 25,
        details: { passedChecks, failedChecks },
      },
      impactAndVerbs: {
        score: impactScore,
        max: 20,
        details: { metricsCount, actionVerbsCount, slopPhrases },
      },
      readabilityAndLength: {
        score: readabilityScore,
        max: 15,
        details: { wordCount, firstPersonCount: firstPersonMatches, avgBulletLength },
      },
    },
    topSuggestions: suggestions.slice(0, 5),
  };
}
