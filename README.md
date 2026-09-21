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
| One application per company per window (default 7 days, floor 3) | `src/convex/cooldown.ts` + the gate in `apply.ts` |
| Web forms are never filled or submitted automatically — the kit is copy-paste | `src/convex/policy.ts`, `ApplicationKit` in `Dashboard.tsx` |
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
  crons.hourly       → at :30 each hour, run the daily pass for profiles whose
                       chosen hour it is (collect + score + digest)
  cleanWebFormJob    → apply kits are copy-paste; nothing is submitted for you
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
most reliably. The identical bytes are attached to approved email applications,
so what you reviewed in the dashboard is what the recruiter receives.

Both export builders live in pure modules (`pdf.ts`, `xlsx.ts`) with no Convex
dependencies, so the test suite builds a real PDF and a real workbook and
asserts their structure.

**Non-Latin text.** The standard PDF fonts are WinAnsi (Latin-1 plus typography),
so a Devanagari, CJK or Cyrillic name cannot be encoded by them at all — and
pdf-lib throws rather than degrading. `sanitizeForWinAnsi` runs first: characters
that decompose to a Latin base letter (`Ā → A`, `Ș → S`, `ź → z`) are folded,
anything left over becomes a visible `?`, and the build never fails (there is a
second, fully-ASCII fallback pass behind that). Adjusted characters come back as
a warning in the UI — e.g. *“Latin-only PDF font: adjusted 4 characters”* — and
the same warning rides along with an approved send. If your name or school is
not Latin script, use the resume preview and your browser's **Print → Save as
PDF** for that application instead: browser printing uses system fonts and
handles full Unicode.

## Application kit (web forms, no automation)

Roles with `applyMode: form` (previously `manual`) get an **Application kit**
instead of a Send button: copyable full name, email, phone, location, links,
education and skills, the tailored cover letter as plain text, the resume as
plain text, a `Download PDF` action for the file you upload, a *Copy all fields*
shortcut, and an *I submitted this myself* button that records the application.

There is no browser automation anywhere in this app — no form pre-filling, no
headless browser, no stealth plugins, no CAPTCHA handling, no proxy rotation.
You paste, upload and press Submit yourself. Recording the application matters:
the audit trail is what enforces the daily cap and the company cooldown, so a
hand-submitted role counts exactly like one this app emailed.

## Company cooldown

`checkCooldown` blocks an application when you already applied to the same
employer inside the window. Organization names are normalized first (legal
suffixes and parentheticals stripped, so "Acme Inc" and "ACME" are one company)
and the *matching* rule is deliberately conservative: normalized names must
match, or the shorter name's words must be a subset of the longer one with at
least two words, so "Acme" never swallows "Acme Cloud" or "Acme Foods".

The trade-off to know about: because a one-word name never matches a longer one,
same-company cases like *“Google”* vs *“Google India”* are **not** caught. Loose
matching was the worse failure mode — it would silently block a different
employer — so the conservative rule is the default.

Both kinds of application feed it. `buildPriorApplications` reads the audit
trail through `isApplicationAction` (`applied (email)` from an approved send and
`applied (manual)` from the *I submitted this myself* button), so applies you
recorded by hand count too. Applies you never record — made outside the app and
not marked — are invisible by design, and the UI says so. The window is
configurable in your profile, clamped to 3–90 days.

## Digest and scheduling

Convex cron expressions are static, so `crons.hourly` fires **every hour at :30**
and `scheduler.dailyPipeline` runs only the profiles whose chosen hour matches —
so each profile still gets exactly one daily pass: collect → ingest/dedupe/score
→ log → digest. The hour is set in your profile (`digestHourUtc`, default
**06:30 UTC = 12:00 IST**) and the dialog shows every option in your browser's
timezone next to the stored UTC value. A 20-hour guard on `lastDigestAt` stops a
second run in the same day, including after a manual *Send digest*.

Each digest reports new shortlisted matches (highest score first), applications
awaiting your approval, and **deadlines inside the next 7 days**. Digests go to
the email in your profile via the email gateway and, if `TELEGRAM_BOT_TOKEN` +
`TELEGRAM_CHAT_ID` are set, to Telegram. Scheduled runs never send applications.

Deadline parsing is forgiving by design (`2026-10-15`, `2026/10/15`,
`15 Oct 2026`, `Oct 15, 2026`) and refuses to guess: open-ended values
("Rolling", "Open until filled", "ASAP") are ignored, far-future typos are
rejected by a five-year sanity check, and **ambiguous slash dates such as
`10/11/2026` are ignored rather than guessed** — the app would rather show no
deadline than a wrong one.

Environment variables: `CAREERPILOT_LLM_MODEL` (default `gpt-4o-mini`),
`ADZUNA_APP_ID`, `ADZUNA_APP_KEY`, `JOOBLE_API_KEY`,
`GREENHOUSE_BOARD_TOKENS`, `LEVER_BOARD_TOKENS`, `SEMANTIC_SCHOLAR_API_KEY`,
`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.

There is deliberately no committed `.env.example`: keys are set through the
project's Keys tab and read from the deployment environment, so no placeholder
file can be mistaken for a real one. The dashboard's collector strip shows at a
glance which sources are active and, on hover, which variable each idle one
needs.

## Tests

```bash
bun test          # 95 tests: matcher, dedupe, validator, resume model, exports,
                  # collectors, company cooldown, deadlines, scheduling,
                  # PDF encoding (non-Latin safety)
bun convex dev --once && bunx tsc -b --noEmit
```

The validator tests prove the anti-hallucination gate actually blocks invented
skills, employers, metrics and AI-slop phrasing. The export tests build a real
`.xlsx` (all seven sheets, column order, summary maths) and a real `.pdf`, then
*extract the PDF's text back out* — inflating the content streams and decoding
WinAnsi — to assert the resume is machine-readable, in linear order, with no
garbled characters. The cooldown tests cover the four cases that matter (same
org inside the window, just outside it, a different org, and name variants) plus
timestamp, clamping and audit-mapping edge cases (hand-submitted applies count,
non-application rows never do). The PDF tests include a non-Latin profile: one
test proves pdf-lib *cannot* encode Devanagari with the standard fonts (the bug
the sanitizer prevents), and the rest prove the export still returns a valid,
openable PDF with honest warnings instead of failing.

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
  send, export, digest), including the organization name at the time of a send —
  this is what enforces the daily cap and the company cooldown.
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
