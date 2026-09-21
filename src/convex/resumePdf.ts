"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import { action } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { asResumeDoc, type ResumeDoc } from "./resume";

const PAGE_WIDTH = 595.28; // A4
const PAGE_HEIGHT = 841.89;
const MARGIN = 54;
const BODY_SIZE = 9.5;
const LEADING = 13;
const HEADING_SIZE = 10;
const INK = rgb(0.1, 0.1, 0.11);
const MUTED = rgb(0.42, 0.43, 0.46);

/** PDF from a structured ResumeDoc: single column, no tables, no images,
 *  standard Helvetica fonts — the shape ATS parsers read most reliably. */
export const exportResumePdf = action({
  args: { jobId: v.id("jobs") },
  handler: async (
    ctx,
    { jobId },
  ): Promise<{ url: string | null; filename: string }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in required.");
    const { job } = await ctx.runQuery(internal.private.getProfileAndJob, { jobId });
    if (!job) throw new Error("Job not found.");
    const doc = asResumeDoc(job.resumeData);
    if (!doc) {
      throw new Error("Tailor the resume first — there is no PDF to export yet.");
    }

    const pdf = await PDFDocument.create();
    pdf.setTitle(`${doc.name} — Resume`);
    pdf.setCreator("CareerPilot");
    pdf.setProducer("CareerPilot");
    const regular = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

    let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    let y = PAGE_HEIGHT - MARGIN;

    const contentWidth = PAGE_WIDTH - MARGIN * 2;

    const wrap = (text: string, font: typeof regular, size: number, maxWidth: number) => {
      const words = text.split(/\s+/).filter(Boolean);
      const lines: string[] = [];
      let current = "";
      for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
          current = candidate;
        } else {
          if (current) lines.push(current);
          current = word;
        }
      }
      if (current) lines.push(current);
      return lines.length ? lines : [""];
    };

    const ensureSpace = (needed: number) => {
      if (y - needed < MARGIN) {
        page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        y = PAGE_HEIGHT - MARGIN;
      }
    };

    const writeLine = (
      text: string,
      opts: { font?: typeof regular; size?: number; color?: typeof INK; x?: number; gapAfter?: number } = {},
    ) => {
      const font = opts.font ?? regular;
      const size = opts.size ?? BODY_SIZE;
      const color = opts.color ?? INK;
      const x = opts.x ?? MARGIN;
      const lines = wrap(text, font, size, contentWidth - (x - MARGIN));
      for (const line of lines) {
        ensureSpace(LEADING);
        page.drawText(line, { x, y, size, font, color });
        y -= LEADING;
      }
      y -= opts.gapAfter ?? 0;
    };

    const heading = (text: string) => {
      y -= 7;
      ensureSpace(HEADING_SIZE + 14);
      page.drawText(text.toUpperCase(), {
        x: MARGIN,
        y,
        size: HEADING_SIZE,
        font: bold,
        color: INK,
      });
      y -= 6;
      page.drawLine({
        start: { x: MARGIN, y },
        end: { x: PAGE_WIDTH - MARGIN, y },
        thickness: 0.6,
        color: rgb(0.8, 0.8, 0.82),
      });
      y -= 11;
    };

    // Header
    writeLine(doc.name, { font: bold, size: 16, gapAfter: 1 });
    if (doc.headline) writeLine(doc.headline, { color: MUTED, gapAfter: 1 });
    if (doc.contact) writeLine(doc.contact, { size: 8.5, color: MUTED });

    for (const section of doc.sections) {
      const lines = section.lines.filter((l) => l.trim());
      if (lines.length === 0) continue;
      heading(section.heading);
      if (section.kind === "bullets") {
        for (const line of lines) writeLine(line, { x: MARGIN + 11 });
      } else {
        for (const line of lines) writeLine(line);
      }
    }

    const bytes = await pdf.save();
    const storageId = await ctx.storage.store(
      new Blob([new Uint8Array(bytes)], { type: "application/pdf" }),
    );
    const url = await ctx.storage.getUrl(storageId);

    await ctx.runMutation(internal.private.logActivity, {
      userId,
      jobId,
      action: "exported resume PDF",
      detail: job.title,
    });

    const slug = `${job.organization}-${job.title}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60);
    return { url, filename: `resume-${slug || "tailored"}.pdf` };
  },
});
