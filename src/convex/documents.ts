// Document Vault module: Secure storage and management of academic transcripts,
// test scorecards, certificates, recommendation letters, and ID documents.

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

export const DOCUMENT_CATEGORIES = [
  "transcript",
  "certificate",
  "id_proof",
  "recommendation_letter",
  "publication",
  "other",
] as const;

export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

export const MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB limit
export const ALLOWED_EXTENSIONS = [".pdf", ".png", ".jpg", ".jpeg", ".docx"];

/** Pure validation helper for document uploads. */
export function validateDocumentUpload(
  fileName: string,
  fileSizeBytes: number,
): { valid: boolean; error?: string } {
  if (!fileName || fileName.trim().length === 0) {
    return { valid: false, error: "File name is required." };
  }

  const lower = fileName.toLowerCase();
  const hasAllowedExt = ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
  if (!hasAllowedExt) {
    return {
      valid: false,
      error: `Unsupported file type. Allowed formats: ${ALLOWED_EXTENSIONS.join(", ")}`,
    };
  }

  if (fileSizeBytes <= 0) {
    return { valid: false, error: "File is empty." };
  }

  if (fileSizeBytes > MAX_DOCUMENT_SIZE_BYTES) {
    return {
      valid: false,
      error: `File exceeds maximum allowed size of 10 MB (size: ${(fileSizeBytes / (1024 * 1024)).toFixed(1)} MB).`,
    };
  }

  return { valid: true };
}

/** List all stored vault documents for the authenticated user. */
export const listMyDocuments = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query("documents")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});

/** Add a new document record into the vault. */
export const addDocument = mutation({
  args: {
    title: v.string(),
    category: v.string(),
    fileName: v.string(),
    fileId: v.id("_storage"),
    fileSize: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in required.");

    const validation = validateDocumentUpload(args.fileName, args.fileSize ?? 1024);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const docId = await ctx.db.insert("documents", {
      userId,
      title: args.title.trim(),
      category: args.category,
      fileName: args.fileName,
      fileId: args.fileId,
      fileSize: args.fileSize,
      notes: args.notes?.trim(),
      createdAt: Date.now(),
    });

    await ctx.db.insert("activity", {
      userId,
      action: "document uploaded",
      detail: `${args.title} (${args.category})`,
      createdAt: Date.now(),
    });

    return docId;
  },
});

/** Delete a vault document and remove its file from storage. */
export const deleteDocument = mutation({
  args: { documentId: v.id("documents") },
  handler: async (ctx, { documentId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in required.");

    const doc = await ctx.db.get(documentId);
    if (!doc || doc.userId !== userId) {
      throw new Error("Document not found or access denied.");
    }

    await ctx.storage.delete(doc.fileId);
    await ctx.db.delete(documentId);

    await ctx.db.insert("activity", {
      userId,
      action: "document deleted",
      detail: doc.title,
      createdAt: Date.now(),
    });

    return { success: true };
  },
});
