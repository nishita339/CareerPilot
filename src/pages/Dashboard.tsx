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
  Check,
  FileText,
  Inbox,
  Link2,
  Loader2,
  LogOut,
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
import { useNavigate } from "react-router";

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

  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<Id<"jobs"> | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const list = jobs ?? [];
    const q = search.trim().toLowerCase();
    return list
      .filter((j) => (filter === "All" ? true : j.status === filter))
      .filter((j) =>
        q
          ? `${j.title} ${j.organization} ${j.location ?? ""}`.toLowerCase().includes(q)
          : true,
      )
      .sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0));
  }, [jobs, filter, search]);

  const selected = useMemo(
    () => filtered.find((j) => j._id === selectedId) ?? filtered[0] ?? null,
    [filtered, selectedId],
  );

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  if (jobs === undefined) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </main>
    );
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
        <div className="grid grid-cols-2 gap-px border border-border bg-border sm:grid-cols-4">
          {[
            ["Shortlisted", digest?.shortlisted ?? 0],
            ["Resume ready", digest?.resumeReady ?? 0],
            ["Applied today", `${digest?.appliedToday ?? 0}/${digest?.dailyCap ?? 10}`],
            ["Awaiting approval", digest?.awaitingApproval ?? 0],
          ].map(([label, value]) => (
            <div key={String(label)} className="bg-card px-5 py-4">
              <div className="micro-label">{label}</div>
              <div className="tnum mt-2 text-xl font-semibold tracking-tight">{value}</div>
            </div>
          ))}
        </div>

        {!profile && (
          <Card className="mt-6 rounded-none border-border shadow-none">
            <CardHeader>
              <CardTitle className="text-base">Start with your Master Profile</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm leading-6 text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <span className="max-w-xl">
                Resume quality comes from an honest, complete profile — it is the
                only source the tailoring engine may use, and the validator checks
                every claim against it.
              </span>
              <Button className="rounded-none self-start" onClick={() => setProfileOpen(true)}>
                Fill it now
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Controls */}
        <div className="mt-6 flex flex-wrap items-center gap-3">
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
                      `Collected ${r.inserted} new roles (${r.deduped} duplicates skipped)`,
                    );
                  else
                    toast.info("No new roles — everything was already in your pipeline");
                  for (const e of r.errors) toast.warning(e);
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
          </div>
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
                    Nothing here yet. Complete your profile, then collect jobs.
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
  const applyEmail = useAction(api.apply.applyEmail);
  const reopen = useMutation(api.apply.reopen);

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
                | { sent: boolean; simulated: boolean; to: string }
                | undefined;
              if (r?.sent) {
                toast.success(
                  r.simulated
                    ? "Simulated send to demo address — status set to Applied"
                    : `Application sent to ${r.to}`,
                );
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
            Manual apply — open the listing and submit yourself
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
          <div className="flex items-center justify-between px-5 py-3">
            <span className="micro-label">
              Tailored documents {job.resumeVersion ? `· v${job.resumeVersion}` : ""}
            </span>
            <button
              className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
              onClick={() => setShowResume((v) => !v)}
            >
              {showResume ? "Hide" : "Show"}
            </button>
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
  const [minScore, setMinScore] = useState(70);
  const [dailyCap, setDailyCap] = useState(10);
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
      targetRoles: profile.targetRoles.join(", "),
      locations: profile.locations ?? "",
      blacklistCompanies: profile.blacklistCompanies ?? "",
    });
    setOpenRemote(profile.openToRemote);
    setMinScore(profile.minMatchScore);
    setDailyCap(profile.maxApplicationsPerDay);
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
        targetRoles: (form.targetRoles ?? "").split(/[,;\n]/).map((s) => s.trim()).filter(Boolean),
        opportunityTypes: types,
        locations: form.locations || undefined,
        openToRemote: openRemote,
        minMatchScore: minScore,
        maxApplicationsPerDay: dailyCap,
        blacklistCompanies: form.blacklistCompanies || undefined,
      });
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
  const [form, setForm] = useState({ title: "", organization: "", url: "", location: "", description: "", applyEmail: "" });
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
                await add({ ...form, url: form.url || undefined, location: form.location || undefined, applyEmail: form.applyEmail || undefined, description: form.description || undefined, opportunityType: type });
                toast.success("Added to pipeline");
                setForm({ title: "", organization: "", url: "", location: "", description: "", applyEmail: "" });
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
