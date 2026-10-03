import { describe, expect, test } from "bun:test";
import {
  generateShareToken,
  isShareTokenExpired,
  sanitizeProfileForMentor,
} from "../src/convex/mentorShare";

describe("mentorShare", () => {
  test("generates unique, URL-safe 32-character tokens", () => {
    const t1 = generateShareToken();
    const t2 = generateShareToken();

    expect(t1).toHaveLength(32);
    expect(t2).toHaveLength(32);
    expect(t1).not.toBe(t2);
    expect(t1).toMatch(/^[a-zA-Z0-9]+$/);
  });

  test("accurately detects link expiration", () => {
    const now = Date.now();
    const future = now + 10000;
    const past = now - 10000;

    expect(isShareTokenExpired(future, now)).toBe(false);
    expect(isShareTokenExpired(past, now)).toBe(true);
  });

  test("sanitizes profile safely for external review", () => {
    const rawProfile = {
      fullName: "Aarav Sharma",
      headline: "CS Junior",
      email: "private@example.com",
      phone: "+91 9999999999",
      major: "Computer Science",
      university: "Pune Univ",
      skills: ["Python", "FastAPI"],
    };

    const sanitized = sanitizeProfileForMentor(rawProfile, "resume_only");
    expect(sanitized).toBeDefined();
    expect(sanitized?.fullName).toBe("Aarav Sharma");
    expect(sanitized?.major).toBe("Computer Science");
  });
});
