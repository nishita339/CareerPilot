// Score Explainer: Deconstructs the 6-factor match score into transparent,
// visual dimensions and provides concrete, honest recommendations on how the student
// can increase their match score legitimately.
// Pure module: deterministic, unit testable.

import { extractSkills, parseSkillList, similarity } from "./skills";

export interface ScoreDimension {
  name: string;
  category: "skills" | "roleFit" | "experience" | "location" | "opportunityType" | "coursework";
  earned: number;
  max: number;
  percentage: number;
  details: string;
}

export interface ScoreBoosterTip {
  potentialPoints: number;
  dimension: string;
  recommendation: string;
}

export interface DetailedScoreExplanation {
  overallScore: number;
  tier: "Top Match" | "Competitive" | "Borderline" | "Weak Overlap";
  dimensions: ScoreDimension[];
  matchedSkills: string[];
  missingSkills: string[];
  boosterTips: ScoreBoosterTip[];
  summaryNarrative: string;
}

export function explainMatchScore(
  profile: {
    skills?: string[];
    experience?: string;
    projects?: string;
    relevantCoursework?: string;
    targetRoles: string[];
    opportunityTypes: string[];
    locations?: string;
    openToRemote: boolean;
    major?: string;
  },
  job: {
    title: string;
    organization: string;
    opportunityType: string;
    location?: string;
    remoteOk: boolean;
    description?: string;
  },
): DetailedScoreExplanation {
  const jdText = `${job.title} ${job.description ?? ""} ${job.location ?? ""}`.toLowerCase();
  const boosterTips: ScoreBoosterTip[] = [];

  // 1. Skills (Max 40)
  const jobSkills = extractSkills(`${job.title} ${job.description ?? ""}`);
  const candidateSkills = parseSkillList((profile.skills ?? []).join(","));
  const candidateSkillsLower = new Set(candidateSkills.map((s) => s.toLowerCase()));

  const matchedSkills = jobSkills.filter((s) => candidateSkillsLower.has(s.toLowerCase()));
  const missingSkills = jobSkills.filter((s) => !candidateSkillsLower.has(s.toLowerCase()));
  const topRequirements = jobSkills.slice(0, 8);

  let skillsPts = 18;
  if (topRequirements.length > 0) {
    const ratio = matchedSkills.length / topRequirements.length;
    skillsPts = Math.min(40, Math.round(ratio * 40));
  }

  if (missingSkills.length > 0 && skillsPts < 35) {
    const gain = Math.min(15, missingSkills.length * 5);
    boosterTips.push({
      potentialPoints: gain,
      dimension: "Skills",
      recommendation: `Add verifiable experience with ${missingSkills.slice(0, 3).join(", ")} if you have used them in projects.`,
    });
  }

  // 2. Role Fit (Max 20)
  let roleFitPts = 8;
  const wanted = profile.targetRoles.filter(Boolean);
  if (wanted.length > 0) {
    let best = 0;
    for (const r of wanted) {
      const s = similarity(r, job.title);
      if (jdText.includes(r.toLowerCase().replace(/\s+/g, " "))) {
        best = Math.max(best, 20);
      }
      best = Math.max(best, s >= 0.8 ? 20 : s >= 0.55 ? 14 : s >= 0.3 ? 7 : 0);
    }
    roleFitPts = best;
  }

  if (roleFitPts < 14) {
    boosterTips.push({
      potentialPoints: 20 - roleFitPts,
      dimension: "Target Role",
      recommendation: `Add '${job.title.split(/[-–/]/)[0].trim()}' or a similar title to your target roles in profile preferences.`,
    });
  }

  // 3. Experience (Max 15)
  const expText = `${profile.experience ?? ""} ${profile.projects ?? ""}`.toLowerCase();
  let expPts = expText.trim() ? 6 : 0;
  const yearsMatch = jdText.match(/(\d+)\s*\+?\s*(?:years|yrs)/);
  if (yearsMatch) {
    const needed = Math.min(parseInt(yearsMatch[1], 10), 5);
    const haveMatch = expText.match(/(\d+)\s*\+?\s*(?:years|yrs)/);
    const have = haveMatch ? Math.min(parseInt(haveMatch[1], 10), 5) : 1;
    if (have >= needed) expPts = 15;
    else if (have === needed - 1) expPts = 9;
    else expPts = 3;
  } else if (expText.trim()) {
    expPts = 12;
  }

  // 4. Location & Remote (Max 12)
  const myLocs = (profile.locations ?? "")
    .split(/[,;\n]/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const jobLoc = (job.location ?? "").toLowerCase();

  let locPts = 4;
  if (job.remoteOk && profile.openToRemote) {
    locPts = 12;
  } else if (!jobLoc || jobLoc === "remote") {
    locPts = job.remoteOk ? 4 : 8;
  } else if (myLocs.some((m) => m && jobLoc.includes(m))) {
    locPts = 12;
  } else if (profile.openToRemote && job.remoteOk) {
    locPts = 12;
  }

  if (locPts < 10 && !profile.openToRemote) {
    boosterTips.push({
      potentialPoints: 12 - locPts,
      dimension: "Location",
      recommendation: "Toggle 'Open to Remote' in your profile preferences to qualify for remote roles.",
    });
  }

  // 5. Opportunity Type (Max 10)
  let typePts = 0;
  if (profile.opportunityTypes.includes(job.opportunityType)) {
    typePts = 10;
  } else if (job.opportunityType === "job" && profile.opportunityTypes.includes("internship")) {
    typePts = 3;
  }

  // 6. Coursework (Max 5)
  const courseText = (profile.relevantCoursework ?? "").toLowerCase();
  let coursePts = 0;
  if (courseText.trim()) {
    const terms = courseText.split(/[,;\n]/).map((t) => t.trim()).filter(Boolean);
    const hits = terms.filter((t) => jdText.includes(t)).length;
    coursePts = Math.min(5, hits * 2);
  }

  if (coursePts < 4 && !profile.relevantCoursework) {
    boosterTips.push({
      potentialPoints: 5,
      dimension: "Coursework",
      recommendation: "List 3-4 relevant university courses (e.g. 'Operating Systems, Databases') in your Master Profile.",
    });
  }

  const overallScore = Math.max(0, Math.min(100, skillsPts + roleFitPts + expPts + locPts + typePts + coursePts));

  let tier: DetailedScoreExplanation["tier"] = "Weak Overlap";
  if (overallScore >= 80) tier = "Top Match";
  else if (overallScore >= 65) tier = "Competitive";
  else if (overallScore >= 50) tier = "Borderline";

  const dimensions: ScoreDimension[] = [
    {
      name: "Technical Skills",
      category: "skills",
      earned: skillsPts,
      max: 40,
      percentage: Math.round((skillsPts / 40) * 100),
      details: `${matchedSkills.length} of ${topRequirements.length} required skills matched`,
    },
    {
      name: "Role & Title Alignment",
      category: "roleFit",
      earned: roleFitPts,
      max: 20,
      percentage: Math.round((roleFitPts / 20) * 100),
      details: roleFitPts >= 14 ? "Strong keyword alignment with your target roles" : "Moderate title match",
    },
    {
      name: "Experience Level",
      category: "experience",
      earned: expPts,
      max: 15,
      percentage: Math.round((expPts / 15) * 100),
      details: expPts >= 10 ? "Experience meets requirements" : "Entry-level or project-based background",
    },
    {
      name: "Location & Remote",
      category: "location",
      earned: locPts,
      max: 12,
      percentage: Math.round((locPts / 12) * 100),
      details: locPts === 12 ? "Compatible location / remote preferences" : "Different geographic hub",
    },
    {
      name: "Opportunity Category",
      category: "opportunityType",
      earned: typePts,
      max: 10,
      percentage: Math.round((typePts / 10) * 100),
      details: typePts === 10 ? `Direct match for ${job.opportunityType}` : "Secondary category fit",
    },
    {
      name: "Relevant Coursework",
      category: "coursework",
      earned: coursePts,
      max: 5,
      percentage: Math.round((coursePts / 5) * 100),
      details: coursePts > 0 ? "Academic courses overlap with JD concepts" : "No coursework overlap detected",
    },
  ];

  const summaryNarrative = `${job.organization} — ${job.title} scored ${overallScore}/100 (${tier}). Top strengths: ${dimensions
    .filter((d) => d.percentage >= 65)
    .map((d) => d.name)
    .join(", ") || "Broad baseline eligibility"}.`;

  return {
    overallScore,
    tier,
    dimensions,
    matchedSkills,
    missingSkills,
    boosterTips: boosterTips.slice(0, 3),
    summaryNarrative,
  };
}
