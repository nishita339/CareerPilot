import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  buildChannelPlan,
  buildExaRequestBody,
  channelKeysFor,
  extractDeadlineFromText,
  mapResultToRawJob,
  SEARCH_CHANNELS,
  type SearchProfile,
} from "../src/convex/websearch";

const MANAGED = ["EXA_API_KEY", "EXA_COMMUNITY_DOMAINS"];
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const name of MANAGED) {
    saved[name] = process.env[name];
    delete process.env[name];
  }
});

afterEach(() => {
  for (const name of MANAGED) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
});

const profile: SearchProfile = {
  major: "Computer Science",
  targetRoles: ["Software Engineer Intern", "Research Assistant"],
  locations: "Pune, India",
  country: "India",
  opportunityTypes: ["job", "internship", "research", "scholarship", "govt-exam"],
};

const AT = Date.UTC(2026, 8, 22);

describe("channelKeysFor", () => {
  test("maps opportunity types to channels", () => {
    expect(channelKeysFor(profile)).toEqual([
      "jobs",
      "internships",
      "research",
      "scholarships",
      "govt-exams",
    ]);
  });

  test("a profile that only wants internships asks for one channel", () => {
    expect(
      channelKeysFor({ ...profile, opportunityTypes: ["internship"] }),
    ).toEqual(["internships"]);
  });

  test("never throws without a profile", () => {
    expect(channelKeysFor(undefined)).toEqual([]);
  });
});

describe("buildChannelPlan", () => {
  test("builds one specific query per selected channel", () => {
    const plan = buildChannelPlan(profile, AT);
    const byKey = new Map(plan.map((p) => [p.channel.key, p.query]));
    expect(byKey.get("jobs")).toContain("Software Engineer Intern");
    expect(byKey.get("jobs")).toContain("Pune");
    expect(byKey.get("jobs")).toContain("2026");
    expect(byKey.get("scholarships")).toContain("scholarship");
    expect(byKey.get("scholarships")).toContain("India");
    expect(byKey.get("govt-exams")).toContain("government exam");
    expect(byKey.get("research")).toContain("call for papers");
  });

  test("the community channel needs an explicit domain allow-list", () => {
    expect(buildChannelPlan(profile, AT).map((p) => p.channel.key)).not.toContain(
      "community",
    );
    process.env.EXA_COMMUNITY_DOMAINS = "medium.com, dev.to";
    const withCommunity = buildChannelPlan(profile, AT);
    const community = withCommunity.find((p) => p.channel.key === "community");
    expect(community?.includeDomains).toEqual(["medium.com", "dev.to"]);
  });

  test("every channel carries a hint and a label", () => {
    for (const channel of SEARCH_CHANNELS) {
      expect(channel.label.length).toBeGreaterThan(0);
      expect(channel.buildQuery(profile, 2026).length).toBeGreaterThan(10);
    }
  });
});

describe("buildExaRequestBody", () => {
  test("requests a small page of text content", () => {
    const body = buildExaRequestBody({ query: "python internship" });
    expect(body.query).toBe("python internship");
    expect(body.numResults).toBeGreaterThan(0);
    expect(body.numResults).toBeLessThanOrEqual(20);
    expect(body.contents).toBeTruthy();
    expect(body.includeDomains).toBeUndefined();
  });

  test("passes includeDomains only when there is a list", () => {
    expect(
      buildExaRequestBody({ query: "x", includeDomains: [] }).includeDomains,
    ).toBeUndefined();
    expect(
      buildExaRequestBody({ query: "x", includeDomains: ["medium.com"] })
        .includeDomains,
    ).toEqual(["medium.com"]);
  });
});

describe("mapResultToRawJob", () => {
  const plan = { channel: SEARCH_CHANNELS.find((c) => c.key === "scholarships")! };

  test("maps an indexed page into a pipeline row", () => {
    const job = mapResultToRawJob(
      {
        title: "Merit Scholarship for Undergraduate Students 2027",
        url: "https://www.some-uni.edu/scholarships/merit",
        publishedDate: "2026-08-01T00:00:00.000Z",
        text: "Eligibility: undergraduate students. Deadline 2026-11-30. Apply by email to aid@some-uni.edu.",
      },
      plan,
      AT,
    );
    expect(job).not.toBeNull();
    expect(job!.source).toBe("Web · Scholarships");
    expect(job!.organization).toBe("www.some-uni.edu".replace("www.", ""));
    expect(job!.opportunityType).toBe("scholarship");
    expect(job!.deadline).toBe("2026-11-30");
    expect(job!.applyEmail).toBe("aid@some-uni.edu");
    expect(job!.publishedAt).toBe(Date.parse("2026-08-01T00:00:00.000Z"));
    expect(job!.externalId).toBe(job!.url);
  });

  test("uses the channel hint when the text gives no signal", () => {
    const job = mapResultToRawJob(
      { title: "Trending in data science", url: "https://dev.to/post", text: "notes" },
      plan,
      AT,
    );
    expect(job!.opportunityType).toBe("scholarship");
    expect(job!.remoteOk).toBe(false);
  });

  test("skips results that are not usable listings", () => {
    expect(mapResultToRawJob({ title: "", url: "https://x.dev" }, plan, AT)).toBeNull();
    expect(mapResultToRawJob({ title: "Something" }, plan, AT)).toBeNull();
    expect(
      mapResultToRawJob({ title: "Local file", url: "file:///tmp/x" }, plan, AT),
    ).toBeNull();
  });

  test("strips markup out of indexed text", () => {
    const job = mapResultToRawJob(
      {
        title: "<b>Research Assistant</b>",
        url: "https://lab.edu/apply",
        text: "<p>Remote role &amp; paid</p>",
      },
      plan,
      AT,
    );
    expect(job!.title).toBe("Research Assistant");
    expect(job!.description).toBe("Remote role & paid");
    expect(job!.remoteOk).toBe(true);
  });
});

describe("extractDeadlineFromText", () => {
  test("only trusts explicitly labelled dates", () => {
    expect(extractDeadlineFromText("Deadline 2026-11-30 for all applicants")).toBe(
      "2026-11-30",
    );
    expect(extractDeadlineFromText("Applications close 15 Nov 2026.")).toBe(
      "15 Nov 2026",
    );
    expect(extractDeadlineFromText("Last date: Nov 30, 2026")).toBe("Nov 30, 2026");
  });

  test("ignores dates that are not deadlines", () => {
    expect(extractDeadlineFromText("Founded in 2019, we serve 500 students")).toBeUndefined();
    expect(extractDeadlineFromText("Rolling admissions")).toBeUndefined();
    expect(extractDeadlineFromText(undefined)).toBeUndefined();
  });
});
