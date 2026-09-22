import { useEffect, useMemo, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/use-auth";
import { Navigate, useNavigate } from "react-router";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileUp,
  Loader2,
  LogOut,
  TriangleAlert,
} from "lucide-react";
import { setupStatus, REQUIRED_FIELDS } from "@/convex/suggestions";
import { clampAutoApplyDailyLimit, clampAutoApplyMinScore } from "@/convex/autopilotRules";

type FormState = Record<string, string>;

const TYPE_OPTIONS: [string, string, string][] = [
  ["job", "Jobs", "Full-time and contract roles"],
  ["internship", "Internships", "Summer and part-time internships"],
  ["research", "Research", "Research assistant roles and papers worth emailing"],
  ["fellowship", "Fellowships", "Stipended fellowship programmes"],
  ["scholarship", "Scholarships", "Merit and need-based awards"],
  ["govt-exam", "Government exams", "Public-sector exam notifications"],
];

/** Fields each step must satisfy before you can move on. */
const STEPS: { key: string; title: string; blurb: string; required: string[] }[] = [
  {
    key: "identity",
    title: "About you",
    blurb: "These appear at the top of every resume and on every application.",
    required: ["fullName", "email", "phone", "location"],
  },
  {
    key: "study",
    title: "Study and skills",
    blurb:
      "The honest evidence base. The validator checks every generated claim against exactly this.",
    required: ["major", "university", "graduationYear", "skills"],
  },
  {
    key: "evidence",
    title: "Experience and projects",
    blurb:
      "One line per item. Add numbers where you have them — the resumes are built from these lines.",
    required: [],
  },
  {
    key: "resume",
    title: "Your resume",
    blurb:
      "Required: upload your current resume or paste its text. Tailoring reorders and rephrases this material — it never invents.",
    required: ["masterResumeText"],
  },
  {
    key: "targets",
    title: "What to look for",
    blurb: "Which sections to fill, and how much the app is allowed to do on its own.",
    required: ["targetRoles", "opportunityTypes"],
  },
];

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label className="text-xs font-medium text-muted-foreground">
        {label}
        {required ? <span className="text-primary"> *</span> : null}
      </Label>
      <div className="mt-1.5">{children}</div>
      {hint ? (
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export default function Onboarding() {
  const { isAuthenticated, isLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const profile = useQuery(api.profiles.getProfile);
  const save = useMutation(api.profiles.saveProfile);
  const upload = useAction(api.resumeUpload.uploadResume);

  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>({});
  const [types, setTypes] = useState<string[]>(["job", "internship", "research"]);
  const [openRemote, setOpenRemote] = useState(true);
  const [minScore, setMinScore] = useState(70);
  const [dailyCap, setDailyCap] = useState(10);
  const [autoApply, setAutoApply] = useState(false);
  const [autoScore, setAutoScore] = useState(85);
  const [autoLimit, setAutoLimit] = useState(2);
  const [demoMode, setDemoMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [extract, setExtract] = useState<{ message: string; ok: boolean } | null>(null);
  const seeded = useRef(false);

  // Seed once from any profile that already exists (re-onboarding after edits).
  useEffect(() => {
    if (seeded.current || !profile) return;
    seeded.current = true;
    setForm({
      fullName: profile.fullName ?? "",
      headline: profile.headline ?? "",
      email: profile.email ?? "",
      phone: profile.phone ?? "",
      location: profile.location ?? "",
      country: profile.country ?? "",
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
      targetRoles: profile.targetRoles.join(", "),
      locations: profile.locations ?? "",
      blacklistCompanies: profile.blacklistCompanies ?? "",
    });
    if (profile.opportunityTypes.length) setTypes(profile.opportunityTypes);
    setOpenRemote(profile.openToRemote);
    setMinScore(profile.minMatchScore);
    setDailyCap(profile.maxApplicationsPerDay);
    setDemoMode(profile.demoMode === true);
    setAutoApply(profile.autoApplyEnabled === true);
    setAutoScore(profile.autoApplyMinScore ?? 85);
    setAutoLimit(profile.autoApplyDailyLimit ?? 2);
  }, [profile]);

  const set = (k: string) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const profileLike = useMemo(
    () => ({
      fullName: form.fullName ?? "",
      email: form.email ?? "",
      phone: form.phone ?? "",
      location: form.location ?? "",
      major: form.major ?? "",
      university: form.university ?? "",
      graduationYear: form.graduationYear ?? "",
      skills: (form.skills ?? "").split(/[,;\n]/).map((s) => s.trim()).filter(Boolean),
      targetRoles: (form.targetRoles ?? "").split(/[,;\n]/).map((s) => s.trim()).filter(Boolean),
      opportunityTypes: types,
      masterResumeText: form.masterResumeText ?? "",
      resumeFileName: profile?.resumeFileName ?? "",
    }),
    [form, types, profile?.resumeFileName],
  );

  const status = setupStatus(profileLike);
  const missing = new Set(status.missing.map((m) => m.field as string));
  const current = STEPS[step];
  const blockedBy = current.required.filter((field) => missing.has(field));
  const blockedLabels = REQUIRED_FIELDS.filter((f) =>
    blockedBy.includes(f.field as string),
  ).map((f) => f.label);

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </main>
    );
  }
  if (!isAuthenticated) return <Navigate to="/auth?returnTo=%2Fonboarding" replace />;

  const readFile = (file: File) => {
    if (file.size > 3_000_000) {
      toast.error("That file is larger than 3 MB — paste the resume text instead.");
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const result = String(reader.result ?? "");
      const base64 = result.includes(",") ? result.slice(result.indexOf(",") + 1) : result;
      setUploading(true);
      setExtract(null);
      try {
        const r = await upload({ fileName: file.name, base64 });
        setExtract({ message: r.message, ok: r.looksUseful });
        if (r.looksUseful) {
          // Show exactly what we read, so the user can correct it before saving.
          setForm((f) => ({ ...f, masterResumeText: r.text }));
          setExtract({
            message: `${r.message} Preview: ${r.preview.slice(0, 160)}…`,
            ok: true,
          });
          toast.success(`Read ${r.extractedChars} characters from ${r.fileName}`);
        } else {
          toast.warning("Saved the file, but the text could not be read — paste it below.");
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setUploading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const finish = async () => {
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
        country: form.country || undefined,
        skills: (form.skills ?? "").split(/[,;\n]/).map((s) => s.trim()).filter(Boolean),
        experience: form.experience || undefined,
        projects: form.projects || undefined,
        certifications: form.certifications || undefined,
        masterResumeText: form.masterResumeText || undefined,
        targetRoles: (form.targetRoles ?? "").split(/[,;\n]/).map((s) => s.trim()).filter(Boolean),
        opportunityTypes: types,
        locations: form.locations || undefined,
        openToRemote: openRemote,
        minMatchScore: minScore,
        maxApplicationsPerDay: dailyCap,
        blacklistCompanies: form.blacklistCompanies || undefined,
        demoMode,
        autoApplyEnabled: autoApply,
        autoApplyMinScore: autoScore,
        autoApplyDailyLimit: autoLimit,
        onboardedAt: Date.now(),
      });
      toast.success(
        autoApply
          ? "Setup complete — autopilot is armed for high-scoring email roles"
          : "Setup complete — collect your first roles now",
      );
      navigate("/dashboard");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save your profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex size-6 items-center justify-center border border-foreground">
              <div className="size-2 bg-primary" />
            </div>
            <span className="text-sm font-semibold tracking-tight">CareerPilot</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 rounded-none text-muted-foreground"
            onClick={async () => {
              await signOut();
              navigate("/");
            }}
          >
            <LogOut className="size-3.5" />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-6 py-10">
        <p className="micro-label">
          Setup · step {step + 1} of {STEPS.length}
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
          {current.title}
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
          {current.blurb}
        </p>

        {/* Progress rail */}
        <div className="mt-6 flex items-center gap-1.5">
          {STEPS.map((s, i) => (
            <button
              key={s.key}
              onClick={() => i <= step && setStep(i)}
              aria-label={s.title}
              className={`h-1 flex-1 transition-colors ${
                i < step
                  ? "bg-primary"
                  : i === step
                    ? "bg-foreground"
                    : "bg-border"
              }`}
            />
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {status.percent}% complete · {status.missing.length} required field
          {status.missing.length === 1 ? "" : "s"} left
        </p>

        <Separator className="my-8" />

        {/* Steps */}
        {step === 0 && (
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Full name" required>
              <Input className="rounded-none" value={form.fullName ?? ""} onChange={set("fullName")} />
            </Field>
            <Field label="Headline" hint="One line, e.g. “CS junior — data & backend”.">
              <Input className="rounded-none" value={form.headline ?? ""} onChange={set("headline")} />
            </Field>
            <Field label="Email" required hint="Digest and application reply address.">
              <Input className="rounded-none" type="email" value={form.email ?? ""} onChange={set("email")} />
            </Field>
            <Field label="Phone" required>
              <Input className="rounded-none" value={form.phone ?? ""} onChange={set("phone")} />
            </Field>
            <Field label="Current location" required hint="City, country.">
              <Input className="rounded-none" value={form.location ?? ""} onChange={set("location")} />
            </Field>
            <Field label="Country" hint="Targets scholarship and government-exam searches.">
              <Input className="rounded-none" value={form.country ?? ""} onChange={set("country")} />
            </Field>
            <Field label="Links" hint="LinkedIn, GitHub, portfolio — one per line if you like.">
              <Input className="rounded-none" value={form.links ?? ""} onChange={set("links")} />
            </Field>
          </div>
        )}

        {step === 1 && (
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Major / field" required>
              <Input className="rounded-none" value={form.major ?? ""} onChange={set("major")} />
            </Field>
            <Field label="University" required>
              <Input className="rounded-none" value={form.university ?? ""} onChange={set("university")} />
            </Field>
            <Field label="Graduation year" required>
              <Input className="rounded-none" value={form.graduationYear ?? ""} onChange={set("graduationYear")} />
            </Field>
            <Field label="GPA" hint="Optional. Leave blank and it is simply omitted.">
              <Input className="rounded-none" value={form.gpa ?? ""} onChange={set("gpa")} />
            </Field>
            <Field label="Relevant coursework" hint="Comma separated.">
              <Input className="rounded-none" value={form.relevantCoursework ?? ""} onChange={set("relevantCoursework")} />
            </Field>
            <div className="sm:col-span-2">
              <Field
                label="Skills"
                required
                hint="At least three, comma separated. This is the only skill list the tailoring engine may draw from."
              >
                <Textarea
                  className="min-h-20 rounded-none"
                  placeholder="Python, SQL, Pandas, React, Git, Docker…"
                  value={form.skills ?? ""}
                  onChange={set("skills")}
                />
              </Field>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-5">
            <Field
              label="Experience"
              hint="One line per item, e.g. “Data Science Intern at Acme — built ETL in Python and SQL”."
            >
              <Textarea
                className="min-h-28 rounded-none"
                value={form.experience ?? ""}
                onChange={set("experience")}
              />
            </Field>
            <Field label="Projects" hint="One per line. Numbers beat adjectives.">
              <Textarea
                className="min-h-28 rounded-none"
                value={form.projects ?? ""}
                onChange={set("projects")}
              />
            </Field>
            <Field label="Certifications" hint="Optional.">
              <Input className="rounded-none" value={form.certifications ?? ""} onChange={set("certifications")} />
            </Field>
          </div>
        )}

        {step === 3 && (
          <div className="grid gap-5">
            <div className="border border-border px-5 py-5">
              <p className="micro-label">Upload</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                PDF or plain text, up to 3 MB. We read the text out of it so the
                profile can be filled with your real material — scanned or
                image-only PDFs cannot be read, so paste instead.
              </p>
              <label className="mt-4 inline-flex cursor-pointer items-center gap-2 border border-input px-3 py-2 text-sm hover:border-ring">
                {uploading ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <FileUp className="size-3.5" />
                )}
                {uploading ? "Reading…" : "Choose a file"}
                <input
                  type="file"
                  accept=".pdf,.txt,.md,application/pdf,text/plain"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) readFile(file);
                    e.target.value = "";
                  }}
                />
              </label>
              {profile?.resumeFileName && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Stored: {profile.resumeFileName}
                </p>
              )}
              {extract && (
                <p
                  className={`mt-3 flex items-start gap-2 text-xs leading-5 ${
                    extract.ok ? "text-muted-foreground" : "text-destructive"
                  }`}
                >
                  {!extract.ok && <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />}
                  {extract.message}
                </p>
              )}
            </div>

            <Field
              label="Resume text"
              required
              hint="Paste your resume here. This plus the fields above is what tailoring and the validator use."
            >
              <Textarea
                className="min-h-64 rounded-none font-mono text-[12.5px]"
                placeholder={"Aarav Sharma\nCS junior, University of Pune (2027)\n\nEXPERIENCE\n- Data Science Intern at …"}
                value={form.masterResumeText ?? ""}
                onChange={set("masterResumeText")}
              />
            </Field>
            <p className="text-xs text-muted-foreground">
              {(form.masterResumeText ?? "").trim().length} characters saved so far.
            </p>
          </div>
        )}

        {step === 4 && (
          <div className="grid gap-5">
            <Field
              label="Target roles"
              required
              hint="Comma separated — these are the search terms used against every source."
            >
              <Input
                className="rounded-none"
                placeholder="Software Engineer Intern, Data Analyst, Research Assistant"
                value={form.targetRoles ?? ""}
                onChange={set("targetRoles")}
              />
            </Field>

            <div>
              <Label className="text-xs font-medium text-muted-foreground">
                Opportunity types <span className="text-primary">*</span>
              </Label>
              <div className="mt-2 grid gap-px border border-border bg-border sm:grid-cols-2">
                {TYPE_OPTIONS.map(([value, label, blurb]) => {
                  const on = types.includes(value);
                  return (
                    <button
                      key={value}
                      onClick={() =>
                        setTypes((t) =>
                          t.includes(value) ? t.filter((x) => x !== value) : [...t, value],
                        )
                      }
                      className={`flex items-start gap-3 bg-card px-4 py-3 text-left transition-colors ${
                        on ? "bg-accent" : "hover:bg-accent/60"
                      }`}
                    >
                      <span
                        className={`mt-0.5 flex size-4 shrink-0 items-center justify-center border ${
                          on ? "border-primary bg-primary text-primary-foreground" : "border-border"
                        }`}
                      >
                        {on ? <Check className="size-3" /> : null}
                      </span>
                      <span>
                        <span className="block text-sm font-medium">{label}</span>
                        <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                          {blurb}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Preferred locations" hint="Comma separated.">
                <Input className="rounded-none" value={form.locations ?? ""} onChange={set("locations")} />
              </Field>
              <Field label="Companies to skip">
                <Input
                  className="rounded-none"
                  placeholder="e.g. Palantir, MangoLabs"
                  value={form.blacklistCompanies ?? ""}
                  onChange={set("blacklistCompanies")}
                />
              </Field>
              <Field label="Open to remote">
                <div className="flex h-9 items-center gap-2">
                  <Switch checked={openRemote} onCheckedChange={setOpenRemote} />
                  <span className="text-sm text-muted-foreground">
                    {openRemote ? "Yes" : "On-site only"}
                  </span>
                </div>
              </Field>
              <Field label="Demo mode" hint="Loads labeled sample roles so you can explore without keys.">
                <div className="flex h-9 items-center gap-2">
                  <Switch checked={demoMode} onCheckedChange={setDemoMode} />
                  <span className="text-sm text-muted-foreground">
                    {demoMode ? "On" : "Off"}
                  </span>
                </div>
              </Field>
              <div className="sm:col-span-2">
                <Field
                  label={`Minimum match score — ${minScore}`}
                  hint="Roles below this are rejected before you ever see them. Floor 50."
                >
                  <Slider value={[minScore]} min={50} max={100} step={5} onValueChange={(v) => setMinScore(v[0])} />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field
                  label={`Daily application cap — ${dailyCap} (hard limit 10)`}
                  hint="Counts hand-submitted applications too."
                >
                  <Slider value={[dailyCap]} min={1} max={10} step={1} onValueChange={(v) => setDailyCap(v[0])} />
                </Field>
              </div>
            </div>

            {/* Autopilot opt-in */}
            <div className="border border-border px-5 py-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold tracking-tight">
                    Autopilot — let CareerPilot apply on its own
                  </p>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                    When armed, the daily run tailors and <strong>emails</strong>{" "}
                    applications for shortlisted roles above the autopilot score
                    that have a verified apply address and a validator-clean
                    resume. Everything else still waits for you. Web forms are
                    never filled or submitted, and nothing here uses automation
                    or anti-detection tooling.
                  </p>
                </div>
                <Switch checked={autoApply} onCheckedChange={setAutoApply} />
              </div>
              {autoApply && (
                <div className="mt-5 grid gap-5 border-t border-border pt-5 sm:grid-cols-2">
                  <Field
                    label={`Autopilot minimum score — ${autoScore}`}
                    hint="Never below 80, and never below your overall minimum."
                  >
                    <Slider
                      value={[autoScore]}
                      min={80}
                      max={100}
                      step={1}
                      onValueChange={(v) => setAutoScore(clampAutoApplyMinScore(v[0], minScore))}
                    />
                  </Field>
                  <Field
                    label={`Autopilot daily limit — ${autoLimit} (max 3)`}
                    hint="Separate from your overall daily cap."
                  >
                    <Slider
                      value={[autoLimit]}
                      min={1}
                      max={3}
                      step={1}
                      onValueChange={(v) => setAutoLimit(clampAutoApplyDailyLimit(v[0]))}
                    />
                  </Field>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="sticky bottom-0 mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-background py-4">
          <span className="text-xs text-muted-foreground">
            {blockedLabels.length > 0
              ? `Still needed: ${blockedLabels.join(", ")}`
              : "Step complete."}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="rounded-none"
              disabled={step === 0}
              onClick={() => setStep((s) => Math.max(0, s - 1))}
            >
              <ArrowLeft className="size-4" />
              Back
            </Button>
            {step < STEPS.length - 1 ? (
              <Button
                className="rounded-none"
                disabled={blockedBy.length > 0}
                onClick={() => setStep((s) => s + 1)}
              >
                Continue
                <ArrowRight className="size-4" />
              </Button>
            ) : (
              <Button
                className="rounded-none"
                disabled={!status.complete || saving}
                onClick={finish}
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                Finish setup
              </Button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
