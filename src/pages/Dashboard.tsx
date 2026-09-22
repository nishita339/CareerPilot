import { useEffect, useMemo, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import {
  Activity,
  Bot,
  Check,
  ClipboardList,
  Copy,
  Download,
  FileDown,
  FileText,
  Inbox,
  Lightbulb,
  Link2,
  Loader2,
  Lock,
  LogOut,
  Mail,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  TriangleAlert,
  UserRoundCog,
  X,
} from "lucide-react";
import { Navigate, useNavigate } from "react-router";
import { asResumeDoc, htmlToPlainText, renderResumeText } from "@/convex/resume";
import { OPPORTUNITY_SECTIONS } from "@/convex/policy";
import {
  buildSuggestions,
  setupStatus,
  type Suggestion,
} from "@/convex/suggestions";
import { isDueWithin } from "@/convex/deadlines";

type Job = Doc<"jobs">;

const STATUS_STYLES: Record<string, string> = {
  New: "border-border text-muted-foreground",
  Shortlisted: "border-foreground/30 text-foreground",
  "Resume Ready": "border-primary/40 text-primary",
  Approved: "border-primary bg-primary/5 text-primary",
  Applied: "border-primary bg-primary text-primary-foreground",
  Interview: "border-foreground bg-foreground text-background",
  Offer: "border-foreground bg-foreground text-background",
  Rejected: "border-border text-muted-foreground/60",
  Skipped: "border-border text-muted-foreground/60",
};

const FILTERS = ["All", "Shortlisted", "Resume Ready", "Approved", "Applied", "New", "Rejected"] as const;

const SEVERITY_STYLES: Record<Suggestion["severity"], string> = {
  high: "border-destructive/40 text-destructive",
  medium: "border-foreground/25 text-foreground",
  low: "border-border text-muted-foreground",
};

function statusBadge(status: string) {
  return (
    <Badge
      variant="outline"
      className={`rounded-none border ${STATUS_STYLES[status] ?? "border-border text-muted-foreground"}`}
    >
      {status}
    </Badge>
  );
}

const APPLIED_STATUSES = ["Applied", "Interview", "Offer"];

/** Has an application for this role already gone out (by us or by hand)? */
function alreadyApplied(status: string): boolean {
  return APPLIED_STATUSES.includes(status);
}

/** The scheduled run fires hourly at :30 — show the chosen hour in local time. */
function localDigestTime(hourUtc: number): string {
  const d = new Date();
  d.setUTCHours(hourUtc, 30, 0, 0);
  return d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

const DIGEST_HOURS = Array.from({ length: 24 }, (_, h) => h);

/** Clipboard with an honest failure message (browsers can block the API). */
async function copyText(text: string, what: string) {
  if (!text.trim()) {
    toast.error(`Nothing to copy for ${what}`);
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied`);
  } catch {
    toast.error("Clipboard blocked — select the text and copy it manually");
  }
}

function scoreColor(score?: number) {
  if (score === undefined || score === null) return "text-muted-foreground";
  if (score >= 80) return "text-foreground";
  if (score >= 65) return "text-foreground/80";
  return "text-muted-foreground";
}

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const profile = useQuery(api.profiles.getProfile);
  const digest = useQuery(api.apply.digest);
  const jobs = useQuery(api.jobs.listJobs, {});
  const activity = useQuery(api.jobs.getActivity, {});
  const collectMut = useAction(api.collect.collect);
  const scoreMut = useMutation(api.jobs.scoreAll);
  const exportExcel = useAction(api.exportXlsx.exportExcel);
  const sendDigest = useAction(api.digest.sendDailyDigest);
  const collectorStatus = useQuery(api.collect.collectorStatus, {});
  const autopilot = useQuery(api.autopilot.autopilotStatus);
  const runAutopilot = useAction(api.autopilot.runAutopilot);
  const armAutopilot = useMutation(api.profiles.setAutopilot);
  const [privacyOpen, setPrivacyOpen] = useState(false);

  const [section, setSection] = useState<string>("all");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<Id<"jobs"> | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(true);

  const sectionTypes = useMemo(
    () =>
      OPPORTUNITY_SECTIONS.find((s) => s.key === section)?.types ??
      OPPORTUNITY_SECTIONS[0].types,
    [section],
  );

  const sectionCounts = useMemo(() => {
    const list = jobs ?? [];
    return Object.fromEntries(
      OPPORTUNITY_SECTIONS.map((s) => [
        s.key,
        list.filter((j) => s.types.includes(j.opportunityType as never)).length,
      ]),
    ) as Record<string, number>;
  }, [jobs]);

  const filtered = useMemo(() => {
    const list = jobs ?? [];
    const q = search.trim().toLowerCase();
    return list
      .filter((j) => sectionTypes.includes(j.opportunityType as never))
      .filter((j) => (filter === "All" ? true : j.status === filter))
      .filter((j) =>
        q
          ? `${j.title} ${j.organization} ${j.location ?? ""}`.toLowerCase().includes(q)
          : true,
      )
      .sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0));
  }, [jobs, filter, search, sectionTypes]);

  const selected = useMemo(
    () => filtered.find((j) => j._id === selectedId) ?? filtered[0] ?? null,
    [filtered, selectedId],
  );

  // Deterministic improvement list — profile gaps, resume quality, recurring
  // skill gaps, deadlines and autopilot advice. No LLM involved.
  const suggestions = useMemo(
    () =>
      profile
        ? buildSuggestions({
            profile,
            jobs: jobs ?? [],
            dueSoon: (jobs ?? []).filter((j) => isDueWithin(j.deadline, 7)).length,
          })
        : [],
    [profile, jobs],
  );

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  if (profile === undefined || jobs === undefined) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  // Mandatory setup: the resume and the profile fields the validator relies on
  // must exist before the pipeline is useful, so send people to finish them.
  if (!profile || !setupStatus(profile).complete) {
    return <Navigate to="/onboarding" replace />;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex size-6 items-center justify-center border border-foreground">
              <div className="size-2 bg-primary" />
            </div>
            <span className="text-sm font-semibold tracking-tight">CareerPilot</span>
          </div>
          <div className="flex items-center gap-2">
            {profile ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 rounded-none gap-2 text-muted-foreground"
                onClick={() => setProfileOpen(true)}
              >
                <UserRoundCog className="size-3.5" />
                Profile
              </Button>
            ) : (
              <Button size="sm" className="h-8 rounded-none" onClick={() => setProfileOpen(true)}>
                <Pencil className="size-3.5" />
                Complete profile
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-8 rounded-none gap-2 text-muted-foreground"
              onClick={() => setPrivacyOpen(true)}
            >
              <Lock className="size-3.5" />
              <span className="hidden sm:inline">Privacy</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 rounded-none text-muted-foreground"
              onClick={handleSignOut}
            >
              <LogOut className="size-3.5" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-6 py-8">
        {/* Digest strip */}
        <div className="grid grid-cols-2 gap-px border border-border bg-border sm:grid-cols-3 lg:grid-cols-5">
          {
            [
              ["Shortlisted", digest?.shortlisted ?? 0],
              ["Resume ready", digest?.resumeReady ?? 0],
              ["Applied today", `${digest?.appliedToday ?? 0}/${digest?.dailyCap ?? 10}`],
              ["Awaiting approval", digest?.awaitingApproval ?? 0],
              ["Auto today", digest?.autoAppliedToday ?? 0],
            ].map(([label, value]) => (
              <div key={String(label)} className="bg-card px-5 py-4">
                <div className="micro-label">{label}</div>
                <div className="tnum mt-2 text-xl font-semibold tracking-tight">{value}</div>
              </div>
            ))
          }
        </div>

        {/* Autopilot + improvement suggestions */}
        <div className="mt-6 grid gap-px border border-border bg-border lg:grid-cols-2">
          <div className="bg-card px-5 py-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-2">
                <Bot className="size-3.5 text-muted-foreground" />
                <span className="micro-label">Autopilot</span>
                {autopilot?.enabled && (
                  <Badge variant="outline" className="rounded-none border-primary/40 text-[10px] uppercase tracking-wide text-primary">
                    armed
                  </Badge>
                )}
              </div>
              <Switch
                checked={autopilot?.enabled ?? false}
                disabled={busy !== null}
                onCheckedChange={async (checked) => {
                  setBusy("autopilotArm");
                  try {
                    await armAutopilot({ enabled: checked });
                    toast.success(
                      checked
                        ? "Autopilot armed — email roles only, above your autopilot score, inside its own daily limit"
                        : "Autopilot disarmed — every application needs your approval again",
                    );
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Could not change autopilot");
                  } finally {
                    setBusy(null);
                  }
                }}
              />
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {autopilot?.enabled
                ? `Emails shortlisted roles scoring ${autopilot.minScore}+ with a verified address and a validator-clean resume, up to ${autopilot.dailyLimit}/day, never twice at the same company inside the cooldown. Web forms are never touched.`
                : "Off. Turn it on to let the daily run email high-scoring roles on your behalf. Everything else — and every web form — still waits for you."}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button
                size="sm"
                variant="outline"
                className="h-8 rounded-none"
                disabled={busy !== null}
                onClick={async () => {
                  setBusy("autopilotRun");
                  try {
                    const r = await runAutopilot({});
                    if (!r.enabled) {
                      toast.warning("Autopilot is not armed — turn it on first");
                    } else {
                      if (r.applied.length > 0)
                        toast.success(
                          `Autopilot sent ${r.applied.length} application${r.applied.length === 1 ? "" : "s"}`,
                        );
                      for (const s of r.needsReview)
                        toast.warning(`${s.organization} needs review: ${s.reason}`);
                      for (const s of r.blocked.slice(0, 2))
                        toast.warning(`${s.organization}: ${s.reason}`);
                      if (r.applied.length === 0 && r.needsReview.length === 0)
                        toast.info("Nothing qualified right now");
                    }
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Autopilot failed");
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                {busy === "autopilotRun" ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Bot className="size-3.5" />
                )}
                Run autopilot now
              </Button>
              <span className="text-xs text-muted-foreground">
                {autopilot?.queued
                  ? `${autopilot.queued} role${autopilot.queued === 1 ? "" : "s"} already clear the autopilot bar`
                  : "No role clears the autopilot bar yet"}
              </span>
            </div>
          </div>

          <div className="bg-card px-5 py-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Lightbulb className="size-3.5 text-muted-foreground" />
                <span className="micro-label">Improve your chances</span>
              </div>
              <button
                className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
                onClick={() => setShowSuggestions((v) => !v)}
              >
                {showSuggestions ? "Hide" : `Show ${suggestions.length}`}
              </button>
            </div>
            {showSuggestions &&
              (suggestions.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  Nothing to fix right now — profile complete, resume has numbers,
                  no validator flags and no deadline inside a week.
                </p>
              ) : (
                <ul className="mt-3 space-y-2.5">
                  {suggestions.slice(0, 5).map((s) => (
                    <li key={s.id} className="border-l-2 border-border pl-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${SEVERITY_STYLES[s.severity]}`}
                        >
                          {s.area}
                        </span>
                        <span className="text-sm font-medium">{s.title}</span>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        {s.detail}
                      </p>
                    </li>
                  ))}
                  {suggestions.length > 5 && (
                    <li className="text-xs text-muted-foreground">
                      +{suggestions.length - 5} more — fix the top ones first.
                    </li>
                  )}
                </ul>
              ))}
          </div>
        </div>

        {/* Sections — jobs, internships, research and the rest stay separate */}
        <div className="mt-6 grid gap-px border border-border bg-border sm:grid-cols-3 lg:grid-cols-6">
          {OPPORTUNITY_SECTIONS.map((s) => {
            const active = section === s.key;
            return (
              <button
                key={s.key}
                onClick={() => {
                  setSection(s.key);
                  setSelectedId(null);
                }}
                className={`flex items-baseline justify-between gap-2 px-4 py-3 text-left transition-colors ${
                  active ? "bg-accent" : "bg-card hover:bg-accent/60"
                }`}
              >
                <span
                  className={`text-sm ${active ? "font-medium" : "text-muted-foreground"}`}
                >
                  {s.label}
                </span>
                <span className="tnum text-xs text-muted-foreground">
                  {sectionCounts[s.key] ?? 0}
                </span>
              </button>
            );
          })}
        </div>

        {/* Controls */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title, org, location"
              className="h-9 w-64 rounded-none pl-8"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-none border px-2.5 py-1 text-xs transition-colors ${
                  filter === f
                    ? "border-foreground bg-foreground text-background"
                    : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 rounded-none"
              disabled={!profile || busy !== null}
              onClick={async () => {
                setBusy("collect");
                try {
                  const r = await collectMut({});
                  if (r.inserted > 0)
                    toast.success(
                      `Collected ${r.inserted} new role${r.inserted === 1 ? "" : "s"} · ${r.deduped} duplicates · ${r.blacklisted} blacklisted`,
                    );
                  else if (r.ran.length === 0)
                    toast.warning(
                      "No collectors are configured — add API keys in the Keys tab, or enable demo mode in your profile",
                    );
                  else
                    toast.info(
                      `Scanned ${r.fetched} listings from ${r.ran.join(", ")} — nothing new`,
                    );
                  for (const e of r.errors) toast.warning(e);
                  for (const s of r.skipped)
                    console.info(`[collector skipped] ${s.name}: ${s.reason}`);
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Collect failed");
                } finally {
                  setBusy(null);
                }
              }}
            >
              {busy === "collect" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
              Collect jobs
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 rounded-none"
              disabled={!profile || busy !== null}
              onClick={async () => {
                setBusy("score");
                try {
                  const r = await scoreMut({});
                  toast.success(`Scored ${r.scored} roles against your profile`);
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Scoring failed");
                } finally {
                  setBusy(null);
                }
              }}
            >
              {busy === "score" ? <Loader2 className="size-3.5 animate-spin" /> : <Activity className="size-3.5" />}
              Re-score
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 rounded-none"
              onClick={() => setAddOpen(true)}
            >
              <Plus className="size-3.5" />
              Add
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 rounded-none"
              disabled={!profile || busy !== null}
              onClick={async () => {
                setBusy("excel");
                try {
                  const r = await exportExcel({});
                  if (r.url) {
                    const a = document.createElement("a");
                    a.href = r.url;
                    a.download = r.filename;
                    a.target = "_blank";
                    a.rel = "noreferrer";
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                  }
                  toast.success(`Exported ${r.rows} rows to ${r.filename}`);
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Export failed");
                } finally {
                  setBusy(null);
                }
              }}
            >
              {busy === "excel" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Download className="size-3.5" />
              )}
              Export to Excel
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 rounded-none"
              disabled={busy !== null}
              onClick={async () => {
                setBusy("digest");
                try {
                  const r = await sendDigest({});
                  if (r.emailed) toast.success("Digest emailed");
                  else if (r.telegram) toast.success("Digest sent to Telegram");
                  else
                    toast.warning(
                      "No digest channel configured — set a profile email, or TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID",
                    );
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Digest failed");
                } finally {
                  setBusy(null);
                }
              }}
            >
              {busy === "digest" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Mail className="size-3.5" />
              )}
              Send digest
            </Button>
          </div>
        </div>

        {/* Collector status */}
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border border-border px-4 py-3">
          <span className="micro-label">Collectors</span>
          {collectorStatus === undefined ? (
            <span className="text-xs text-muted-foreground">checking…</span>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5">
              {collectorStatus.collectors.map((c) => {
                const live = c.configured && c.enabled;
                const title = !c.configured
                  ? `${c.name} — needs ${c.requiresEnv.join(", ")} in the project environment`
                  : c.enabled
                    ? `${c.name} — live for your selected opportunity types`
                    : `${c.name} — skipped: not one of your selected opportunity types`;
                return (
                  <span
                    key={c.name}
                    title={title}
                    className={`inline-flex items-center gap-1.5 border px-2 py-0.5 text-[11px] ${
                      live
                        ? "border-foreground/25 text-foreground"
                        : "border-border text-muted-foreground/70"
                    }`}
                  >
                    <span
                      className={`size-1.5 ${live ? "bg-primary" : "bg-muted-foreground/40"}`}
                    />
                    {c.name}
                  </span>
                );
              })}
              <span className="ml-1 text-[11px] text-muted-foreground">
                {collectorStatus.configuredCount} configured ·{" "}
                {collectorStatus.enabledCount} live
              </span>
              {collectorStatus.demoMode && (
                <span className="inline-flex items-center gap-1.5 border border-primary/40 px-2 py-0.5 text-[11px] text-primary">
                  <span className="size-1.5 bg-primary" />
                  demo mode on
                </span>
              )}
            </div>
          )}
          <span className="ml-auto hidden text-[11px] text-muted-foreground lg:inline">
            Public APIs and public boards only · no login walls · no anti-detection tooling
          </span>
        </div>

        {/* Two-pane workspace */}
        <div className="mt-4 grid gap-6 lg:grid-cols-[420px_1fr]">
          {/* Pipeline list */}
          <div className="border border-border">
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <span className="micro-label">Pipeline</span>
              <span className="tnum text-xs text-muted-foreground">
                {filtered.length} role{filtered.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="max-h-[70vh] overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
                  <Inbox className="size-5 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Nothing in this section yet. Run Collect to search every
                    configured source — job boards, public boards, a web search
                    index, arXiv and Semantic Scholar.
                  </p>
                </div>
              ) : (
                filtered.map((job) => (
                  <button
                    key={job._id}
                    onClick={() => setSelectedId(job._id)}
                    className={`block w-full border-b border-border px-4 py-3.5 text-left transition-colors last:border-b-0 ${
                      selected?._id === job._id ? "bg-accent" : "hover:bg-accent/60"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{job.title}</div>
                        <div className="mt-0.5 truncate text-xs text-muted-foreground">
                          {job.organization} · {job.location ?? "—"}
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          {statusBadge(job.status)}
                          <span className="text-[11px] text-muted-foreground">{job.source}</span>
                        </div>
                      </div>
                      <div className={`tnum shrink-0 text-lg font-semibold ${scoreColor(job.matchScore)}`}>
                        {job.matchScore ?? "—"}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Detail pane */}
          <div className="border border-border">
            {!selected ? (
              <div className="flex h-full min-h-[400px] flex-col items-center justify-center gap-3 px-6 text-center">
                <FileText className="size-5 text-muted-foreground" />
                <p className="max-w-xs text-sm text-muted-foreground">
                  Select a role from the pipeline to see its match explanation,
                  tailored resume and approval controls.
                </p>
              </div>
            ) : (
              <JobDetail job={selected} onBusy={setBusy} />
            )}
          </div>
        </div>

        {/* Activity log */}
        <div className="mt-6 border border-border">
          <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
            <Activity className="size-3.5 text-muted-foreground" />
            <span className="micro-label">Audit trail</span>
          </div>
          <div className="max-h-56 overflow-y-auto">
            {(activity ?? []).length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">
                Every action — scoring, tailoring, approvals, sends — will appear here.
              </p>
            ) : (
              (activity ?? []).map((a) => (
                <div
                  key={a._id}
                  className="flex items-baseline gap-3 border-b border-border px-4 py-2.5 text-sm last:border-b-0"
                >
                  <span className="tnum shrink-0 text-xs text-muted-foreground">
                    {new Date(a.createdAt).toLocaleString([], {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span className="shrink-0 font-medium">{a.action}</span>
                  <span className="truncate text-muted-foreground">{a.detail}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </main>

      <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
      <AddJobDialog open={addOpen} onOpenChange={setAddOpen} />
      <PrivacyDialog open={privacyOpen} onOpenChange={setPrivacyOpen} />
    </div>
  );
}

/* ---------------- Job detail pane ---------------- */

function JobDetail({
  job,
  onBusy,
}: {
  job: Job;
  onBusy: (v: string | null) => void;
}) {
  const scoreAll = useMutation(api.jobs.scoreAll);
  const setStatus = useMutation(api.jobs.setStatus);
  const saveNotes = useMutation(api.jobs.saveNotes);
  const tailor = useAction(api.tailor.tailor);
  const exportPdf = useAction(api.resumePdf.exportResumePdf);
  const applyEmail = useAction(api.apply.applyEmail);
  const reopen = useMutation(api.apply.reopen);
  const markManual = useMutation(api.jobs.markAppliedManually);

  const [notes, setNotes] = useState(job.notes ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [showResume, setShowResume] = useState(true);

  const run = async (key: string, fn: () => Promise<unknown>, done?: string) => {
    setBusy(key);
    onBusy(key);
    try {
      const result = await fn();
      if (done) toast.success(done);
      return result;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
      return undefined;
    } finally {
      setBusy(null);
      onBusy(null);
    }
  };

  const tailorable = ["Shortlisted", "Approved", "Resume Ready"].includes(job.status);
  const canApprove = job.status === "Resume Ready" && job.validationOk;
  const canSend = job.status === "Approved" && job.applyMode === "email";

  return (
    <div>
      <div className="border-b border-border px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold leading-6 tracking-tight">{job.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {job.organization} · {job.location ?? "—"} · {job.source}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {job.autoApplied && (
              <Badge
                variant="outline"
                className="rounded-none border-primary/40 text-[10px] uppercase tracking-wide text-primary"
                title="Approved and emailed by autopilot on your instruction"
              >
                <Bot className="size-3" />
                autopilot
              </Badge>
            )}
            {statusBadge(job.status)}
            <div className={`tnum text-2xl font-semibold ${scoreColor(job.matchScore)}`}>
              {job.matchScore ?? "—"}
              <span className="text-xs font-normal text-muted-foreground">/100</span>
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {job.url.startsWith("http") && (
            <a
              href={job.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              <Link2 className="size-3" />
              Open listing
            </a>
          )}
          <span className="text-xs text-muted-foreground">
            Apply mode: {job.applyMode}
            {job.applyEmail ? ` · ${job.applyEmail}` : ""}
          </span>
        </div>
      </div>

      {/* Match explanation */}
      <div className="border-b border-border px-5 py-4">
        <p className="micro-label">Match explanation</p>
        {job.matchExplanation ? (
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{job.matchExplanation}</p>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            Not scored yet — run Re-score.
          </p>
        )}
        {(job.matchedSkills?.length ?? 0) > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {job.matchedSkills!.slice(0, 10).map((s) => (
              <Badge key={s} variant="outline" className="rounded-none text-xs font-normal">
                <Check className="size-3 text-primary" />
                {s}
              </Badge>
            ))}
          </div>
        )}
        {(job.missingSkills?.length ?? 0) > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {job.missingSkills!.slice(0, 8).map((s) => (
              <Badge key={s} variant="outline" className="rounded-none text-xs font-normal text-muted-foreground">
                <X className="size-3" />
                {s}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-4">
        {tailorable && (
          <Button
            size="sm"
            className="h-8 rounded-none"
            disabled={busy !== null}
            onClick={() =>
              run(
                "tailor",
                () => tailor({ jobId: job._id }),
                "Tailored — review the resume below",
              )
            }
          >
            {busy === "tailor" ? <Loader2 className="size-3.5 animate-spin" /> : <FileText className="size-3.5" />}
            {job.resumeVersion ? "Re-tailor" : "Tailor resume"}
          </Button>
        )}
        {job.status === "Resume Ready" && (
          <Button
            size="sm"
            variant="outline"
            className="h-8 rounded-none"
            disabled={busy !== null}
            onClick={() => run("approve", () => setStatus({ jobId: job._id, status: "Approved" }), "Approved — you can now send")}
          >
            <ShieldCheck className="size-3.5" />
            Approve
          </Button>
        )}
        {canSend && (
          <Button
            size="sm"
            className="h-8 rounded-none"
            disabled={busy !== null}
            onClick={async () => {
              const r = (await run("send", () => applyEmail({ jobId: job._id }))) as
                | {
                    sent: boolean;
                    simulated: boolean;
                    to: string;
                    attachedPdf: string | null;
                    warnings: string[];
                  }
                | undefined;
              if (r?.sent) {
                const attachment = r.attachedPdf ? ` with ${r.attachedPdf}` : "";
                toast.success(
                  r.simulated
                    ? `Simulated send to demo address${attachment} — status set to Applied`
                    : `Application sent to ${r.to}${attachment}`,
                );
                for (const w of r.warnings) toast.warning(w);
              }
            }}
          >
            {busy === "send" ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
            Send application
          </Button>
        )}
        {canApprove && job.applyMode !== "email" && (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <TriangleAlert className="size-3.5" />
            Approve to record your decision, then submit by hand with the kit below
          </span>
        )}
        {alreadyApplied(job.status) && job.applyMode !== "email" && (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Check className="size-3.5 text-primary" />
            Submitted by you — recorded in the audit trail
          </span>
        )}
        {["Rejected", "Skipped", "New", "Resume Ready"].includes(job.status) && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 rounded-none text-muted-foreground"
            disabled={busy !== null}
            onClick={() => run("reopen", () => reopen({ jobId: job._id }), "Back to Shortlisted")}
          >
            <RefreshCw className="size-3.5" />
            Reopen
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto h-8 rounded-none text-muted-foreground"
          disabled={busy !== null}
          onClick={() => run("score1", () => scoreAll({}), undefined)}
        >
          {busy === "score1" ? <Loader2 className="size-3.5 animate-spin" /> : <Activity className="size-3.5" />}
          Re-score all
        </Button>
      </div>

      {/* Application kit — web-form roles only */}
      {job.applyMode !== "email" && (
        <ApplicationKit
          job={job}
          onMarkApplied={() =>
            run("manual", () => markManual({ jobId: job._id }), "Recorded as Applied")
          }
        />
      )}

      {/* Validation banner */}
      {job.validationNotes && (
        <div className="border-b border-border bg-destructive/5 px-5 py-4">
          <div className="flex items-center gap-2">
            <TriangleAlert className="size-3.5 text-destructive" />
            <p className="text-xs font-medium uppercase tracking-wide text-destructive">
              Validator flags — review before approving
            </p>
          </div>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            {job.validationNotes.split("\n").map((n, i) => (
              <li key={i}>· {n}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Tailored documents */}
      {(job.resumeHtml || job.coverLetterHtml) && (
        <div className="border-b border-border">
          <div className="flex items-center justify-between gap-3 px-5 py-3">
            <span className="micro-label">
              Tailored documents {job.resumeVersion ? `· v${job.resumeVersion}` : ""}
            </span>
            <div className="flex items-center gap-3">
              <button
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground disabled:opacity-50"
                disabled={busy !== null}
                onClick={async () => {
                  const r = (await run("pdf", () => exportPdf({ jobId: job._id }))) as
                    | { url: string | null; filename: string; warnings: string[] }
                    | undefined;
                  for (const w of r?.warnings ?? []) toast.warning(w, { duration: 9000 });
                  if (r?.url) {
                    const a = document.createElement("a");
                    a.href = r.url;
                    a.download = r.filename;
                    a.target = "_blank";
                    a.rel = "noreferrer";
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    toast.success(`Generated ${r.filename}`);
                  }
                }}
              >
                {busy === "pdf" ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <FileDown className="size-3" />
                )}
                Download PDF
              </button>
              <button
                className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
                onClick={() => setShowResume((v) => !v)}
              >
                {showResume ? "Hide" : "Show"}
              </button>
            </div>
          </div>
          {showResume && (
            <div className="max-h-[420px] overflow-y-auto px-5 pb-5">
              <div
                className="border border-border bg-white p-6 text-[13px] leading-6 text-black"
                // Resume HTML is generated server-side from profile content and escaped.
                dangerouslySetInnerHTML={{ __html: job.resumeHtml ?? "" }}
              />
              {job.coverLetterHtml && (
                <>
                  <p className="micro-label mt-5">Cover letter</p>
                  <div
                    className="mt-2 border border-border bg-white p-6 text-[13px] leading-6 text-black"
                    dangerouslySetInnerHTML={{ __html: job.coverLetterHtml }}
                  />
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Description */}
      {job.description && (
        <div className="border-b border-border px-5 py-4">
          <p className="micro-label">Listing</p>
          <p className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
            {job.description}
          </p>
        </div>
      )}

      {/* Notes */}
      <div className="px-5 py-4">
        <p className="micro-label">Your notes</p>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Follow-ups, referral names, deadlines…"
          className="mt-2 min-h-20 rounded-none"
        />
        <Button
          size="sm"
          variant="outline"
          className="mt-2 h-8 rounded-none"
          disabled={busy !== null || notes === (job.notes ?? "")}
          onClick={() => run("notes", () => saveNotes({ jobId: job._id, notes }), "Notes saved")}
        >
          Save notes
        </Button>
      </div>
    </div>
  );
}

/* ---------------- Application kit (web-form roles) ---------------- */

/**
 * Copy-and-paste helpers for roles applied to on the employer's own site.
 * There is deliberately no browser automation here: the app hands you the
 * fields, the cover letter and the ATS PDF, and you press Submit yourself.
 */
function ApplicationKit({
  job,
  onMarkApplied,
}: {
  job: Job;
  onMarkApplied: () => Promise<unknown>;
}) {
  const profile = useQuery(api.profiles.getProfile);
  const exportPdf = useAction(api.resumePdf.exportResumePdf);
  const undoManual = useMutation(api.jobs.undoManualApply);
  const [busy, setBusy] = useState<string | null>(null);

  const doc = asResumeDoc(job.resumeData);
  const resumeText = doc
    ? renderResumeText(doc)
    : htmlToPlainText(job.resumeHtml ?? "");
  const coverLetter = htmlToPlainText(job.coverLetterHtml ?? "");

  const fields: [string, string][] = profile
    ? [
        ["Full name", profile.fullName],
        ["Email", profile.email],
        ["Phone", profile.phone],
        ["Location", profile.location],
        ["Links", profile.links ?? ""],
        [
          "Education",
          `${profile.major}, ${profile.university} (${profile.graduationYear})${profile.gpa ? ` · GPA ${profile.gpa}` : ""}`,
        ],
        ["Skills", (profile.skills ?? []).join(", ")],
      ]
    : [];

  const downloadPdf = async () => {
    setBusy("pdf");
    try {
      const r = await exportPdf({ jobId: job._id });
      for (const w of r.warnings) toast.warning(w, { duration: 9000 });
      if (r.url) {
        const a = document.createElement("a");
        a.href = r.url;
        a.download = r.filename;
        a.target = "_blank";
        a.rel = "noreferrer";
        document.body.appendChild(a);
        a.click();
        a.remove();
        toast.success(`Generated ${r.filename}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "PDF export failed");
    } finally {
      setBusy(null);
    }
  };

  const copyAll = () =>
    copyText(
      [
        `Application — ${job.title} at ${job.organization}`,
        "",
        ...fields.map(([label, value]) => `${label}: ${value}`),
        ...(coverLetter ? ["", "Cover letter:", coverLetter] : []),
      ].join("\n"),
      "Application kit",
    );

  const appliedAlready = alreadyApplied(job.status);
  // Hand-recorded applications carry the status they came from; only those can
  // be taken back, and only while they are still in Applied.
  const undoable = job.status === "Applied" && Boolean(job.preApplyStatus);

  return (
    <div className="border-b border-border px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ClipboardList className="size-3.5 text-muted-foreground" />
          <span className="micro-label">Application kit — you submit this one</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground disabled:opacity-50"
            disabled={busy !== null || !job.resumeData}
            title={
              job.resumeData
                ? "Download the ATS PDF to upload"
                : "Tailor the resume first — there is no PDF yet"
            }
            onClick={downloadPdf}
          >
            {busy === "pdf" ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <FileDown className="size-3" />
            )}
            Download PDF
          </button>
          <button
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
            onClick={copyAll}
          >
            <Copy className="size-3" />
            Copy all fields
          </button>
        </div>
      </div>

      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        Paste these into the employer&apos;s form, upload the PDF and press
        Submit yourself. CareerPilot never fills or submits web forms, and never
        signs into a listing site.
      </p>

      {fields.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Complete your Master Profile to fill this kit.
        </p>
      ) : (
        <div className="mt-3 border border-border">
          {fields.map(([label, value]) => (
            <div
              key={label}
              className="flex items-center gap-3 border-b border-border px-3 py-2 last:border-b-0"
            >
              <span className="w-24 shrink-0 text-[11px] uppercase tracking-wide text-muted-foreground">
                {label}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm">{value || "—"}</span>
              <button
                title={`Copy ${label}`}
                className="shrink-0 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                disabled={!value}
                onClick={() => copyText(value, label)}
              >
                <Copy className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {coverLetter && (
        <div className="mt-4">
          <div className="flex items-center justify-between gap-3">
            <span className="micro-label">Cover letter (plain text)</span>
            <button
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
              onClick={() => copyText(coverLetter, "Cover letter")}
            >
              <Copy className="size-3" />
              Copy
            </button>
          </div>
          <pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap border border-border px-3 py-2 text-[12.5px] leading-5 text-muted-foreground">
            {coverLetter}
          </pre>
        </div>
      )}

      {resumeText && (
        <div className="mt-4">
          <div className="flex items-center justify-between gap-3">
            <span className="micro-label">Resume (plain text)</span>
            <button
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
              onClick={() => copyText(resumeText, "Resume text")}
            >
              <Copy className="size-3" />
              Copy
            </button>
          </div>
          <pre className="mt-2 max-h-56 overflow-y-auto whitespace-pre-wrap border border-border px-3 py-2 text-[12.5px] leading-5 text-muted-foreground">
            {resumeText}
          </pre>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {undoable ? (
          <>
            <Button
              size="sm"
              variant="outline"
              className="h-8 rounded-none"
              disabled={busy !== null}
              onClick={async () => {
                if (
                  !confirm(
                    "Undo this application? It will stop counting against today's cap and the company cooldown will be lifted.",
                  )
                )
                  return;
                setBusy("undo");
                try {
                  await undoManual({ jobId: job._id });
                  toast.success(`Undone — back to “${job.preApplyStatus}”`);
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Undo failed");
                } finally {
                  setBusy(null);
                }
              }}
            >
              {busy === "undo" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
              Undo — I didn&apos;t submit this
            </Button>
            <span className="text-xs leading-5 text-muted-foreground">
              Recorded by hand, so it can be taken back. Email sends this app
              made cannot be undone — those really were delivered.
            </span>
          </>
        ) : (
          <>
            <Button
              size="sm"
              variant="outline"
              className="h-8 rounded-none"
              disabled={busy !== null || appliedAlready}
              onClick={async () => {
                setBusy("manual");
                try {
                  await onMarkApplied();
                } finally {
                  setBusy(null);
                }
              }}
            >
              {busy === "manual" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Check className="size-3.5" />
              )}
              I submitted this myself
            </Button>
            <span className="text-xs leading-5 text-muted-foreground">
              {appliedAlready
                ? `Already recorded as ${job.status}.`
                : "Recording it keeps the daily cap and the company cooldown honest — and it counts against today's cap, so undo is available if you mis-click. Approve first if you want your decision in the audit trail."}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------------- Profile dialog ---------------- */

function ProfileDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const profile = useQuery(api.profiles.getProfile);
  const save = useMutation(api.profiles.saveProfile);
  const deleteAll = useMutation(api.profiles.deleteAllMyData);
  const { signOut, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState<Record<string, string>>({});
  const [openRemote, setOpenRemote] = useState(true);
  const [demoMode, setDemoMode] = useState(false);
  const [minScore, setMinScore] = useState(70);
  const [dailyCap, setDailyCap] = useState(10);
  const [cooldownDays, setCooldownDays] = useState(7);
  const [digestHour, setDigestHour] = useState(6);
  const [types, setTypes] = useState<string[]>(["job", "internship", "research"]);
  const [saving, setSaving] = useState(false);

  // Seed form state when the dialog opens (profile arrives async).
  const seededRef = useRef({ forProfile: null as Doc<"profiles"> | null });
  useEffect(() => {
    if (!open || !profile || seededRef.current.forProfile === profile) return;
    seededRef.current.forProfile = profile;
    setForm({
      fullName: profile.fullName ?? "",
      headline: profile.headline ?? "",
      email: profile.email ?? "",
      phone: profile.phone ?? "",
      location: profile.location ?? "",
      links: profile.links ?? "",
      major: profile.major ?? "",
      university: profile.university ?? "",
      graduationYear: profile.graduationYear ?? "",
      gpa: profile.gpa ?? "",
      relevantCoursework: profile.relevantCoursework ?? "",
      skills: (profile.skills ?? []).join(", "),
      experience: profile.experience ?? "",
      projects: profile.projects ?? "",
      certifications: profile.certifications ?? "",
      masterResumeText: profile.masterResumeText ?? "",
      country: profile.country ?? "",
      targetRoles: profile.targetRoles.join(", "),
      locations: profile.locations ?? "",
      blacklistCompanies: profile.blacklistCompanies ?? "",
    });
    setOpenRemote(profile.openToRemote);
    setDemoMode(profile.demoMode === true);
    setMinScore(profile.minMatchScore);
    setDailyCap(profile.maxApplicationsPerDay);
    setCooldownDays(profile.cooldownDays ?? 7);
    setDigestHour(profile.digestHourUtc ?? 6);
    setTypes(profile.opportunityTypes.length ? profile.opportunityTypes : ["job", "internship", "research"]);
  }, [open, profile]);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const saveProfile = async () => {
    setSaving(true);
    try {
      await save({
        fullName: form.fullName ?? "",
        headline: form.headline ?? "",
        email: form.email ?? "",
        phone: form.phone ?? "",
        location: form.location ?? "",
        links: form.links || undefined,
        major: form.major ?? "",
        university: form.university ?? "",
        graduationYear: form.graduationYear ?? "",
        gpa: form.gpa || undefined,
        relevantCoursework: form.relevantCoursework || undefined,
        skills: (form.skills ?? "").split(/[,;\n]/).map((s) => s.trim()).filter(Boolean),
        experience: form.experience || undefined,
        projects: form.projects || undefined,
        certifications: form.certifications || undefined,
        masterResumeText: form.masterResumeText || undefined,
        country: form.country || undefined,
        targetRoles: (form.targetRoles ?? "").split(/[,;\n]/).map((s) => s.trim()).filter(Boolean),
        opportunityTypes: types,
        locations: form.locations || undefined,
        openToRemote: openRemote,
        minMatchScore: minScore,
        maxApplicationsPerDay: dailyCap,
        blacklistCompanies: form.blacklistCompanies || undefined,
        demoMode,
        cooldownDays,
        digestHourUtc: digestHour,      });
      toast.success("Profile saved — the pipeline will re-score on next run");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const TYPE_OPTIONS = [
    ["job", "Jobs"],
    ["internship", "Internships"],
    ["research", "Research"],
    ["fellowship", "Fellowships"],
  ] as const;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto rounded-none p-0">
        <DialogHeader className="border-b border-border px-6 py-4">
          <p className="micro-label">Master profile</p>
          <DialogTitle className="text-base font-semibold tracking-tight">
            The single source of truth for every generated claim
          </DialogTitle>
          <DialogDescription className="text-sm leading-6">
            Be honest and specific — the validator compares the tailored resume
            against exactly what you write here.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 px-6 py-5 sm:grid-cols-2">
          <Field label="Full name"><Input className="rounded-none" value={form.fullName ?? ""} onChange={set("fullName")} /></Field>
          <Field label="Headline"><Input className="rounded-none" placeholder="e.g. CS junior — data & backend" value={form.headline ?? ""} onChange={set("headline")} /></Field>
          <Field label="Email"><Input className="rounded-none" type="email" value={form.email ?? ""} onChange={set("email")} /></Field>
          <Field label="Phone"><Input className="rounded-none" value={form.phone ?? ""} onChange={set("phone")} /></Field>
          <Field label="Current location"><Input className="rounded-none" placeholder="City, Country" value={form.location ?? ""} onChange={set("location")} /></Field>
          <Field label="Links (LinkedIn, GitHub)"><Input className="rounded-none" value={form.links ?? ""} onChange={set("links")} /></Field>
          <Field label="Major"><Input className="rounded-none" value={form.major ?? ""} onChange={set("major")} /></Field>
          <Field label="University"><Input className="rounded-none" value={form.university ?? ""} onChange={set("university")} /></Field>
          <Field label="Graduation year"><Input className="rounded-none" value={form.graduationYear ?? ""} onChange={set("graduationYear")} /></Field>
          <Field label="GPA (optional)"><Input className="rounded-none" value={form.gpa ?? ""} onChange={set("gpa")} /></Field>
          <Field label="Skills (comma-separated)" full>
            <Textarea className="min-h-16 rounded-none" placeholder="Python, SQL, React, PyTorch…" value={form.skills ?? ""} onChange={set("skills")} />
          </Field>
          <Field label="Relevant coursework (optional)" full>
            <Input className="rounded-none" placeholder="Databases, Machine Learning, Operating Systems" value={form.relevantCoursework ?? ""} onChange={set("relevantCoursework")} />
          </Field>
          <Field label="Experience (one bullet per line)" full>
            <Textarea className="min-h-24 rounded-none" placeholder={"Data Science Intern at Acme — built ETL in Python and SQL\nTA for CS201 — ran weekly Python labs"} value={form.experience ?? ""} onChange={set("experience")} />
          </Field>
          <Field label="Projects (one per line)" full>
            <Textarea className="min-h-24 rounded-none" placeholder={"Transit-delay analysis in Pandas on 50k rows\nRealtime chat app in TypeScript and WebSockets"} value={form.projects ?? ""} onChange={set("projects")} />
          </Field>
          <Field label="Certifications (optional)" full>
            <Input className="rounded-none" placeholder="AWS Cloud Practitioner…" value={form.certifications ?? ""} onChange={set("certifications")} />
          </Field>
          <Field label="Country">
            <Input className="rounded-none" value={form.country ?? ""} onChange={set("country")} />
            <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
              Targets scholarship and government-exam searches.
            </p>
          </Field>
          <Field label="Resume text" full>
            <Textarea
              className="min-h-40 rounded-none font-mono text-[12.5px]"
              value={form.masterResumeText ?? ""}
              onChange={set("masterResumeText")}
            />
            <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
              Your own resume. The tailoring engine may only draw facts from this
              plus the fields above — paste it, or upload the file from Setup.
            </p>
          </Field>
        </div>

        <Separator />
        <div className="grid gap-5 px-6 py-5 sm:grid-cols-2">
          <Field label="Target roles (comma-separated)" full>
            <Input className="rounded-none" placeholder="Software Engineer Intern, Data Analyst, Research Assistant" value={form.targetRoles ?? ""} onChange={set("targetRoles")} />
          </Field>
          <Field label="Preferred locations (comma-separated)">
            <Input className="rounded-none" placeholder="Berlin, Amsterdam" value={form.locations ?? ""} onChange={set("locations")} />
          </Field>
          <Field label="Companies to skip">
            <Input className="rounded-none" placeholder="e.g. Palantir, MangoLabs" value={form.blacklistCompanies ?? ""} onChange={set("blacklistCompanies")} />
          </Field>
          <Field label="Opportunity types" full>
            <div className="flex flex-wrap gap-1.5">
              {TYPE_OPTIONS.map(([value, label]) => (
                <button
                  key={value}
                  onClick={() =>
                    setTypes((t) => (t.includes(value) ? t.filter((x) => x !== value) : [...t, value]))
                  }
                  className={`rounded-none border px-2.5 py-1 text-xs transition-colors ${
                    types.includes(value)
                      ? "border-foreground bg-foreground text-background"
                      : "border-border text-muted-foreground hover:border-foreground/40"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Open to remote">
            <div className="flex h-9 items-center gap-2">
              <Switch checked={openRemote} onCheckedChange={setOpenRemote} />
              <span className="text-sm text-muted-foreground">{openRemote ? "Yes" : "On-site only"}</span>
            </div>
          </Field>
          <div />
          <Field label={`Minimum match score — ${minScore}`} full>
            <Slider value={[minScore]} min={50} max={100} step={5} onValueChange={(v) => setMinScore(v[0])} />
            <p className="mt-1.5 text-xs text-muted-foreground">Roles below this score are auto-rejected before you ever see them.</p>
          </Field>
          <Field label={`Daily application cap — ${dailyCap} (hard limit 10)`} full>
            <Slider value={[dailyCap]} min={1} max={10} step={1} onValueChange={(v) => setDailyCap(v[0])} />
          </Field>
          <Field label={`Per-company cooldown — ${cooldownDays} days (minimum 3)`} full>
            <Slider value={[cooldownDays]} min={3} max={90} step={1} onValueChange={(v) => setCooldownDays(v[0])} />
            <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
              After you send an application to an organization, further sends to
              the same employer are blocked for this many days — even across
              different roles. Company name variants such as “Acme Inc” and
              “ACME” count as the same employer. Only applications recorded here
              count; applies you made elsewhere are not visible to the app.
            </p>
          </Field>
          <Field
            label={`Daily run — ${String(digestHour).padStart(2, "0")}:30 UTC (your time: ${localDigestTime(digestHour)})`}
            full
          >
            <select
              value={digestHour}
              onChange={(e) => setDigestHour(Number(e.target.value))}
              className="h-9 w-full rounded-none border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring"
            >
              {DIGEST_HOURS.map((h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, "0")}:30 UTC · {localDigestTime(h)}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
              When the daily collect + score + digest pass runs for you. The
              scheduler ticks every hour at :30 and only acts on your chosen
              hour, so nothing else changes. Times are shown in your browser's
              timezone — the value stored is UTC. A digest sent in the previous
              20 hours skips the next scheduled pass, so changing this time
              right after a manual send takes effect the following day.
            </p>
          </Field>
          <Field label="Demo mode" full>
            <div className="flex items-start gap-3">
              <Switch checked={demoMode} onCheckedChange={setDemoMode} />
              <span className="text-sm leading-6 text-muted-foreground">
                Include five labeled sample listings so you can explore the
                pipeline before adding collector API keys. Demo applies are
                simulated and never reach a real inbox. Off by default.
              </span>
            </div>
          </Field>
        </div>

        <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-border bg-background px-6 py-4">
          <span className="text-xs text-muted-foreground">
            Score floor is clamped to ≥ 50. Caps can be lowered, never raised past 10.
          </span>
          <Button className="rounded-none" onClick={saveProfile} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            Save profile
          </Button>
        </div>

        <div className="border-t border-border px-6 py-4">
          <button
            className="text-xs text-muted-foreground underline underline-offset-4 hover:text-destructive"
            onClick={async () => {
              if (!confirm("Delete profile, pipeline and history? This cannot be undone.")) return;
              await deleteAll({});
              await signOut();
              navigate("/");
            }}
            disabled={!isAuthenticated}
          >
            Delete all my data
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Privacy dialog ---------------- */

const PRIVACY_ROWS: [string, string][] = [
  [
    "Account",
    "The email address you signed in with, plus the sign-in session. Nothing else is collected about you.",
  ],
  [
    "Master Profile",
    "Name, headline, contact details, education, skills, experience, projects, certifications, target roles, locations, score floor, daily cap, blacklist and the demo-mode flag. This is the only source the tailoring engine may draw from.",
  ],
  [
    "Listings & scores",
    "Every role the collectors returned: source, organization, title, location, public URL, the listing description text, extracted skills, match score, matched/missing skills and the explanation.",
  ],
  [
    "Documents",
    "The tailored resume (structured data + HTML) and cover letter for roles you chose to tailor, plus the validator notes for each one.",
  ],
  [
    "Audit trail",
    "One row per action — scoring, tailoring, approvals, sends, exports, digests — with a timestamp and, for applications, the organization. This is what enforces the daily cap and the company cooldown.",
  ],
  [
    "Never stored",
    "No platform logins, no cookies from job boards, no payment data, no browsing history, no fingerprinting. No scraping of sites behind a login wall, and no anti-detection tooling exists in this app.",
  ],
  [
    "Web forms",
    "For roles you apply to on the employer's site, the app only shows you a copy-paste kit and a PDF. It never fills, submits or automates those forms for you.",
  ],
  [
    "PDF encoding",
    "The generated PDF uses Latin-only standard fonts. Characters outside that set are folded or replaced with '?' and reported to you, so nothing fails silently.",
  ],
  [
    "Where it lives",
    "In your Convex deployment's database and file storage, tied to your account. Exports (xlsx / pdf) are stored as temporary files in that same deployment's storage.",
  ],
  [
    "Third parties that see data",
    "The LLM gateway (your profile + the job description you tailor for), the email gateway (your digest and approved applications only), and the public job APIs you query with your target role titles. Collector API keys live in the deployment environment, never in the database or the browser.",
  ],
  [
    "How to delete it",
    "Profile dialog → 'Delete all my data' removes the profile, every listing, every tailored document and the whole audit trail. Deleting your sign-in removes the account row. There is no soft-delete or backup copy kept by the app.",
  ],
];

function PrivacyDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto rounded-none p-0">
        <DialogHeader className="border-b border-border px-6 py-4">
          <p className="micro-label">Privacy</p>
          <DialogTitle className="text-base font-semibold tracking-tight">
            Exactly what is stored, and how to remove it
          </DialogTitle>
          <DialogDescription className="text-sm leading-6">
            No hidden telemetry. This is the complete list of data this app
            keeps about you.
          </DialogDescription>
        </DialogHeader>
        <div className="border-b border-border">
          {PRIVACY_ROWS.map(([k, v], i) => (
            <div
              key={k}
              className={`grid gap-1 px-6 py-4 sm:grid-cols-[170px_1fr] sm:gap-6 ${i > 0 ? "border-t border-border" : ""}`}
            >
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {k}
              </div>
              <div className="text-sm leading-6">{v}</div>
            </div>
          ))}
        </div>
        <div className="px-6 py-4 text-xs leading-5 text-muted-foreground">
          Deletion is immediate and complete — open Profile → “Delete all my
          data”. Reviewer note: scheduled daily runs only ever read your own
          account and email your own address.
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

/* ---------------- Add job dialog ---------------- */

function AddJobDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const add = useMutation(api.jobs.addManualJob);
  const [form, setForm] = useState({
    title: "",
    organization: "",
    url: "",
    location: "",
    description: "",
    applyEmail: "",
    deadline: "",
  });
  const [type, setType] = useState("job");
  const [saving, setSaving] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-none p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle className="text-base font-semibold tracking-tight">Add a role manually</DialogTitle>
          <DialogDescription className="text-sm leading-6">
            Found something yourself? Put it through the same pipeline.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 px-6 py-5">
          <Field label="Title"><Input className="rounded-none" value={form.title} onChange={set("title")} /></Field>
          <Field label="Organization"><Input className="rounded-none" value={form.organization} onChange={set("organization")} /></Field>
          <Field label="Listing URL (optional)"><Input className="rounded-none" value={form.url} onChange={set("url")} /></Field>
          <Field label="Location (optional)"><Input className="rounded-none" value={form.location} onChange={set("location")} /></Field>
          <Field label="Type">
            <div className="flex gap-1.5">
              {["job", "internship", "research", "fellowship"].map((t) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={`rounded-none border px-2.5 py-1 text-xs capitalize transition-colors ${
                    type === t
                      ? "border-foreground bg-foreground text-background"
                      : "border-border text-muted-foreground hover:border-foreground/40"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Apply email (optional — enables email apply)">
            <Input className="rounded-none" type="email" value={form.applyEmail} onChange={set("applyEmail")} />
          </Field>
          <Field label="Deadline (optional)">
            <Input className="rounded-none" placeholder="2026-10-15 or Rolling" value={form.deadline} onChange={set("deadline")} />
          </Field>
          <Field label="Description (optional)">
            <Textarea className="min-h-24 rounded-none" value={form.description} onChange={set("description")} />
          </Field>
        </div>
        <div className="flex items-center justify-end border-t border-border px-6 py-4">
          <Button
            className="rounded-none"
            disabled={saving || !form.title.trim() || !form.organization.trim()}
            onClick={async () => {
              setSaving(true);
              try {
                await add({
                  ...form,
                  url: form.url || undefined,
                  location: form.location || undefined,
                  applyEmail: form.applyEmail || undefined,
                  deadline: form.deadline || undefined,
                  description: form.description || undefined,
                  opportunityType: type,
                });
                toast.success("Added to pipeline");
                setForm({
                  title: "",
                  organization: "",
                  url: "",
                  location: "",
                  description: "",
                  applyEmail: "",
                  deadline: "",
                });
                onOpenChange(false);
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Add failed");
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Add to pipeline
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
