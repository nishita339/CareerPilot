// Email Follow-Up & Recruiter Outreach Generator
// Generates structured, polite follow-up emails and recruiter outreach messages
// for candidates to copy-paste and send manually from their own email or LinkedIn.
// Pure module: deterministic, unit testable.

export type FollowUpType =
  | "status_check" // 5-7 days after applying
  | "post_interview" // 24 hours after interview
  | "deadline_closing" // 2-3 days before deadline closes
  | "recruiter_inquiry"; // Cold outreach / LinkedIn note

export interface FollowUpMessage {
  type: FollowUpType;
  subject: string;
  body: string;
  charCount: number;
  recommendedTiming: string;
  tips: string[];
}

export interface FollowUpCandidateContext {
  fullName: string;
  email: string;
  phone?: string;
  major?: string;
  topSkills?: string[];
}

export interface FollowUpJobContext {
  title: string;
  organization: string;
  appliedAt?: number;
  deadline?: string;
  interviewerName?: string;
}

const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Returns true if an application was submitted between 5 and 14 days ago
 * and hasn't received an outcome yet.
 */
export function isEligibleForFollowUp(
  appliedAt: number | undefined,
  currentStatus: string,
  nowMs: number = Date.now(),
): boolean {
  if (!appliedAt || currentStatus !== "Applied") return false;
  const elapsed = nowMs - appliedAt;
  return elapsed >= FIVE_DAYS_MS && elapsed <= FOURTEEN_DAYS_MS;
}

/**
 * Generates an appropriate follow-up communication based on type and context.
 */
export function generateFollowUpMessage(
  type: FollowUpType,
  candidate: FollowUpCandidateContext,
  job: FollowUpJobContext,
): FollowUpMessage {
  const topSkill = candidate.topSkills?.[0] || "software engineering";

  switch (type) {
    case "status_check": {
      const subject = `Following Up: ${job.title} Application — ${candidate.fullName}`;
      const body = [
        `Dear ${job.organization} Hiring Team,`,
        "",
        `I hope you are having a productive week. I am following up on my application for the ${job.title} position, which I submitted recently.`,
        "",
        `I remain very enthusiastic about the opportunity to contribute to ${job.organization}, particularly given my background in ${candidate.major || "engineering"} and hands-on experience with ${topSkill}.`,
        "",
        `Please let me know if you need any additional materials, portfolio links, or references from my side. Thank you again for your time and consideration.`,
        "",
        `Sincerely,`,
        `${candidate.fullName}`,
        candidate.email,
        candidate.phone || "",
      ]
        .filter(Boolean)
        .join("\n");

      return {
        type,
        subject,
        body,
        charCount: body.length,
        recommendedTiming: "Send 5 to 7 business days after applying if no response has been received.",
        tips: [
          "Keep it brief and appreciative.",
          "Reiterate your top technical qualification without repeating your entire resume.",
        ],
      };
    }

    case "post_interview": {
      const name = job.interviewerName || "Hiring Team";
      const subject = `Thank You — ${job.title} Interview — ${candidate.fullName}`;
      const body = [
        `Dear ${name},`,
        "",
        `Thank you for taking the time to speak with me today about the ${job.title} role at ${job.organization}. I really enjoyed learning more about the team's ongoing initiatives and engineering priorities.`,
        "",
        `Our discussion reinforced my enthusiasm for joining ${job.organization}. I am confident that my technical skills in ${topSkill} and problem-solving mindset would enable me to make meaningful contributions to your team.`,
        "",
        `Please feel free to reach out if you have any further questions. I look forward to hearing about the next steps.`,
        "",
        `Best regards,`,
        `${candidate.fullName}`,
        candidate.email,
      ].join("\n");

      return {
        type,
        subject,
        body,
        charCount: body.length,
        recommendedTiming: "Send within 24 hours of completing your interview.",
        tips: [
          "Personalize by referencing one specific topic or project discussed during the interview.",
          "Keep it concise and gracious.",
        ],
      };
    }

    case "deadline_closing": {
      const subject = `Urgent Application Query: ${job.title} — ${candidate.fullName}`;
      const body = [
        `Hello ${job.organization} Recruitment Team,`,
        "",
        `I noticed the application window for ${job.title} is closing soon. I wanted to verify that my application submitted under ${candidate.email} has been received into your review system.`,
        "",
        `I am very eager to be considered for this opportunity and look forward to the possibility of discussing my qualifications with you.`,
        "",
        `Thank you,`,
        `${candidate.fullName}`,
      ].join("\n");

      return {
        type,
        subject,
        body,
        charCount: body.length,
        recommendedTiming: "Send 2 to 3 days before the official deadline closes.",
        tips: ["Only send if your application was submitted at least a week prior."],
      };
    }

    case "recruiter_inquiry": {
      const subject = `Inquiry regarding ${job.title} role at ${job.organization}`;
      const body = [
        `Hi ${job.interviewerName || "there"},`,
        "",
        `I came across ${job.organization}'s opening for ${job.title} and wanted to reach out directly. I am a ${candidate.major || "Computer Science"} graduate with strong project experience in ${topSkill}.`,
        "",
        `I recently submitted my formal application through your portal and would welcome the chance to connect if my profile aligns with what your team is looking for.`,
        "",
        `Best,`,
        `${candidate.fullName}`,
      ].join("\n");

      return {
        type,
        subject,
        body,
        charCount: body.length,
        recommendedTiming: "Can be sent via LinkedIn message or direct recruiter email.",
        tips: [
          "Keep under 100 words so it is easy to read on mobile.",
          "Mention that you have already applied through the official portal.",
        ],
      };
    }
  }
}
