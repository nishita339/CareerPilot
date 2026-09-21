import { motion } from "framer-motion";
import { Link } from "react-router";
import { ArrowRight, Check, FileText, Search, ShieldCheck, Send, Gauge, UserRoundCheck } from "lucide-react";
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
          <a href="#how" className="hidden transition-colors hover:text-foreground sm:block">
            How it works
          </a>
          <a href="#policy" className="hidden transition-colors hover:text-foreground sm:block">
            Policy
          </a>
          {isAuthenticated ? (
            <Button asChild size="sm" className="h-8">
              <Link to="/dashboard">
                Open dashboard
                <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          ) : (
            <Button asChild size="sm" className="h-8">
              <Link to="/auth">
                Sign in
                <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          )}
        </nav>
      </div>
    </header>
  );
}

const STEPS = [
  {
    icon: FileText,
    step: "01",
    title: "Master Profile",
    body: "One source of truth: education, skills with levels, projects, experience, constraints. Every generated claim is checked against it.",
  },
  {
    icon: Search,
    step: "02",
    title: "Public discovery",
    body: "Official, documented APIs first — RemoteOK, Remotive and a demo academic board. Public listings only, no login walls, polite rate limits.",
  },
  {
    icon: Gauge,
    step: "03",
    title: "Deterministic matching",
    body: "A transparent 0–100 score across skills, role fit, experience, location and type — with matched and missing skills spelled out.",
  },
  {
    icon: ShieldCheck,
    step: "04",
    title: "Truthful tailoring",
    body: "The model may reorder, rephrase and emphasize — never invent. A validator rejects any skill, employer or metric that is not in your profile.",
  },
  {
    icon: UserRoundCheck,
    step: "05",
    title: "You approve",
    body: "Nothing is sent on its own. Email applications go out only after you review the resume and press approve. Web forms stay manual by design.",
  },
  {
    icon: Send,
    step: "06",
    title: "Low, slow, targeted",
    body: "A hard daily cap you can lower but not raise past 10. Per-source hygiene, audit trail on every action, one-page ATS-friendly output.",
  },
];

const POLICY_ROWS = [
  ["Discovery sources", "Official public APIs and public boards; robots.txt respected; no login-wall scraping"],
  ["Anti-detection", "None. No fingerprint spoofing, no proxy rotation, no CAPTCHA solving — blocked sites are skipped"],
  ["Resume claims", "Validator-checked against your profile; nothing is fabricated, ever"],
  ["Submission", "Email apply only after your approval; web forms are pre-filled for you to submit yourself"],
  ["Volume", "Default 10/day, minimum match score 70, per-user audit log"],
  ["Your data", "Stays in your account; one click deletes profile, pipeline and history"],
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
        <motion.p
          {...fadeUp}
          transition={{ duration: 0.4 }}
          className="micro-label"
        >
          For students · jobs, internships & research
        </motion.p>
        <motion.h1
          {...fadeUp}
          transition={{ duration: 0.45, delay: 0.05 }}
          className="mt-6 max-w-3xl text-4xl font-semibold leading-[1.08] tracking-tight sm:text-6xl"
        >
          Your job search, on autopilot — with a hand brake.
        </motion.h1>
        <motion.p
          {...fadeUp}
          transition={{ duration: 0.45, delay: 0.12 }}
          className="mt-6 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8"
        >
          CareerPilot finds roles on public boards, scores them against your
          Master Profile, tailors a truthful one-page resume, and prepares the
          application. You review. You approve. It sends.
        </motion.p>
        <motion.div
          {...fadeUp}
          transition={{ duration: 0.45, delay: 0.18 }}
          className="mt-10 flex flex-wrap items-center gap-3"
        >
          <Button asChild size="lg" className="h-11 px-6 text-sm">
            <Link to={isAuthenticated ? "/dashboard" : "/auth"}>
              Start your pipeline
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="h-11 px-6 text-sm">
            <a href="#how">See how it works</a>
          </Button>
        </motion.div>

        {/* Score strip */}
        <motion.div
          {...fadeUp}
          transition={{ duration: 0.5, delay: 0.24 }}
          className="mt-16 grid grid-cols-2 gap-px overflow-hidden border border-border bg-border sm:grid-cols-4"
        >
          {[
            ["70+", "minimum match score, default"],
            ["≤10", "applications per day, hard cap"],
            ["0", "invented claims tolerated"],
            ["1", "human approval required"],
          ].map(([value, label]) => (
            <div key={label} className="bg-card px-5 py-6">
              <div className="tnum text-2xl font-semibold tracking-tight">{value}</div>
              <div className="mt-1.5 text-xs leading-5 text-muted-foreground">{label}</div>
            </div>
          ))}
        </motion.div>
      </section>

      {/* How it works */}
      <section id="how" className="border-t border-border bg-muted/40">
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
      <section id="policy" className="border-t border-border">
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
                before an action can happen.
              </p>
              <div className="mt-8 flex items-center gap-2 text-xs text-muted-foreground">
                <Check className="size-3.5 text-primary" />
                Daily digest of new shortlisted roles
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <Check className="size-3.5 text-primary" />
                Full audit trail of every action taken
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <Check className="size-3.5 text-primary" />
                One-click delete of all your data
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
      <section className="border-t border-border bg-muted/40">
        <div className="mx-auto flex w-full max-w-5xl flex-col items-start gap-6 px-6 py-20 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Fill the profile once. Let the pipeline work.
            </h2>
            <p className="mt-3 max-w-lg text-sm leading-6 text-muted-foreground">
              Resume quality comes from an honest, complete Master Profile. Ten
              minutes of setup, then review a shortlist every morning.
            </p>
          </div>
          <Button asChild size="lg" className="h-11 shrink-0 px-6 text-sm">
            <Link to={isAuthenticated ? "/dashboard" : "/auth"}>
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
              CareerPilot — human-in-the-loop applications
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-normal text-muted-foreground">
              Public APIs only
            </Badge>
            <Badge variant="outline" className="font-normal text-muted-foreground">
              Data stays local
            </Badge>
          </div>
        </div>
      </footer>
    </motion.div>
  );
}
