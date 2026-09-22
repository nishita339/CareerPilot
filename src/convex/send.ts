import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { vly } from "../lib/vly-integrations";
import { asResumeDoc, renderResumeText } from "./resume";
import { checkCooldown } from "./cooldown";

/** Demo listings use unroutable addresses, so a send resimulates instead. */
const DEMO_EMAIL_DOMAINS =
  /@(demo-lab|acme-demo|nordic-demo|ferrous-demo|cobalt-demo|commons-demo)\.example$/i;

export interface SendResult {
  sent: boolean;
  simulated: boolean;
  to: string;
  attachedPdf: string | null;
  warnings: string[];
}

/**
 * The one place an email application is ever sent, for any trigger.
 *
 * Gates, in order — they are identical whether a human clicked Send or
 * autopilot decided on its own:
 *   1. status must be Approved (autopilot writes that itself, and says so)
 *   2. the role must have a verified apply email (web forms are never sent)
 *   3. the tailored resume must exist and have passed the validator
 *   4. the company cooldown must be clear
 *   5. the daily cap must have room
 */
export const dispatchApprovedSend = internalAction({
  args: {
    userId: v.id("users"),
    jobId: v.id("jobs"),
    /** "manual" | "autopilot" — recorded on the audit trail. */
    trigger: v.string(),
  },
  handler: async (ctx, { userId, jobId, trigger }): Promise<SendResult> => {
    const { profile, job, sentToday, prior } = await ctx.runQuery(
      internal.private.getApplyContextForUser,
      { userId, jobId },
    );
    if (!profile) throw new Error("Complete your Master Profile first.");

    if (job.status !== "Approved") {
      throw new Error(
        `Blocked: sending requires approval. Current status: "${job.status}".`,
      );
    }
    if (job.applyMode !== "email" || !job.applyEmail) {
      throw new Error(
        "This role has no verified apply email. Use the listing URL and submit manually.",
      );
    }
    if (!job.resumeHtml || !job.validationOk) {
      throw new Error(
        "Tailor the resume first — flagged claims must be reviewed before sending.",
      );
    }
    const cooldown = checkCooldown({
      organization: job.organization,
      prior,
      now: Date.now(),
      cooldownDays: profile.cooldownDays,
    });
    if (cooldown.blocked) throw new Error(cooldown.reason);

    if (sentToday >= profile.maxApplicationsPerDay) {
      throw new Error(
        `Daily cap reached (${sentToday}/${profile.maxApplicationsPerDay}). Low, slow, targeted volume — try tomorrow.`,
      );
    }

    // Attach the same ATS-friendly PDF the user reviewed, when it exists.
    const pdf = await ctx.runAction(internal.resumePdf.renderResumePdfBase64, {
      userId,
      jobId,
    });

    const simulated = DEMO_EMAIL_DOMAINS.test(job.applyEmail);
    if (!simulated) {
      const result = await vly.email.send({
        to: job.applyEmail,
        subject: `Application: ${job.title} — ${profile.fullName}`,
        text: buildPlainText(profile, job),
        html: `<div style="font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5">${job.coverLetterHtml ?? ""}<hr/>${job.resumeHtml}</div>`,
        attachments: pdf
          ? [{ filename: pdf.filename, content: pdf.base64, encoding: "base64" }]
          : undefined,
      });
      if (!result.success) {
        throw new Error(result.error ?? "Email provider rejected the send");
      }
    }

    await ctx.runMutation(internal.private.markAppliedForUser, {
      userId,
      jobId,
      trigger,
    });

    return {
      sent: true,
      simulated,
      to: job.applyEmail,
      attachedPdf: pdf?.filename ?? null,
      warnings: pdf?.warnings ?? [],
    };
  },
});

function buildPlainText(
  profile: { fullName: string; email: string; phone: string },
  job: {
    title: string;
    organization: string;
    resumeHtml?: string;
    resumeData?: unknown;
  },
): string {
  const doc = asResumeDoc(job.resumeData);
  const resume = doc ? renderResumeText(doc) : stripHtml(job.resumeHtml ?? "");
  return [
    "Hello,",
    "",
    `I am applying for the ${job.title} role at ${job.organization}.`,
    "",
    resume,
    "",
    `— ${profile.fullName} · ${profile.email} · ${profile.phone}`,
  ].join("\n");
}

function stripHtml(html: string): string {
  return html
    .replace(/<li>/g, "• ")
    .replace(/<br\s*\/?>/g, "\n")
    .replace(/<\/p>/g, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}
