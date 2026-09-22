// Production collectors. Rules honored here:
//  - official/documented public APIs, public job boards and a public search
//    index — never a login wall, never a browser-automation trick
//  - credentials read from environment variables, never hardcoded
//  - no anti-detection tooling and no proxy rotation of any kind
//  - every collector is isolated; one failure must not stop the run
//  - results per source are capped so volume stays low and polite

import {
  MAX_PER_SOURCE,
  USER_AGENT,
  classifyOpportunity,
  envList,
  envValue,
  stripHtml,
  type OpportunityType,
  type RawJob,
} from "./opportunities";
import {
  SEARCH_CHANNELS,
  channelKeysFor,
  collectChannel,
  domainsFor,
  exaConfigured,
  type SearchProfile,
} from "./websearch";

// Re-exported so every existing consumer keeps one import site.
export { classifyOpportunity, envList, envValue } from "./opportunities";
export type { OpportunityType, RawJob } from "./opportunities";

/** Everything a collector may use to decide what to look for. */
export interface CollectorRunContext {
  searchTerms: string[];
  location: string;
  profile: SearchProfile;
}

async function fetchJson<T>(
  url: string,
  init: RequestInit = {},
  timeoutMs = 12000,
): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
        ...(init.headers ?? {}),
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(
  url: string,
  init: RequestInit = {},
  timeoutMs = 12000,
): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/atom+xml, application/xml, text/xml",
        ...(init.headers ?? {}),
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------- RemoteOK ------------------------------- */

export async function collectRemoteOK(): Promise<RawJob[]> {
  const data = await fetchJson<Array<Record<string, unknown>>>(
    "https://remoteok.com/api",
  );
  return data
    .filter((j) => typeof j.position === "string" && typeof j.url === "string")
    .slice(0, MAX_PER_SOURCE)
    .map((j) => {
      const description = stripHtml(String(j.description ?? "")).slice(0, 4000);
      return {
        source: "RemoteOK",
        externalId: String(j.slug ?? j.id ?? j.url),
        title: String(j.position),
        organization: String(j.company ?? "Unknown"),
        location: "Remote",
        remoteOk: true,
        url: String(j.url),
        description,
        opportunityType: classifyOpportunity(String(j.position), description),
        publishedAt:
          typeof j.date === "string" ? new Date(j.date).getTime() : undefined,
      };
    })
    .filter((j) => j.url.startsWith("http"));
}

/* ------------------------------- Remotive ------------------------------- */

export async function collectRemotive(search: string): Promise<RawJob[]> {
  const data = await fetchJson<{
    jobs?: Array<{
      id: number | string;
      url: string;
      title: string;
      company_name: string;
      candidate_required_location?: string;
      description?: string;
      publication_date?: string;
    }>;
  }>(
    `https://remotive.com/api/remote-jobs?limit=${MAX_PER_SOURCE * 2}${
      search ? `&search=${encodeURIComponent(search)}` : ""
    }`,
  );
  return (data.jobs ?? []).slice(0, MAX_PER_SOURCE).map((j) => {
    const description = stripHtml(j.description ?? "").slice(0, 4000);
    return {
      source: "Remotive",
      externalId: String(j.id),
      title: j.title,
      organization: j.company_name,
      location: j.candidate_required_location || "Remote",
      remoteOk: true,
      url: j.url,
      description,
      opportunityType: classifyOpportunity(j.title, description),
      publishedAt: j.publication_date
        ? new Date(j.publication_date).getTime()
        : undefined,
    };
  });
}

/* -------------------------------- Adzuna -------------------------------- */
// Requires ADZUNA_APP_ID + ADZUNA_APP_KEY (free tier at developer.adzuna.com).
// Adzuna's terms require attribution when displaying their data — the UI shows
// the source on every row for exactly that reason.

export function adzunaConfigured(): boolean {
  return !!(envValue("ADZUNA_APP_ID") && envValue("ADZUNA_APP_KEY"));
}

export async function collectAdzuna(
  search: string,
  country = "us",
): Promise<RawJob[]> {
  const appId = envValue("ADZUNA_APP_ID");
  const appKey = envValue("ADZUNA_APP_KEY");
  if (!appId || !appKey) throw new Error("ADZUNA_APP_ID/ADZUNA_APP_KEY not set");

  const url =
    `https://api.adzuna.com/v1/api/jobs/${encodeURIComponent(country)}/search/1` +
    `?app_id=${encodeURIComponent(appId)}&app_key=${encodeURIComponent(appKey)}` +
    `&results_per_page=${MAX_PER_SOURCE}&max_days_old=30&content-type=application/json` +
    (search ? `&what=${encodeURIComponent(search)}` : "");

  const data = await fetchJson<{
    results?: Array<{
      id: string;
      title: string;
      redirect_url: string;
      description?: string;
      created?: string;
      company?: { display_name?: string };
      location?: { display_name?: string };
    }>;
  }>(url);

  return (data.results ?? []).slice(0, MAX_PER_SOURCE).map((j) => {
    const description = stripHtml(j.description ?? "").slice(0, 4000);
    return {
      source: "Adzuna",
      externalId: String(j.id),
      title: j.title,
      organization: j.company?.display_name ?? "Unknown",
      location: j.location?.display_name ?? undefined,
      remoteOk: /remote/i.test(
        `${j.title} ${j.location?.display_name ?? ""} ${description}`,
      ),
      url: j.redirect_url,
      description,
      opportunityType: classifyOpportunity(j.title, description),
      publishedAt: j.created ? new Date(j.created).getTime() : undefined,
    };
  });
}

/* -------------------------------- Jooble -------------------------------- */
// Requires JOOBLE_API_KEY. Jooble's API is a documented REST endpoint that
// returns JSON for a keyword/location query.

export function joobleConfigured(): boolean {
  return !!envValue("JOOBLE_API_KEY");
}

export async function collectJooble(
  search: string,
  location = "",
): Promise<RawJob[]> {
  const key = envValue("JOOBLE_API_KEY");
  if (!key) throw new Error("JOOBLE_API_KEY not set");

  const data = await fetchJson<{
    jobs?: Array<{
      id?: number | string;
      title: string;
      link: string;
      snippet?: string;
      company?: string;
      location?: string;
      updated?: string;
      type?: string;
    }>;
  }>(`https://jooble.org/api/${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      keywords: search,
      location,
      page: "1",
      ResultOnPage: MAX_PER_SOURCE,
    }),
  });

  return (data.jobs ?? []).slice(0, MAX_PER_SOURCE).map((j) => {
    const description = stripHtml(j.snippet ?? "").slice(0, 4000);
    return {
      source: "Jooble",
      externalId: j.id !== undefined ? String(j.id) : undefined,
      title: j.title,
      organization: j.company ?? "Unknown",
      location: j.location || undefined,
      remoteOk: /remote/i.test(`${j.location ?? ""} ${description}`),
      url: j.link,
      description,
      opportunityType: classifyOpportunity(j.title, `${description} ${j.type ?? ""}`),
      publishedAt: j.updated ? new Date(j.updated).getTime() : undefined,
    };
  });
}

/* ----------------------- Greenhouse public boards ----------------------- */
// Public job-board API, no authentication. Board tokens are configured by the
// user (company career-page slugs), e.g. GREENHOUSE_BOARD_TOKENS=stripe,figma

export function greenhouseConfigured(): boolean {
  return envList("GREENHOUSE_BOARD_TOKENS").length > 0;
}

export async function collectGreenhouse(): Promise<RawJob[]> {
  const tokens = envList("GREENHOUSE_BOARD_TOKENS").slice(0, 10);
  if (tokens.length === 0) throw new Error("GREENHOUSE_BOARD_TOKENS not set");

  const out: RawJob[] = [];
  for (const token of tokens) {
    const data = await fetchJson<{
      jobs?: Array<{
        id: number;
        title: string;
        absolute_url: string;
        updated_at?: string;
        location?: { name?: string };
        content?: string;
      }>;
    }>(
      `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs?content=true`,
    );
    for (const j of (data.jobs ?? []).slice(0, MAX_PER_SOURCE)) {
      const description = stripHtml(j.content ?? "").slice(0, 4000);
      out.push({
        source: "Greenhouse",
        externalId: `${token}:${j.id}`,
        title: j.title,
        organization: token.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        location: j.location?.name,
        remoteOk: /remote/i.test(`${j.location?.name ?? ""} ${j.title}`),
        url: j.absolute_url,
        description,
        opportunityType: classifyOpportunity(j.title, description),
        publishedAt: j.updated_at ? new Date(j.updated_at).getTime() : undefined,
      });
    }
  }
  return out;
}

/* -------------------------- Lever public boards ------------------------- */
// Public postings API, no authentication: LEVER_BOARD_TOKENS=netflix,ramp

export function leverConfigured(): boolean {
  return envList("LEVER_BOARD_TOKENS").length > 0;
}

export async function collectLever(): Promise<RawJob[]> {
  const tokens = envList("LEVER_BOARD_TOKENS").slice(0, 10);
  if (tokens.length === 0) throw new Error("LEVER_BOARD_TOKENS not set");

  const out: RawJob[] = [];
  for (const token of tokens) {
    const data = await fetchJson<
      Array<{
        id: string;
        text: string;
        hostedUrl: string;
        createdAt?: number;
        categories?: { location?: string; team?: string; commitment?: string };
        descriptionPlain?: string;
        description?: string;
      }>
    >(`https://api.lever.co/v0/postings/${encodeURIComponent(token)}?mode=json`);

    for (const j of (data ?? []).slice(0, MAX_PER_SOURCE)) {
      const description = stripHtml(
        j.descriptionPlain ?? j.description ?? "",
      ).slice(0, 4000);
      out.push({
        source: "Lever",
        externalId: `${token}:${j.id}`,
        title: j.text,
        organization: token.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        location: j.categories?.location,
        remoteOk: /remote/i.test(j.categories?.location ?? ""),
        url: j.hostedUrl,
        description,
        opportunityType: classifyOpportunity(j.text, description),
        publishedAt: j.createdAt,
      });
    }
  }
  return out;
}

/* -------------------------------- arXiv --------------------------------- */
// Public Atom API from Cornell's arXiv. Research groups post open assistant
// and intern roles in paper abstracts/comments, so we surface papers matching
// the student's target topics as *research* opportunities (no apply email —
// these are always manual-apply, which the pipeline already marks).

export async function collectArxiv(topic: string): Promise<RawJob[]> {
  const query = topic.trim() || "machine learning";
  const url =
    `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}` +
    `&start=0&max_results=${MAX_PER_SOURCE}&sortBy=submittedDate&sortOrder=descending`;
  const xml = await fetchText(url);

  const entries = xml.split("<entry>").slice(1);
  return entries.slice(0, MAX_PER_SOURCE).map((entry) => {
    const pick = (tag: string): string => {
      const m = entry.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
      return m ? stripHtml(m[1]) : "";
    };
    const title = pick("title").replace(/\s+/g, " ").trim();
    const summary = pick("summary").slice(0, 3000);
    const id = pick("id");
    const authors = Array.from(entry.matchAll(/<name>([\s\S]*?)<\/name>/g))
      .slice(0, 3)
      .map((m) => stripHtml(m[1]))
      .join(", ");
    const published = pick("published");
    const comment = pick("arxiv:comment");
    return {
      source: "arXiv",
      externalId: id || title,
      title: title.slice(0, 200),
      organization: authors || "arXiv preprint",
      location: "Remote / on-site",
      remoteOk: false,
      url: id,
      description: [comment ? `Note: ${comment}` : "", summary]
        .filter(Boolean)
        .join("\n\n")
        .slice(0, 4000),
      opportunityType: "research" as const,
      publishedAt: published ? new Date(published).getTime() : undefined,
    };
  });
}

/* -------------------------- Semantic Scholar ---------------------------- */
// Public Graph API. Works unauthenticated at a low rate; SEMANTIC_SCHOLAR_API_KEY
// raises the limit. Treated as a research-opportunity feed like arXiv.

export function semanticScholarConfigured(): boolean {
  return true; // public API; the key is optional
}

export async function collectSemanticScholar(topic: string): Promise<RawJob[]> {
  const key = envValue("SEMANTIC_SCHOLAR_API_KEY");
  const query = topic.trim() || "machine learning";
  const fields = "title,abstract,url,year,authors,externalIds,openAccessPdf";
  const data = await fetchJson<{
    data?: Array<{
      paperId: string;
      title: string;
      abstract?: string;
      url?: string;
      year?: number;
      authors?: Array<{ name: string }>;
    }>;
  }>(
    `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(
      query,
    )}&limit=${MAX_PER_SOURCE}&fields=${fields}`,
    key ? { headers: { "x-api-key": key } } : {},
  );

  return (data.data ?? []).slice(0, MAX_PER_SOURCE).map((p) => ({
    source: "SemanticScholar",
    externalId: p.paperId,
    title: p.title.slice(0, 200),
    organization:
      (p.authors ?? []).slice(0, 3).map((a) => a.name).join(", ") ||
      "Semantic Scholar",
    location: "Remote / on-site",
    remoteOk: false,
    url: p.url ?? `https://www.semanticscholar.org/paper/${p.paperId}`,
    description: (p.abstract ?? "").slice(0, 3000),
    opportunityType: "research" as const,
    publishedAt: undefined,
  }));
}

/* ------------------------------- Demo board ----------------------------- */
// Sample listings used ONLY when the user turns demo mode on. Never part of a
// production run — every row is clearly labeled and the apply addresses are
// unroutable, so the send path simulates instead of mailing anyone.

export function collectDemoBoard(): RawJob[] {
  return [
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
      deadline: "Rolling",
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
      deadline: "2026-10-15",
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
    {
      source: "DEMO-Scholarship",
      externalId: "sc-1",
      title: "Merit Scholarship for Undergraduate STEM Students",
      organization: "Helios Foundation (demo)",
      location: "Remote / international",
      remoteOk: true,
      url: "https://example.com/scholarships/merit-stem",
      description:
        "Merit scholarship covering tuition and a monthly stipend for undergraduate STEM " +
        "students. Eligibility: enrolled in a Computer Science or engineering program, GPA 3.5+, " +
        "demonstrated project work. Requires one reference letter and a statement of purpose. " +
        "Deadline 2026-11-30. Submit the application form on the foundation portal.",
      deadline: "2026-11-30",
      opportunityType: "scholarship",
    },
    {
      source: "DEMO-Exams",
      externalId: "ex-1",
      title: "Graduate Level Engineering Services Examination — Notification",
      organization: "Public Service Commission (demo)",
      location: "Nationwide",
      remoteOk: false,
      url: "https://example.com/exams/engineering-services",
      description:
        "Government recruitment notification for graduate engineers. Eligibility: bachelor's " +
        "degree in engineering or computer science, age 21-30. Selection: preliminary exam, " +
        "mains exam, interview. Online application closes 2027-01-20. Read the official " +
        "notification and check the syllabus and cutoff before applying.",
      deadline: "2027-01-20",
      opportunityType: "govt-exam",
    },
    {
      source: "DEMO-Fellowship",
      externalId: "fe-1",
      title: "Open Source Fellowship — Data Tooling",
      organization: "Commons Collective (demo)",
      location: "Remote",
      remoteOk: true,
      url: "https://example.com/fellowship/open-source",
      description:
        "Six-month fellowship for students who want to work on open source data tooling. " +
        "Skills: Python, Git, testing, documentation, SQL. Stipend provided. " +
        "Apply with a short project proposal and links to your repositories.",
      applyEmail: "fellowship@commons-demo.example",
      opportunityType: "fellowship",
    },
    {
      source: "DEMO-StudyAbroad",
      externalId: "sa-1",
      title: "Master's Programme in Data Science — Study in Germany",
      organization: "Nordic Technical University (demo)",
      location: "Munich, Germany",
      remoteOk: false,
      url: "https://example.com/study-abroad/msc-data-science",
      description:
        "Two-year English-taught master's programme for international students. Admission " +
        "requirements: bachelor's degree in a quantitative field, transcripts, statement of " +
        "purpose, two references. Application portal closes 2027-03-15. Tuition-free; check " +
        "the official page for the blocked-account and visa requirements. Apply on the " +
        "university's own portal — this app never fills or submits it for you.",
      deadline: "2027-03-15",
      opportunityType: "study-abroad",
    },
  ];
}

/* --------------------------- Collector registry -------------------------- */

export interface CollectorSpec {
  name: string;
  /** Config keys the user must add to the deployment environment, if any. */
  requiresEnv: string[];
  /** Usable with the deployment's current environment. */
  configured: () => boolean;
  /** Extra per-profile gate (e.g. the profile opted into scholarships). */
  enabledFor?: (profile: SearchProfile) => boolean;
  /** Section this source fills, for the UI strip. */
  section?: string;
  run: (ctx: CollectorRunContext) => Promise<RawJob[]>;
}

const BOARD_COLLECTORS: CollectorSpec[] = [
  {
    name: "RemoteOK",
    requiresEnv: [],
    configured: () => true,
    section: "Jobs",
    run: () => collectRemoteOK(),
  },
  {
    name: "Remotive",
    requiresEnv: [],
    configured: () => true,
    section: "Jobs",
    run: (ctx) => collectRemotive(ctx.searchTerms[0] ?? "software"),
  },
  {
    name: "Adzuna",
    requiresEnv: ["ADZUNA_APP_ID", "ADZUNA_APP_KEY"],
    configured: adzunaConfigured,
    section: "Jobs",
    run: (ctx) =>
      collectAdzuna(
        ctx.searchTerms[0] ?? "software engineer",
        envValue("ADZUNA_COUNTRY") ?? "us",
      ),
  },
  {
    name: "Jooble",
    requiresEnv: ["JOOBLE_API_KEY"],
    configured: joobleConfigured,
    section: "Jobs",
    run: (ctx) =>
      collectJooble(ctx.searchTerms[0] ?? "software engineer", ctx.location),
  },
  {
    name: "Greenhouse",
    requiresEnv: ["GREENHOUSE_BOARD_TOKENS"],
    configured: greenhouseConfigured,
    section: "Jobs",
    run: () => collectGreenhouse(),
  },
  {
    name: "Lever",
    requiresEnv: ["LEVER_BOARD_TOKENS"],
    configured: leverConfigured,
    section: "Jobs",
    run: () => collectLever(),
  },
  {
    name: "arXiv",
    requiresEnv: [],
    configured: () => true,
    section: "Research",
    run: (ctx) => collectArxiv(ctx.searchTerms[0] ?? "machine learning"),
  },
  {
    name: "SemanticScholar",
    requiresEnv: [],
    configured: semanticScholarConfigured,
    section: "Research",
    run: (ctx) => collectSemanticScholar(ctx.searchTerms[0] ?? "machine learning"),
  },
];

/**
 * One registry entry per open-web channel, so the dashboard strip shows which
 * sections (scholarships, government exams, study abroad, blogs) actually
 * produced data and which one is waiting on EXA_API_KEY.
 *
 * The scholarship, exam and study-abroad channels run only against the official
 * portal allow-list in websearch.ts, so an unrestricted "scholarship blog"
 * never reaches the pipeline.
 */
const WEB_COLLECTORS: CollectorSpec[] = SEARCH_CHANNELS.map((channel) => ({
  name: `Web · ${channel.label}`,
  requiresEnv: ["EXA_API_KEY"],
  configured: exaConfigured,
  section: channel.label,
  enabledFor: (profile) =>
    channel.key === "community"
      ? // Blogs and forums are opt-in: they only add value with a domain list.
        domainsFor("community") !== undefined
      : channelKeysFor(profile).includes(channel.key),
  run: (ctx) => collectChannel(channel.key, ctx.profile),
}));

export const COLLECTORS: CollectorSpec[] = [...BOARD_COLLECTORS, ...WEB_COLLECTORS];

export interface CollectorStatus {
  name: string;
  configured: boolean;
  requiresEnv: string[];
  section?: string;
  /** Enabled for this profile (opt-in sections can be off). */
  enabled: boolean;
}

/** Status for the dashboard strip. Names and variable names only, never values. */
export function collectorStatuses(profile?: SearchProfile): CollectorStatus[] {
  return COLLECTORS.map((c) => ({
    name: c.name,
    configured: c.configured(),
    requiresEnv: c.requiresEnv,
    section: c.section,
    // Without a profile we cannot know whether an opt-in section applies, so
    // report it as not enabled rather than guessing.
    enabled: c.enabledFor ? (profile ? c.enabledFor(profile) : false) : true,
  }));
}

/** True when this collector should run for the given profile right now. */
export function collectorEnabled(
  spec: CollectorSpec,
  profile: SearchProfile,
): boolean {
  if (!spec.configured()) return false;
  return spec.enabledFor ? spec.enabledFor(profile) : true;
}
