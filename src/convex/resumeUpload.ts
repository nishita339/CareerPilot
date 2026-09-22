"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import { action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import {
  cleanResumeText,
  extractPdfText,
  looksLikeResumeText,
} from "./resumeText";

/** ~4 MB of base64 ≈ a 3 MB file. Plenty for a resume, and keeps args small. */
const MAX_BASE64_CHARS = 4_000_000;

export interface ResumeUploadResult {
  fileName: string;
  /** How much text we recovered (0 when the PDF is a scan or image-only). */
  extractedChars: number;
  /** True when the text looks like a resume worth putting in the profile. */
  looksUseful: boolean;
  /** First lines, so the user can confirm we read the right thing. */
  preview: string;
  /** Full extracted text, so the form can show (and edit) what we captured. */
  text: string;
  message: string;
}

/**
 * Upload an existing resume. The file is kept in storage either way; if the text
 * comes out cleanly we also seed the Master Profile with it, because the
 * tailoring engine may only draw facts from the profile.
 */
export const uploadResume = action({
  args: { fileName: v.string(), base64: v.string() },
  handler: async (ctx, { fileName, base64 }): Promise<ResumeUploadResult> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in required.");
    if (base64.length > MAX_BASE64_CHARS) {
      throw new Error("That file is larger than 3 MB — paste the resume text instead.");
    }

    const name = fileName.trim().slice(0, 120) || "resume.pdf";
    const bytes = Buffer.from(base64, "base64");
    const isPdf = /\.pdf$/i.test(name) || bytes.subarray(0, 4).toString() === "%PDF";
    const raw = isPdf ? extractPdfText(bytes) : bytes.toString("utf8");
    const extracted = cleanResumeText(raw);
    const useful = looksLikeResumeText(extracted);

    const storageId = await ctx.storage.store(
      new Blob([bytes as unknown as BlobPart], {
        type: isPdf ? "application/pdf" : "text/plain",
      }),
    );
    await ctx.runMutation(api.profiles.attachResumeFile, {
      storageId,
      fileName: name,
      extractedText: useful ? extracted : undefined,
    });

    return {
      fileName: name,
      extractedChars: extracted.length,
      looksUseful: useful,
      preview: extracted.slice(0, 400),
      text: useful ? extracted : "",
      message: useful
        ? `Read ${extracted.length} characters from ${name} and saved them into your profile. Check the preview, then edit the fields if anything was misread.`
        : `Saved ${name}, but the text could not be read reliably (scanned or image-only PDF). Paste your resume text in the box below instead — that is what tailoring and the validator use.`,
    };
  },
});
