import { describe, expect, test } from "bun:test";
import {
  isBlacklisted,
  isDuplicate,
  parseBlacklist,
  titleOverlap,
  urlKey,
} from "../src/convex/dedupe";

describe("urlKey", () => {
  test("normalizes scheme, www, tracking params and trailing slash", () => {
    expect(urlKey("https://www.Example.com/jobs/123/?utm_source=x#apply")).toBe(
      "example.com/jobs/123",
    );
    expect(urlKey("http://example.com/jobs/123")).toBe("example.com/jobs/123");
  });

  test("keeps distinct paths distinct", () => {
    expect(urlKey("https://example.com/jobs/123")).not.toBe(
      urlKey("https://example.com/jobs/124"),
    );
  });
});

describe("isDuplicate", () => {
  test("same listing with different tracking params is a duplicate", () => {
    expect(
      isDuplicate(
        { title: "SWE Intern", organization: "Acme", url: "https://acme.com/j/1?ref=li" },
        { title: "SWE Intern", organization: "Acme", url: "https://www.acme.com/j/1" },
      ),
    ).toBe(true);
  });

  test("same externalId from the same source is a duplicate", () => {
    expect(
      isDuplicate(
        { title: "SWE Intern", organization: "Acme", externalId: "42", source: "Greenhouse" },
        { title: "SWE Intern", organization: "Acme", externalId: "42", source: "Greenhouse" },
      ),
    ).toBe(true);
  });

  test("an externalId collision across sources does not dedupe distinct roles", () => {
    expect(
      isDuplicate(
        { title: "SWE Intern", organization: "Acme", externalId: "42", source: "Greenhouse" },
        { title: "Data Analyst", organization: "Acme", externalId: "42", source: "Lever" },
      ),
    ).toBe(false);
  });

  test("the same role posted on two boards dedupes on org + title", () => {
    expect(
      isDuplicate(
        { title: "SWE Intern", organization: "Acme", externalId: "42", source: "Greenhouse" },
        { title: "SWE Intern", organization: "Acme", externalId: "42", source: "Lever" },
      ),
    ).toBe(true);
  });

  test("same org with a near-identical title is a duplicate (repost)", () => {
    expect(
      isDuplicate(
        { title: "Software Engineer Intern", organization: "Acme Cloud" },
        { title: "Software Engineer Intern (Remote)", organization: "acme cloud" },
      ),
    ).toBe(true);
  });

  test("same title at a different company is not a duplicate", () => {
    expect(
      isDuplicate(
        { title: "Software Engineer Intern", organization: "Acme Cloud" },
        { title: "Software Engineer Intern", organization: "Globex" },
      ),
    ).toBe(false);
  });

  test("genuinely different roles at one company are kept", () => {
    expect(
      isDuplicate(
        { title: "Software Engineer Intern", organization: "Acme Cloud" },
        { title: "Product Designer", organization: "Acme Cloud" },
      ),
    ).toBe(false);
  });

  test("titleOverlap is symmetric and bounded", () => {
    const a = titleOverlap("Data Analyst Intern", "Intern Data Analyst");
    expect(a).toBeGreaterThan(0.5);
    expect(titleOverlap("Data Analyst", "Data Analyst")).toBe(1);
  });
});

describe("blacklist", () => {
  test("parses commas and newlines, lowercases and drops blanks", () => {
    expect(parseBlacklist("Palantir, MangoLabs\n\n , Contoso")).toEqual([
      "palantir",
      "mangolabs",
      "contoso",
    ]);
  });

  test("matches a substring case-insensitively", () => {
    expect(isBlacklisted("Palantir Technologies", ["palantir"])).toBe(true);
    expect(isBlacklisted("Acme Cloud", "palantir, mangolabs")).toBe(false);
  });

  test("ignores empty blacklist and one-character terms", () => {
    expect(isBlacklisted("Acme Cloud", "")).toBe(false);
    expect(isBlacklisted("Acme Cloud", ["a"])).toBe(false);
  });
});
