import { getAuthUserId } from "@convex-dev/auth/server";
import { action, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

interface RawJob {
  title: string;
  organization: string;
  location?: string;
  remoteOk: boolean;
  url: string;
  externalId?: string;
  description?: string;
  applyEmail?: string;
  opportunityType: "job" | "internship" | "research" | "fellowship";
  source: string;
  publishedAt?: number;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 12000,
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: {
        "User-Agent": "CareerPilot/1.0 (student job search; local app)",
        Accept: "application/json",
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Remotive public API — documented, public, no key, no login wall. */
async function collectRemotive(search: string): Promise<RawJob[]> {
  const res = await fetchWithTimeout(
    `https://remotive.com/api/remote-jobs?limit=40${search ? `&search=${encodeURIComponent(search)}` : ""}`,
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as {
    jobs?: Array<{
      id: number | string;
      url: string;
      title: string;
      company_name: string;
      candidate_required_location?: string;
      description?: string;
      publication_date?: string;
    }>;
  };
  return (data.jobs ?? []).slice(0, 25).map((j) => ({
    source: "Remotive",
    externalId: String(j.id),
    title: j.title,
    organization: j.company_name,
    location: j.candidate_required_location || "Remote",
    remoteOk: true,
    url: j.url,
    description: (j.description ?? "").replace(/<[^>]+>/g, " ").slice(0, 4000),
    opportunityType: "job" as const,
    publishedAt: j.publication_date
      ? new Date(j.publication_date).getTime()
      : undefined,
  }));
}

/** RemoteOK public JSON feed (https://remoteok.com/api) — public, no key. */
async function collectRemoteOK(): Promise<RawJob[]> {
  const res = await fetchWithTimeout("https://remoteok.com/api");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as Array<Record<string, unknown>>;
  return data
    .filter((j) => typeof j.position === "string" && typeof j.url === "string")
    .slice(0, 25)
    .map((j) => ({
      source: "RemoteOK",
      externalId: String(j.slug ?? j.id ?? j.url),
      title: String(j.position),
      organization: String(j.company ?? "Unknown"),
      location: "Remote",
      remoteOk: true,
      url: String(j.url),
      description: String(j.description ?? "")
        .replace(/<[^>]+>/g, " ")
        .slice(0, 4000),
      opportunityType: "job" as const,
      publishedAt:
        typeof j.date === "string" ? new Date(j.date).getTime() : undefined,
    }))
    .filter((j) => j.url.startsWith("http"));
}

/** Demo academic board — deterministic fixtures with real apply-email hooks so
 *  the human-approved pipeline can be exercised without external side effects. */
const DEMO_BOARD: RawJob[] = [
  {
    source: "DEMO-Research",
    externalId: "rs-1",
    title: "Undergraduate Research Assistant — ML for Healthcare",
    organization: "Stanford HAI (demo)",
    location: "Stanford, CA",
    remoteOk: false,
    url: "https://example.com/research/ml-health",
    description:
      "Join our lab to build machine learning pipelines for clinical data. " +
      "Requirements: strong Python, PyTorch, Pandas, NumPy; data analysis experience; " +
      "comfort with SQL; statistics background. Minimum 1 year of research experience preferred. " +
      "GPA 3.6+. Email your CV and a short note.",
    applyEmail: "talent@demo-lab.example",
    opportunityType: "research",
  },
  {
    source: "DEMO-Internships",
    externalId: "in-1",
    title: "Software Engineering Intern",
    organization: "Acme Cloud (demo)",
    location: "Remote",
    remoteOk: true,
    url: "https://example.com/intern/acme",
    description:
      "Work with our product team on developer tooling. Looking for: TypeScript, React, " +
      "Node.js, REST APIs, testing discipline, Git. Nice to have: Next.js, Tailwind, GraphQL. " +
      "1+ years of experience building projects. Send your resume by email.",
    applyEmail: "hiring@acme-demo.example",
    opportunityType: "internship",
  },
  {
    source: "DEMO-Research",
    externalId: "rs-2",
    title: "Research Intern — Reinforcement Learning",
    organization: "Nordic AI Institute (demo)",
    location: "Stockholm, Sweden (Remote-friendly)",
    remoteOk: true,
    url: "https://example.com/research/rl-intern",
    description:
      "Research intern position in reinforcement learning and robotics. Skills: Python, " +
      "Reinforcement Learning, PyTorch, computer vision basics, Linux, Docker. " +
      "Experience with robotics simulation is a plus. Email applications only.",
    applyEmail: "phd-office@nordic-demo.example",
    opportunityType: "research",
  },
  {
    source: "DEMO-Internships",
    externalId: "in-2",
    title: "Backend Engineering Intern (Go / Python)",
    organization: "Ferrous Systems Inc (demo)",
    location: "Austin, TX",
    remoteOk: false,
    url: "https://example.com/intern/backend",
    description:
      "Build internal services and APIs. Requirements: Go, Python, SQL, Docker, REST APIs, " +
      "system design fundamentals, 1-2 years of experience. Email your CV.",
    applyEmail: "people@ferrous-demo.example",
    opportunityType: "internship",
  },
  {
    source: "DEMO-Data",
    externalId: "da-1",
    title: "Data Analyst, Growth",
    organization: "Cobalt Retail (demo)",
    location: "Remote (EU)",
    remoteOk: true,
    url: "https://example.com/job/analyst",
    description:
      "Analyze funnel and retention data. Requirements: SQL, Python, Pandas, data analysis, " +
      "statistics, dashboards, communication. 2+ years of experience preferred. Apply by email.",
    applyEmail: "jobs@cobalt-demo.example",
    opportunityType: "job",
  },
];

/** Run collectors, then ingest: dedupe (URL + fuzzy), blacklist, auto-score. */
export const collect = action({
  args: {},
  handler: async (
    ctx,
  ): Promise<{
    fetched: number;
    inserted: number;
    deduped: number;
    collectors: string[];
    errors: string[];
  }> => {
    await getAuthUserId(ctx);
    const collectors: { name: string; run: () => Promise<RawJob[]> }[] = [
      { name: "RemoteOK", run: () => collectRemoteOK() },
      { name: "Remotive", run: () => collectRemotive("software") },
    ];
    const collected: RawJob[] = [];
    const errors: string[] = [];
    for (const c of collectors) {
      try {
        collected.push(...(await c.run()));
      } catch (err) {
        // One failing collector must never crash the run.
        errors.push(
          `${c.name}: ${err instanceof Error ? err.message : "failed"} — skipped`,
        );
      }
    }
    collected.push(...DEMO_BOARD);

    const { inserted } = await ctx.runMutation(internal.private.ingestJobs, {
      jobs: collected.map((j) => ({
        ...j,
        description: j.description?.slice(0, 4000),
      })),
    });
    return {
      fetched: collected.length,
      inserted,
      deduped: collected.length - inserted,
      collectors: [...collectors.map((c) => c.name), "DemoBoard"],
      errors,
    };
  },
});

export const collectStatus = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { total: 0 };
    const jobs = await ctx.db
      .query("jobs")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return { total: jobs.length };
  },
});
