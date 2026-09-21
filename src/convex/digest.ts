"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import { action, internalAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { envValue } from "./collectors";
import { vly } from "../lib/vly-integrations";

interface DigestJob {
  title: string;
  organization: string;
  matchScore?: number;
  status: string;
  url: string;
}

interface DueSoonJob extends DigestJob {
  deadline: string;
  daysLeft: number;
}

interface DigestPayload {
  profile: {
    fullName: string;
    email: string;
    maxApplicationsPerDay: number;
    lastDigestAt?: number;
  };
  shortlisted: DigestJob[];
  resumeReady: DigestJob[];
  dueSoon: DueSoonJob[];
  appliedToday: number;
  totalJobs: number;
}

export interface DigestResult {
  emailed: boolean;
  telegram: boolean;
  skipped?: string;
}

function buildDigestText(p: DigestPayload): string {
  const lines = [
    `CareerPilot — daily digest for ${p.profile.fullName || "you"}`,
    "",
    `${p.shortlisted.length} shortlisted · ${p.resumeReady.length} awaiting your approval · ${p.appliedToday}/${p.profile.maxApplicationsPerDay} applied today · ${p.totalJobs} tracked`,
    "",
  ];
  if (p.shortlisted.length) {
    lines.push("Shortlisted (highest match first):");
    for (const j of p.shortlisted.slice(0, 10)) {
      lines.push(`  • ${j.matchScore ?? "—"}/100  ${j.title} — ${j.organization}`);
      lines.push(`    ${j.url}`);
    }
    lines.push("");
  }
  if (p.resumeReady.length) {
    lines.push("Tailored, waiting for your approval:");
    for (const j of p.resumeReady.slice(0, 10)) {
      lines.push(`  • ${j.title} — ${j.organization}`);
    }
    lines.push("");
  }
  if (p.dueSoon.length) {
    lines.push("Deadlines in the next 7 days:");
    for (const j of p.dueSoon) {
      const when =
        j.daysLeft <= 0
          ? "closes today"
          : `${j.daysLeft} day${j.daysLeft === 1 ? "" : "s"} left`;
      lines.push(`  • ${j.deadline} (${when})  ${j.title} — ${j.organization}`);
    }
    lines.push("");
  }
  lines.push(
    p.resumeReady.length > 0
      ? `Review ${p.resumeReady.length} application${p.resumeReady.length === 1 ? "" : "s"} in the dashboard — nothing is sent until you approve it.`
      : "Nothing is waiting on you. Applications are only ever sent after your approval.",
  );
  return lines.join("\n");
}

async function sendTelegram(text: string): Promise<boolean> {
  const token = envValue("TELEGRAM_BOT_TOKEN");
  const chatId = envValue("TELEGRAM_CHAT_ID");
  if (!token || !chatId) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
    });
    return res.ok;
  } catch {
    return false; // Telegram is best-effort; never fail the digest over it
  }
}

/** Digest for the signed-in user (dashboard button — always sends). */
export const sendDailyDigest = action({
  args: {},
  handler: async (ctx): Promise<DigestResult> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in required.");
    return await runDigest(ctx, userId, true);
  },
});

/** Digest for an explicit user (scheduled daily run — skips when empty). */
export const sendDigestForUser = internalAction({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }): Promise<DigestResult> =>
    await runDigest(ctx, userId, false),
});

async function runDigest(
  ctx: ActionCtx,
  userId: Id<"users">,
  force: boolean,
): Promise<DigestResult> {
  const data = await ctx.runQuery(internal.private.getDigestData, { userId });
  if (!data) return { emailed: false, telegram: false, skipped: "no profile" };
  if (
    !force &&
    data.shortlisted.length === 0 &&
    data.resumeReady.length === 0 &&
    data.dueSoon.length === 0
  ) {
    return { emailed: false, telegram: false, skipped: "nothing new" };
  }

  const text = buildDigestText(data);
  let emailed = false;
  const to = data.profile.email;
  if (to && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    const result = await vly.email.send({
      to,
      subject:
        `CareerPilot digest — ${data.shortlisted.length} shortlisted, ` +
        `${data.resumeReady.length} awaiting approval` +
        (data.dueSoon.length ? `, ${data.dueSoon.length} closing soon` : ""),
      text,
      html: `<pre style="font-family:ui-monospace,Menlo,monospace;font-size:13px;line-height:1.55;white-space:pre-wrap">${text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")}</pre>`,
    });
    emailed = result.success === true;
  }

  const telegram = await sendTelegram(text);

  await ctx.runMutation(internal.private.markDigestSent, { userId });
  await ctx.runMutation(internal.private.logActivity, {
    userId,
    action: telegram && emailed ? "digest sent (email + telegram)" : "digest sent",
    detail: `${data.shortlisted.length} shortlisted · ${data.resumeReady.length} awaiting approval`,
  });

  return { emailed, telegram };
}
