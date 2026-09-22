import { motion } from "framer-motion";
import { Link } from "react-router";
import {
  ArrowRight,
  Bot,
  Check,
  FileText,
  Gauge,
  GraduationCap,
  Landmark,
  Lightbulb,
  Search,
  ShieldCheck,
  UserRoundCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/use-auth";

const fadeUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
};

function Header() {
  const { isAuthenticated } = useAuth();
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-6">
        <div className="flex items-center gap-2.5">
          <div className="flex size-6 items-center justify-center border border-foreground">
            <div className="size-2 bg-primary" />
          </div>
          <span className="text-sm font-semibold tracking-tight">CareerPilot</span>
        </div>
        <nav className="flex items-center gap-6 text-sm text-muted-foreground">
          <a href="#channels" className="hidden transition-colors hover:text-foreground sm:block">
            What it finds
          </a>
          <a href="#how" className="hidden transition-colors hover:text-foreground sm:block">
            How it works
          </a>
          <a href="#policy" className="hidden transition-colors hover:text-foreground sm:block">
            Policy
          </a>
          <Button asChild size="sm" className="h-8">
            <Link to={isAuthenticated ? "/dashboard" : "/auth?returnTo=%2Fonboarding"}>
              {isAuthenticated ? "Open dashboard" : "Sign in"}
              <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}

const CHANNELS = [
  {
    icon: Search,
    title: "Jobs & internships",
    body: "RemoteOK, Remotive, Adzuna, Jooble and public Greenhouse and Lever boards — each in its own section so full-time and internship roles never mix.",
    tag: "Job boards + public boards",
  },
  {
    icon: GraduationCap,
    title: "Research & papers",
    body: "arXiv and Semantic Scholar feeds matched to your field, so assistant roles, preprint threads and calls for papers surface next to the corporate listings.",
    tag: "arXiv · Semantic Scholar",
  },
  {
    icon: Lightbulb,
    title: "Scholarships",
    body: "Merit and need-based awards found through a public web-search index, with eligibility text, deadlines pulled out of the page, and the original link kept.",
    tag: "Web search index",
  },
  {
    icon: Landmark,
    title: "Government exams",
    body: "Public-sector exam and recruitment notifications for graduates, separated from jobs entirely — because a notification is not an application form.",
    tag: "Web search index",
  },
];

const STEPS = [
  {
    icon: FileText,
    step: "01",
    title: "A profile that must be true",
    body: "Sign in, then a mandatory setup: your details, education, skills, projects and your own resume. This is the only material any generated claim may draw from.",
  },
  {
    icon: Search,
    step: "02",
    title: "Discovery across channels",
    body: "Official APIs and public boards first, plus a public web-search index for the things boards do not carry. One failing source never stops the rest.",
  },
  {
    icon: Gauge,
    step: "03",
    title: "A score you can argue with",
    body: "A transparent 0–100 across skills, role fit, experience, location and type — with matched and missing skills spelled out, and recurring gaps surfaced as advice.",
  },
  {
    icon: ShieldCheck,
    step: "04",
    title: "Truthful tailoring",
    body: "One structured resume becomes an ATS-friendly single-column PDF. A validator rejects any skill, employer or metric that is not in your profile.",
  },
  {
    icon: Bot,
    step: "05",
    title: "Autopilot — bounded, opt-in",
    body: "Arm it and the daily run emails high-scoring roles with a verified address and a clean validator verdict, up to 3/day, never twice at the same company. Web forms are never touched.",
  },
  {
    icon: UserRoundCheck,
    step: "06",
    title: "You approve the rest",
    body: "Everything below the autopilot bar waits for you. Review the resume diff, read the flags, then approve and send — or copy the application kit and submit by hand.",
  },
];

const POLICY_ROWS = [
  [
    "Discovery sources",
    "Documented public APIs, public job boards and a public search index; robots.txt respected; no login-wall scraping",
  ],
  [
    "Anti-detection",
    "None. No fingerprint spoofing, no proxy rotation, no CAPTCHA solving — a blocked source is skipped",
  ],
  [
    "Resume claims",
    "Validator-checked against your profile; nothing is fabricated, ever",
  ],
  [
    "Autopilot",
    "Opt-in, email-only, above its own score floor, validator-clean, at most 3/day, inside the company cooldown",
  ],
  [
    "Web forms",
    "Never filled, never submitted. You get a copy-paste kit plus the PDF and press Submit yourself",
  ],
  [
    "Your data",
    "Stays in your account, including the exported files; one click deletes the rows and the blobs",
  ],
];

export default function Landing() {
  const { isAuthenticated } = useAuth();
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="flex min-h-screen flex-col bg-background text-foreground"
    >
      <Header />

      {/* Hero */}
      <section className="mx-auto w-full max-w-5xl px-6 pt-24 pb-20 sm:pt-32">
        <motion.p {...fadeUp} transition={{ duration: 0.4 }} className="micro-label">
          For students · jobs, internships, research, scholarships & exams
        </motion.p>
        <motion.h1
          {...fadeUp}
          transition={{ duration: 0.45, delay: 0.05 }}
          className="mt-6 max-w-3xl text-4xl font-semibold leading-[1.08] tracking-tight sm:text-6xl"
        >
          One profile. Every opportunity. A hand brake you control.
        </motion.h1>
        <motion.p
          {...fadeUp}
          transition={{ duration: 0.45, delay: 0.12 }}
          className="mt-6 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8"
        >
          CareerPilot searches job boards, public boards, preprint feeds, a web
          index for scholarships and government-exam notifications — scores all of
          it against your profile, tailors a truthful ATS resume, and either waits
          for your approval or applies for you inside limits you set.
        </motion.p>
        <motion.div
          {...fadeUp}
          transition={{ duration: 0.45, delay: 0.18 }}
          className="mt-10 flex flex-wrap items-center gap-3"
        >
          <Button asChild size="lg" className="h-11 px-6 text-sm">
            <Link to={isAuthenticated ? "/dashboard" : "/auth?returnTo=%2Fonboarding"}>
              {isAuthenticated ? "Open dashboard" : "Start your profile"}
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="h-11 px-6 text-sm">
            <a href="#channels">See what it finds</a>
          </Button>
        </motion.div>

        {/* Score strip */}
        <motion.div
          {...fadeUp}
          transition={{ duration: 0.5, delay: 0.24 }}
          className="mt-16 grid grid-cols-2 gap-px overflow-hidden border border-border bg-border sm:grid-cols-4"
        >
          {[
            ["6", "opportunity sections, kept separate"],
            ["70+", "minimum match score, default"],
            ["≤3", "autopilot applications per day, hard cap"],
            ["0", "invented claims tolerated"],
          ].map(([value, label]) => (
            <div key={label} className="bg-card px-5 py-6">
              <div className="tnum text-2xl font-semibold tracking-tight">{value}</div>
              <div className="mt-1.5 text-xs leading-5 text-muted-foreground">{label}</div>
            </div>
          ))}
        </motion.div>
      </section>

      {/* Channels */}
      <section id="channels" className="border-t border-border bg-muted/40">
        <div className="mx-auto w-full max-w-5xl px-6 py-20">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="micro-label">Discovery</p>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
                Four channels, six sections.
              </h2>
            </div>
            <p className="max-w-sm text-sm leading-6 text-muted-foreground">
              Everything lands in one organised pipeline — and in one Excel
              workbook with a sheet per section, so you can filter, share or
              report without exporting your whole life.
            </p>
          </div>
          <Separator className="mt-8" />
          <div className="mt-10 grid gap-px border border-border bg-border sm:grid-cols-2">
            {CHANNELS.map((c, i) => (
              <motion.div
                key={c.title}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.35, delay: i * 0.05 }}
                className="group bg-card p-6"
              >
                <div className="flex items-center justify-between">
                  <c.icon className="size-4 text-muted-foreground transition-colors group-hover:text-primary" />
                  <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground/70">
                    {c.tag}
                  </span>
                </div>
                <h3 className="mt-5 text-sm font-semibold tracking-tight">{c.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{c.body}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="border-t border-border">
        <div className="mx-auto w-full max-w-5xl px-6 py-20">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="micro-label">The pipeline</p>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
                Six deliberate steps. No shortcuts.
              </h2>
            </div>
            <p className="max-w-sm text-sm leading-6 text-muted-foreground">
              Built for the reality of 2026 recruiting: ATS filters, AI-fatigued
              recruiters, and platforms that punish volume. Quality per
              application beats quantity of applications.
            </p>
          </div>
          <Separator className="mt-8" />
          <div className="mt-10 grid gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
            {STEPS.map((s, i) => (
              <motion.div
                key={s.step}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.35, delay: i * 0.04 }}
                className="group bg-card p-6 transition-colors hover:bg-accent"
              >
                <div className="flex items-center justify-between">
                  <s.icon className="size-4 text-muted-foreground transition-colors group-hover:text-primary" />
                  <span className="tnum text-[11px] font-medium tracking-[0.18em] text-muted-foreground/70">
                    {s.step}
                  </span>
                </div>
                <h3 className="mt-5 text-sm font-semibold tracking-tight">{s.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{s.body}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Policy */}
      <section id="policy" className="border-t border-border bg-muted/40">
        <div className="mx-auto w-full max-w-5xl px-6 py-20">
          <div className="grid gap-12 lg:grid-cols-[1fr_1.4fr]">
            <div>
              <p className="micro-label">Non-negotiables</p>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
                Written policy, enforced in code.
              </h2>
              <p className="mt-4 max-w-md text-sm leading-6 text-muted-foreground">
                Most tools bury their guardrails in marketing copy. CareerPilot's
                guardrails are the product — every one below is a check that runs
                before an action can happen, and the limits are clamped on the
                server so no edit can loosen them.
              </p>
              <div className="mt-8 flex items-center gap-2 text-xs text-muted-foreground">
                <Check className="size-3.5 text-primary" />
                Improvement suggestions on your profile and resume
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <Check className="size-3.5 text-primary" />
                Daily digest of new matches and closing deadlines
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <Check className="size-3.5 text-primary" />
                Full audit trail, including what autopilot did
              </div>
            </div>
            <div className="border border-border">
              {POLICY_ROWS.map(([k, v], i) => (
                <div
                  key={k}
                  className={`grid gap-1 px-5 py-4 sm:grid-cols-[180px_1fr] sm:gap-6 ${i > 0 ? "border-t border-border" : ""}`}
                >
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {k}
                  </div>
                  <div className="text-sm leading-6">{v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border">
        <div className="mx-auto flex w-full max-w-5xl flex-col items-start gap-6 px-6 py-20 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Fill the profile once. Let the pipeline work.
            </h2>
            <p className="mt-3 max-w-lg text-sm leading-6 text-muted-foreground">
              Setup is mandatory and takes about ten minutes — that is the point.
              Resume quality comes from an honest, complete profile, and then you
              review a shortlist every morning.
            </p>
          </div>
          <Button asChild size="lg" className="h-11 shrink-0 px-6 text-sm">
            <Link to={isAuthenticated ? "/dashboard" : "/auth?returnTo=%2Fonboarding"}>
              {isAuthenticated ? "Open dashboard" : "Create free account"}
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-6 py-8 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex size-5 items-center justify-center border border-foreground">
              <div className="size-1.5 bg-primary" />
            </div>
            <span className="text-xs text-muted-foreground">
              CareerPilot — approvals where they matter, bounded autopilot where
              they do not
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-normal text-muted-foreground">
              Public APIs + one search index
            </Badge>
            <Badge variant="outline" className="font-normal text-muted-foreground">
              No anti-detection tooling
            </Badge>
          </div>
        </div>
      </footer>
    </motion.div>
  );
}
