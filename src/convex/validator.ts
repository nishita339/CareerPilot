// Truthfulness validator: every skill, employer and metric claimed by the LLM
// must be traceable to the Master Profile. This is the anti-"AI slop" gate.

import { parseSkillList } from "./skills";

export interface ValidationResult {
  ok: boolean;
  notes: string[];
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9+#. ]/g, " ").replace(/\s+/g, " ").trim();
}

function tokens(s: string): string[] {
  return norm(s).split(" ").filter((t) => t.length > 2);
}

function employerSignature(organization: string): string[] {
  const stop = new Set([
    "inc", "llc", "ltd", "corp", "corporation", "company", "co", "the",
    "university", "college", "institute", "of", "technology", "labs", "lab",
  ]);
  return tokens(organization).filter((t) => !stop.has(t));
}

/** Checks a generated resume/cover letter against the profile. */
export function validateClaims(
  profile: {
    fullName: string;
    skills: string[];
    experience: string;
    projects: string;
    university: string;
    major: string;
    certifications: string;
  },
  generated: { summary: string; skills: string[]; bullets: string[] },
): ValidationResult {
  const notes: string[] = [];
  const profileText = norm(
    [
      profile.fullName,
      profile.skills.join(", "),
      profile.experience,
      profile.projects,
      profile.university,
      profile.major,
      profile.certifications,
    ].join(" · "),
  );
  const profileSkills = new Set(profile.skills.map((s) => norm(s)));
  const profileSig = new Set(tokens(profileText));

  // 1. Skills must exist in the profile.
  for (const skill of generated.skills) {
    if (!profileSkills.has(norm(skill))) {
      notes.push(`Skill "${skill}" is not in your profile — removed requirement`);
    }
  }

  // 2. Every bullet must substantively reference the profile (>=55% of its
  //    content words must exist in profile text). Catches invented employers,
  //    projects and metrics.
  const bullets = [...generated.bullets, generated.summary];
  for (const bullet of bullets) {
    const words = tokens(bullet);
    if (words.length === 0) continue;
    const known = words.filter((w) => profileSig.has(w)).length;
    const ratio = known / words.length;
    if (ratio < 0.55) {
      notes.push(
        `Claim cannot be traced to your profile: "${bullet.slice(0, 72)}…"`,
      );
    }
    // 3. Fabricated-looking numbers: metrics are allowed only if the number
    //    (with its unit) appears in the profile — e.g. team size, GPA, %.
    for (const m of bullet.match(/(?<![\w.])\d+(?:[.,]\d+)?(?:\s?%|k|x|m)?/gi) ?? []) {
      if (!profileText.includes(norm(m.trim()))) {
        notes.push(`Metric ${m.trim()} does not appear in your profile`);
      }
    }
  }

  // 4. Named entities (employers, projects, schools) claimed in bullets must be
  //    traceable to the profile. Only multi-word capitalized phrases are
  //    checked — a sentence-initial "Built" or "Analyzed" is not an entity.
  const knownEntities = new Set(
    [
      profile.experience,
      profile.projects,
      profile.university,
      profile.major,
      profile.certifications,
    ]
      .join(" \n ")
      .split(/[\n·,;]|(?: at )/i)
      .map((chunk) => chunk.trim())
      .flatMap((chunk) => employerSignature(chunk))
      .filter(Boolean),
  );
  for (const bullet of generated.bullets) {
    for (const entity of
      bullet.match(/\b[A-Z][a-zA-Z]{2,}(?:\s+[A-Z][a-zA-Z]{2,})+\b/g) ?? []) {
      const sig = employerSignature(entity);
      if (sig.length > 0 && !sig.every((t) => knownEntities.has(t))) {
        notes.push(`Unrecognized organization or project name "${entity}"`);
      }
    }
  }

  return { ok: notes.length === 0, notes: [...new Set(notes)].slice(0, 12) };
}

export { parseSkillList };
