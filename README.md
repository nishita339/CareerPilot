# CareerPilot

A student-focused job search copilot: it discovers jobs, internships and
research roles from **public, official sources**, scores them against a Master
Profile, tailors an ATS-friendly resume that may only rephrase what you actually
did, and prepares applications that **you** approve before anything is sent.

## Non-negotiable policy (enforced in code, not just documented)

| Rule | Where it is enforced |
| --- | --- |
| Official/public APIs and public boards only — no login-wall scraping | `src/convex/collectors.ts` |
| No anti-detection tooling: no fingerprint spoofing, no patched browsers, no proxy rotation, no CAPTCHA solving | nothing of the sort exists in the codebase; gated sites are skipped |
| Resumes never invent skills, employers or metrics | `src/convex/validator.ts` + `tailor.ts` prompt rules |
| Email applications send only after explicit approval; web forms stay manual | `src/convex/apply.ts` gates |
| Daily cap (default 10, hard ceiling), min match score (default 70, floor 50) | `src/convex/policy.ts`, clamped in `profiles.saveProfile` |
| Secrets stay in the deployment environment; the LLM model name is config | `process.env` reads in `collectors.ts` / `tailor.ts` |

## How it flows

```
Dashboard ─ useQuery/useMutation/useAction ─► Convex
  collect  (action)  → collectors → dedupe → blacklist → score → jobs table
  scoreAll (mutation)→ matcher over every job vs. the Master Profile
  tailor   (action)  → LLM (structured JSON) → validator → resume HTML + structured data
  resumePdf(action)  → pdf-lib → single-column ATS PDF → Convex storage
  applyEmail(action) → approval + cap gates → email gateway → status "Applied"
  exportXlsx(action)→ exceljs → Student_Applications_Master.xlsx → storage
  digest   (action)  → email and/or Telegram summary
  crons.daily        → collect + score + digest for every profile
```

Actions cannot touch the database directly, so every read/write they need goes
through `src/convex/private.ts` (which also keeps module types non-circular).

## Collectors

| Source | Auth | Notes |
| --- | --- | --- |
| RemoteOK | none | public JSON feed |
| Remotive | none | public JSON API |
| Greenhouse | `GREENHOUSE_BOARD_TOKENS` | public board API, comma-separated company slugs |
| Lever | `LEVER_BOARD_TOKENS` | public postings API, comma-separated company slugs |
| Adzuna | `ADZUNA_APP_ID`, `ADZUNA_APP_KEY` | free tier; **attribution required** — every row shows its source |
| Jooble | `JOOBLE_API_KEY` | documented REST endpoint |
| arXiv | none | public Atom API; surfaced as research opportunities (manual apply) |
| Semantic Scholar | optional `SEMANTIC_SCHOLAR_API_KEY` | public Graph API; research opportunities |
| Demo board | none | **demo mode only** — sample listings with unroutable addresses |

Missing keys are reported as `skipped` (with the exact variable name) instead of
failing the run, and one broken collector never blocks the others.

Configure keys in the project's **Keys / API keys** tab — they are read as
deployment environment variables and never stored in the database or shipped to
the browser.

## Excel export

`Export to Excel` builds `Student_Applications_Master.xlsx` in Convex storage:
sheets **All, Jobs, Internships, Research, Shortlisted, Applied, Dashboard
Summary**, with the columns `Job_ID, Platform_Source, Type, Organization, Title,
Location, Link, Match_Score, Matched_Skills, Missing_Skills, Deadline, Status,
Date_Scraped, Date_Applied, Notes`. Matched/missing skills are split into two
columns so the sheet stays pivotable; the Dashboard Summary sheet carries counts
by status/type, average score, remaining daily quota and the active policy.

## PDF resume

`Download PDF` renders the same structured resume that produced the HTML: single
column, standard Helvetica, no tables and no images — the shape ATS parsers read
most reliably.

## Digest and scheduling

`scheduler.dailyPipeline` runs daily at **06:30 UTC** (see `src/convex/crons.ts`):
collect → ingest/dedupe/score → log → digest. Digests go to the email in your
profile via the email gateway and, if `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`
are set, to Telegram. Scheduled runs never send applications.

Environment variables: `CAREERPILOT_LLM_MODEL` (default `gpt-4o-mini`),
`ADZUNA_APP_ID`, `ADZUNA_APP_KEY`, `JOOBLE_API_KEY`,
`GREENHOUSE_BOARD_TOKENS`, `LEVER_BOARD_TOKENS`, `SEMANTIC_SCHOLAR_API_KEY`,
`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.

## Tests

```bash
bun test          # matcher, dedupe, validator, resume model
bun convex dev --once && bunx tsc -b --noEmit
```

The validator tests exist to prove the anti-hallucination gate actually blocks
invented skills, employers, metrics and AI-slop phrasing.

## Privacy — what is stored and how to delete it

Everything lives in **your** Convex deployment, tied to your account.

**Stored**

- Account: the email you signed in with and the session state.
- Master Profile: name, headline, contact details, education, skills,
  experience, projects, certifications, target roles, preferred locations,
  score floor, daily cap, company blacklist, demo-mode flag.
- Listings: source, organization, title, location, public URL, listing text,
  extracted skills, match score, matched/missing skills, explanation, deadline.
- Documents: tailored resume (structured data + HTML) and cover letter for roles
  you chose to tailor, plus validator notes.
- Audit trail: one timestamped row per action (scoring, tailoring, approval,
  send, export, digest) — this is what enforces the daily cap.
- Temporary files: generated `.xlsx` / `.pdf` exports in the same deployment's
  file storage.

**Not stored**

- No job-board logins or cookies, no password for third-party sites, no payment
  data, no browsing history, no device fingerprinting, no IP logging by this app.

**Shared with third parties**

- The LLM gateway receives your profile and the job description you tailor for.
- The email gateway receives digests and approved applications, addressed to
  you or to the role's apply address.
- Public job APIs receive only your target role keywords.

Collector API keys live in the deployment environment; they are never written to
the database and never sent to the browser.

**Delete everything:** Dashboard → *Profile* → *Delete all my data*. That removes
the profile, every listing, every tailored document and the entire audit trail
immediately, with no soft-delete or backup copy kept by the app. Deleting your
sign-in removes the account row.

**Using this responsibly:** prefer official APIs, keep volume low and targeted,
and only apply to roles you would actually take. Some boards' terms restrict
automation; when a site blocks automated access the app skips it and marks the
role "manual apply" rather than working around the block.
