import type { Doc, Id } from "./_generated/dataModel";
import { extractSkills, parseSkillList, similarity } from "./skills";

export interface MatchResult {
  score: number; // 0-100
  matchedSkills: string[];
  missingSkills: string[];
  explanation: string;
}

type ProfileLike = Partial<
  Pick<
    Doc<"profiles">,
    | "skills"
    | "experience"
    | "projects"
    | "relevantCoursework"
    | "targetRoles"
    | "opportunityTypes"
    | "locations"
    | "openToRemote"
    | "major"
  >
> &
  Pick<Doc<"profiles">, "targetRoles" | "opportunityTypes" | "openToRemote">;

type JobLike = Pick<
  Doc<"jobs">,
  | "title"
  | "opportunityType"
  | "location"
  | "remoteOk"
  | "description"
  | "organization"
>;

function haystack(job: JobLike): string {
  return `${job.title} ${job.description ?? ""} ${job.location ?? ""}`.toLowerCase();
}

function scoreTitle(profile: ProfileLike, job: JobLike): number {
  const text = haystack(job);
  const wanted = profile.targetRoles.filter(Boolean);
  if (wanted.length === 0) return 8;
  let best = 0;
  for (const role of wanted) {
    const s = similarity(role, job.title);
    // Also credit when the JD text explicitly contains the target role name.
    if (text.includes(role.toLowerCase().replace(/\s+/g, " "))) {
      best = Math.max(best, 20);
    }
    best = Math.max(best, s >= 0.8 ? 20 : s >= 0.55 ? 14 : s >= 0.3 ? 7 : 0);
  }
  return best;
}

function scoreType(profile: ProfileLike, job: JobLike): number {
  if (profile.opportunityTypes.includes(job.opportunityType)) return 10;
  if (job.opportunityType === "job" && profile.opportunityTypes.includes("internship"))
    return 3; // related but not the ask
  return 0;
}

function scoreSkills(profile: ProfileLike, job: JobLike) {
  const jobSkills = extractSkills(`${job.title} ${job.description ?? ""}`);
  const mine = parseSkillList((profile.skills ?? []).join(","));
  const mineLower = new Set(mine.map((s) => s.toLowerCase()));
  const matched = jobSkills.filter((s) => mineLower.has(s.toLowerCase()));
  const missing = jobSkills.filter((s) => !mineLower.has(s.toLowerCase()));
  const requiredish = jobSkills.slice(0, 8);
  if (requiredish.length === 0) return { pts: 18, matched, missing };
  const ratio = matched.length / requiredish.length;
  const pts = Math.round(ratio * 40); // up to 40
  return { pts, matched, missing };
}

function scoreExperience(profile: ProfileLike, job: JobLike): number {
  const text = `${profile.experience ?? ""} ${profile.projects ?? ""}`.toLowerCase();
  if (!text.trim()) return 0;
  const jd = haystack(job);
  const years = jd.match(/(\d+)\s*\+?\s*(?:years|yrs)/);
  if (!years) return 6; // no explicit bar: give base credit for having experience
  const need = Math.min(parseInt(years[1], 10), 5);
  const yearsMine = text.match(/(\d+)\s*\+?\s*(?:years|yrs)/);
  const have = yearsMine ? Math.min(parseInt(yearsMine[1], 10), 5) : 1;
  if (have >= need) return 15;
  if (have === need - 1) return 9;
  return 3;
}

function scoreLocation(profile: ProfileLike, job: JobLike): number {
  const mine = (profile.locations ?? "")
    .split(/[,;\n]/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const loc = (job.location ?? "").toLowerCase();
  if (job.remoteOk && profile.openToRemote) return 12;
  if (!loc || loc === "remote") return job.remoteOk ? 4 : 8;
  if (mine.some((m) => m && loc.includes(m))) return 12;
  if (profile.openToRemote && job.remoteOk) return 12;
  return 4; // on-site somewhere else — keep small, not zero
}

function scoreCoursework(profile: ProfileLike, job: JobLike): number {
  const text = (profile.relevantCoursework ?? "").toLowerCase();
  if (!text.trim()) return 0;
  const jd = haystack(job);
  const terms = text.split(/[,;\n]/).map((t) => t.trim()).filter(Boolean);
  const hits = terms.filter((t) => jd.includes(t)).length;
  return Math.min(5, hits * 2);
}

/** Deterministic match score (0-100) for one job against the profile. */
export function scoreMatch(
  profile: ProfileLike,
  jobId: Id<"jobs"> | null,
  job: JobLike,
): MatchResult {
  const skills = scoreSkills(profile, job);
  const parts: { name: string; pts: number; max: number }[] = [
    { name: "skills", pts: skills.pts, max: 40 },
    { name: "role fit", pts: scoreTitle(profile, job), max: 20 },
    { name: "experience", pts: scoreExperience(profile, job), max: 15 },
    { name: "location", pts: scoreLocation(profile, job), max: 12 },
    { name: "opportunity type", pts: scoreType(profile, job), max: 10 },
    { name: "coursework", pts: scoreCoursework(profile, job), max: 5 },
  ];
  const score = Math.max(
    0,
    Math.min(100, parts.reduce((sum, p) => sum + p.pts, 0)),
  );
  const top = [...parts]
    .filter((p) => p.pts > 0)
    .sort((a, b) => b.pts - a.pts)
    .slice(0, 3)
    .map((p) => `${p.name} ${p.pts}/${p.max}`)
    .join(" · ");
  const explanation =
    `${job.organization} — ${job.title}: ${top || "weak overlap"}` +
    (skills.matched.length
      ? ` · matched: ${skills.matched.slice(0, 6).join(", ")}`
      : " · no taxonomy skills matched") +
    (skills.missing.length
      ? ` · missing: ${skills.missing.slice(0, 6).join(", ")}`
      : "");
  void jobId;
  return {
    score,
    matchedSkills: skills.matched,
    missingSkills: skills.missing,
    explanation,
  };
}
