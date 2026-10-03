import { describe, expect, test } from "bun:test";
import {
  DOCUMENT_CATEGORIES,
  MAX_DOCUMENT_SIZE_BYTES,
  validateDocumentUpload,
} from "../src/convex/documents";

describe("documents vault", () => {
  test("defines comprehensive standard categories", () => {
    expect(DOCUMENT_CATEGORIES).toContain("transcript");
    expect(DOCUMENT_CATEGORIES).toContain("certificate");
    expect(DOCUMENT_CATEGORIES).toContain("id_proof");
    expect(DOCUMENT_CATEGORIES).toContain("recommendation_letter");
  });

  test("accepts valid PDF and image documents within limits", () => {
    const validPdf = validateDocumentUpload("Official_Transcript_BTech.pdf", 2 * 1024 * 1024);
    expect(validPdf.valid).toBe(true);

    const validImg = validateDocumentUpload("Certificate_AWS.PNG", 500 * 1024);
    expect(validImg.valid).toBe(true);
  });

  test("rejects unsupported extensions and executables", () => {
    const badExt = validateDocumentUpload("malicious_script.exe", 1024);
    expect(badExt.valid).toBe(false);
    expect(badExt.error).toContain("Unsupported file type");
  });

  test("enforces 10 MB maximum file size limit", () => {
    const oversized = validateDocumentUpload("Huge_File.pdf", MAX_DOCUMENT_SIZE_BYTES + 1024);
    expect(oversized.valid).toBe(false);
    expect(oversized.error).toContain("exceeds maximum allowed size");
  });

  test("rejects empty files and missing filenames", () => {
    const emptyFile = validateDocumentUpload("transcript.pdf", 0);
    expect(emptyFile.valid).toBe(false);

    const noName = validateDocumentUpload("", 1024);
    expect(noName.valid).toBe(false);
  });
});
