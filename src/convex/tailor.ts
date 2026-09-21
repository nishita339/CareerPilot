import { getAuthUserId } from "@convex-dev/auth/server";
import { action, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { vly } from "../lib/vly-integrations";
import { validateClaims } from "./validator";

/** Model name comes from config, never hardcoded per the prompt rules. */
const TAILOR_MODEL = process.env.CAREERPILOT_LLM_MODEL ?? "gpt-4o-mini";
const TAILOR_TEMPERATURE = 0.3;

function buildProfileBlock(p: {
  fullName: string;
  headline: string;
  email: string;
  phone: string;
  location: string;
  links?: string;
  major: string;
  university: string;
  graduationYear: string;
  gpa?: string;
  relevantCoursework?: string;
  skills: string[];
  experience?: string;
  projects?: string;
  certifications?: string;
}): string {
  return [
    `Name: ${p.fullName}`,
    `Headline: ${p.headline}`,
    `Contact: ${p.email} | ${p.phone} | ${p.location}${p.links ? ` | ${p.links}` : ""}`,
    `Education: ${p.major}, ${p.university} (${p.graduationYear})${p.gpa ? `, GPA ${p.gpa}` : ""}`,
    p.relevantCoursework ? `Coursework: ${p.relevantCoursework}` : "",
    `Skills: ${p.skills.join(", ")}`,
    p.experience ? `Experience:\n${p.experience}` : "",
    p.projects ? `Projects:\n${p.projects}` : "",
    p.certifications ? `Certifications: ${p.certifications}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

const SYSTEM_PROMPT = `You are an ATS resume tailoring engine for students.
ABSOLUTE RULES:
- You may ONLY reorder, rephrase and emphasize facts that appear in the profile.
- NEVER invent skills, employers, titles, dates, projects, metrics or tools.
- Mirror job-description keywords ONLY where they truthfully describe the candidate.
- Bullets must sound like a human engineer wrote them: concrete, specific, no
  filler like "passionate", "dynamic", "results-driven". No emoji. No exclamation marks.

GOOD truthful bullets (from a profile that says: Python, Pandas course project
analyzing 50k rows of transit data; CS junior at UMass):
- "Analyzed 50k rows of transit data in Python and Pandas to surface delay patterns"
- "Built a reproducible data-cleaning pipeline that cut manual review time in half"
BAD (hallucinated or generic):
- "Led a team of 8 engineers to ship a production ML platform" (not in profile)
- "Passionate innovator with a proven track record of excellence" (slop)`;

/** Tailor resume + cover letter for one job. Gated at Shortlisted+. */
export const tailor = action({
  args: { jobId: v.id("jobs") },
  handler: async (
    ctx,
    { jobId },
  ): Promise<{ validationOk: boolean; validationNotes: string[]; model: string }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in required.");
    const { profile, job } = await ctx.runQuery(internal.private.getProfileAndJob, {
      jobId,
    });
    if (!profile) throw new Error("Complete your Master Profile first.");
    if (!job) throw new Error("Job not found.");
    if (!["Shortlisted", "Approved", "Resume Ready"].includes(job.status)) {
      throw new Error(
        `Job is "${job.status}". Tailoring is gated at match score ${profile.minMatchScore}+ (Shortlisted).`,
      );
    }

    if (!profile) throw new Error("Complete your Master Profile first.");
    const safeProfile = { ...profile, skills: profile.skills ?? [] };

    const jobDescription = [
      job.title,
      job.organization,
      job.location ?? "",
      job.description ?? "",
    ].join("\n");

    const userPrompt = [
      "STUDENT PROFILE (the only source of truth):",
      buildProfileBlock(safeProfile),
      "",
      "JOB DESCRIPTION:",
      jobDescription.slice(0, 6000),
      "",
      "TASK: Produce a one-page ATS resume and a short cover letter for this role.",
      "Reorder and rephrase ONLY what exists above. Mirror truthful keywords.",
      "",
      "Return ONLY JSON with this exact shape:",
      '{"summary": string, "skills": string[], "bullets": string[], "coverLetter": string}',
    ].join("\n");

    const completion = await vly.ai.completion({
      model: TAILOR_MODEL,
      temperature: TAILOR_TEMPERATURE,
      maxTokens: 2200,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    });
    if (!completion.success || !completion.data) {
      throw new Error(completion.error ?? "LLM request failed");
    }
    const raw = completion.data.choices?.[0]?.message?.content ?? "";

    // Structured-output discipline: parse strictly, validate every claim.
    interface TailoredDoc {
      summary: string;
      skills: string[];
      bullets: string[];
      coverLetter: string;
    }
    let parsed: TailoredDoc;
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    try {
      const candidate = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
      if (
        !candidate ||
        typeof candidate.summary !== "string" ||
        !Array.isArray(candidate.skills) ||
        !Array.isArray(candidate.bullets)
      ) {
        throw new Error("missing fields");
      }
      parsed = {
        summary: String(candidate.summary),
        skills: candidate.skills.map((s: unknown) => String(s)).slice(0, 18),
        bullets: candidate.bullets.map((b: unknown) => String(b)).slice(0, 14),
        coverLetter: typeof candidate.coverLetter === "string" ? candidate.coverLetter : "",
      };
    } catch {
      // Fallback: derive strictly from profile content (never hallucinates).
      parsed = {
        summary: profile.headline,
        skills: profile.skills ?? [],
        bullets: (profile.projects ?? profile.experience ?? "")
          .split(/\n+/)
          .map((s: string) => s.trim())
          .filter((s: string) => s.length > 12)
          .slice(0, 6),
        coverLetter: "",
      };
    }

    const validation = validateClaims(
      {
        fullName: profile.fullName,
        skills: profile.skills ?? [],
        experience: profile.experience ?? "",
        projects: profile.projects ?? "",
        university: profile.university,
        major: profile.major,
        certifications: profile.certifications ?? "",
      },
      parsed,
    );

    const resumeHtml = [
      `<h3>${escapeHtml(profile.fullName)}</h3>`,
      `<p class="muted">${escapeHtml(profile.headline)} · ${escapeHtml(profile.email)} · ${escapeHtml(profile.phone)} · ${escapeHtml(profile.location)}</p>`,
      `<p><strong>Education</strong><br/>${escapeHtml(profile.major)}, ${escapeHtml(profile.university)} (${escapeHtml(profile.graduationYear)})${profile.gpa ? ` · GPA ${escapeHtml(profile.gpa)}` : ""}</p>`,
      profile.relevantCoursework
        ? `<p><strong>Coursework</strong><br/>${escapeHtml(profile.relevantCoursework)}</p>`
        : "",
      `<p><strong>Skills</strong><br/>${parsed.skills.map((s: string) => escapeHtml(s)).join(" · ")}</p>`,
      parsed.bullets.length
        ? `<p><strong>Selected experience &amp; projects</strong></p><ul>${parsed.bullets.map((b: string) => `<li>${escapeHtml(b)}</li>`).join("")}</ul>`
        : "",
      profile.certifications
        ? `<p><strong>Certifications</strong><br/>${escapeHtml(profile.certifications)}</p>`
        : "",
      `<p class="muted">Summary</p><p>${escapeHtml(parsed.summary)}</p>`,
    ]
      .filter(Boolean)
      .join("\n");

    const coverLetterHtml = parsed.coverLetter
      ? `<p>Dear Hiring Team,</p><p>${escapeHtml(parsed.coverLetter)}</p><p>Sincerely,<br/>${escapeHtml(profile.fullName)}</p>`
      : `<p class="muted">No cover letter generated.</p>`;

    await ctx.runMutation(internal.private.saveTailored, {
      jobId,
      resumeHtml,
      coverLetterHtml,
      resumeVersion: (job.resumeVersion ?? 0) + 1,
      validationOk: validation.ok,
      validationNotes: validation.notes.join("\n"),
    });

    return {
      validationOk: validation.ok,
      validationNotes: validation.notes,
      model: TAILOR_MODEL,
    };
  },
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Review artifact: the full job record including tailored documents. */
export const getJobForReview = query({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, { jobId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const job = await ctx.db.get(jobId);
    if (!job || job.userId !== userId) return null;
    return job;
  },
});
