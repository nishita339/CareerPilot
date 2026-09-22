# CareerPilot

A student-focused opportunity copilot. It discovers **jobs, internships,
research, fellowships, scholarships and government-exam notifications** from
public, official sources, scores them against a Master Profile, tailors an
ATS-friendly resume that may only rephrase what you actually did, and prepares
applications that you approve — or lets **autopilot** email the highest-scoring
ones for you inside hard limits you set.

## Non-negotiable policy (enforced in code, not just documented)

| Rule | Where it is enforced |
| --- | --- |
| Documented public APIs, public job boards and one public web-search index — no login-wall scraping | `src/convex/collectors.ts`, `src/convex/websearch.ts` |
| Scholarships, government exams and study abroad are restricted to an **official-portal allow-list** — no affiliate "scholarship blog" can enter the pipeline | `OFFICIAL_PORTAL_DOMAINS` in `src/convex/websearch.ts` |
| No anti-detection tooling: no fingerprint spoofing, no patched browsers, no proxy rotation, no CAPTCHA solving | nothing of the sort exists in the codebase; a blocked source is skipped |
| Resumes never invent skills, employers or metrics | `src/convex/validator.ts` + `tailor.ts` prompt rules |
| A resume and the core profile fields are **mandatory** before the pipeline opens | `src/convex/suggestions.ts` (`REQUIRED_FIELDS`) + the `/onboarding` gate in `Dashboard.tsx` |
| Email applications send only after approval — or from autopilot, which is opt-in and bounded | `src/convex/send.ts` gates |
| Autopilot: employment sections only, never below score 80, validator-clean, ≤ 3/day (default 2), inside the company cooldown | `src/convex/autopilotRules.ts` + `autopilot.ts` |
| Daily cap (default 10, hard ceiling) and min match score (default 70, floor 50) | `src/convex/policy.ts`, clamped in `profiles.saveProfile` |
| One application per company per window (default 7 days, floor 3) | `src/convex/cooldown.ts` + the gate in `send.ts` |
| Web forms are never filled or submitted automatically — the kit is copy-paste | `src/convex/policy.ts`, `ApplicationKit` in `Dashboard.tsx` |
| Secrets stay in the deployment environment; the LLM model name is config | `process.env` reads in `collectors.ts` / `tailor.ts` |

## How it flows

```
Sign in ─► /onboarding (mandatory)
   identity, study & skills, experience, your resume, targets + autopilot opt-in
   → profiles.saveProfile + resumeUpload.uploadResume (file stored, text extracted)

Dashboard ─ useQuery/useMutation/useAction ─► Convex
  collect    (action)  → collectors → dedupe → blacklist → score → jobs table
  scoreAll   (mutation)→ matcher over every job vs. the Master Profile
  tailor     (action)  → LLM (structured JSON) → validator → resume HTML + structured data
  resumePdf  (action)  → pdf-lib → single-column ATS PDF → Convex storage
  applyEmail (action)  → send.dispatchApprovedSend → gates → email gateway (+ PDF attached)
  runAutopilot(action)→ tailor → auto-approve → the same gated send path
  exportXlsx (action)  → exceljs → Student_Applications_Master.xlsx → storage
  digest     (action)  → email and/or Telegram summary
  crons.hourly         → at :30 each hour, run the daily pass for profiles whose
                         chosen hour it is (collect + score + autopilot + digest)
```

Actions cannot touch the database directly, so every read/write they need goes
through `src/convex/private.ts` (which also keeps module types non-circular).
Every helper the scheduler or autopilot can reach has an explicit-`userId`
variant, because a cron-triggered action has no auth identity.

## Sections — six opportunity types, kept apart

`OPPORTUNITY_SECTIONS` in `src/convex/policy.ts` is the single definition used by
the dashboard tabs, the collector strip and the Excel sheets:

| Section | Types | Typical source |
| --- | --- | --- |
| All | every type | — |
| Jobs | `job` | RemoteOK, Remotive, Greenhouse, Lever, Adzuna, Jooble |
| Internships | `internship` | job boards + public boards |
| Research | `research`, `fellowship` | arXiv, Semantic Scholar, web search |
| Scholarships | `scholarship` | official scholarship portals only |
| Government exams | `govt-exam` | official exam bodies only |
| Study abroad | `study-abroad` | DAAD, Erasmus+, Fulbright, EducationUSA, Campus France and similar official agencies |

Classification is deterministic (`classifyOpportunity`): research markers win
first, a government **and** an exam marker are both required for the exam
section, a plain corporate "recruitment" ad never lands there, and study-abroad
markers are checked last — so a funded programme that says "scholarship" stays in
Scholarships, and a "research fellow" stays in Research, instead of both drifting
into Study abroad.

## Collectors

| Source | Auth | Notes |
| --- | --- | --- |
| RemoteOK | none | public JSON feed |
| Remotive | none | public JSON API |
| Greenhouse | `GREENHOUSE_BOARD_TOKENS` | public board API, comma-separated company slugs |
| Lever | `LEVER_BOARD_TOKENS` | public postings API, comma-separated company slugs |
| Adzuna | `ADZUNA_APP_ID`, `ADZUNA_APP_KEY`, optional `ADZUNA_COUNTRY` | free tier; **attribution required** — every row shows its source |
| Jooble | `JOOBLE_API_KEY` | documented REST endpoint |
| arXiv | none | public Atom API; surfaced as research opportunities (manual apply) |
| Semantic Scholar | optional `SEMANTIC_SCHOLAR_API_KEY` | public Graph API; research opportunities |
| Web · Jobs / Internships / Research | `EXA_API_KEY` | the open-web channel — see below |
| Web · Scholarships / Government exams / Study abroad | `EXA_API_KEY` | same channel, but restricted to **official portals** — see below |
| Web · Blogs & community | `EXA_API_KEY`, `EXA_COMMUNITY_DOMAINS` | opt-in; needs a domain allow-list to be useful |
| Demo board | none | **demo mode only** — nine labeled sample listings covering every section |

Missing keys are reported as `skipped` (with the exact variable name) instead of
failing the run, one broken collector never blocks the others, and each web
channel is gated on the opportunity types the profile selected. Configure keys in
the project's **Keys / API keys** tab — they are read as deployment environment
variables and never stored in the database or shipped to the browser.

### The open-web channel

Some of what a student needs — scholarship portals, exam notifications, calls for
papers, blog and forum posts — is not on any job board. `src/convex/websearch.ts`
queries a **public search index** (Exa) with one specific, per-category query
built from the profile, and stores only the title, URL, snippet, publish date and
any labelled deadline or apply address found in the text. There is no login, no
cookie jar, no browser automation, no fingerprint spoofing and no proxy rotation:
if a page is not publicly indexable it simply does not appear, and the row always
links back to the original page.

### Official-portal allow-lists

The three categories with no job-board API are exactly the ones where an
unrestricted web search drowns you in affiliate "scholarship blog" and "Sarkari
Result" sites that republish stale notices. So those channels are restricted to a
curated list of **official** portals — the awarding body, the ministry, or the
government education agency itself (`OFFICIAL_PORTAL_DOMAINS` in
`websearch.ts`). A result from any other host is never fetched, never stored and
never scored, and `tests/websearch.test.ts` asserts that no aggregator domain is
on any allow-list.

Any of these can be **replaced** — useful outside India, or if you only care
about one country:

| Variable | Channel | Built-in examples |
| --- | --- | --- |
| `EXA_SCHOLARSHIP_DOMAINS` | Scholarships | scholarships.gov.in, education.gov.in, ugc.gov.in, chevening.org, cscuk.fcdo.gov.uk, daad.de, erasmus-plus.ec.europa.eu, fulbright.org |
| `EXA_EXAM_DOMAINS` | Government exams | upsc.gov.in, ssc.gov.in, ibps.in, indianrailways.gov.in, nta.ac.in, employmentnews.gov.in, rbi.org.in, sbi.co.in |
| `EXA_STUDY_ABROAD_DOMAINS` | Study abroad | daad.de, study-in-germany.de, erasmus-plus.ec.europa.eu, fulbright.org, educationusa.state.gov, campusfrance.org, studyinaustralia.gov.au, educanada.ca |

Setting one **replaces** its built-in list (comma-separated). Paste bare hosts
(`daad.de`) or full URLs (`https://www.daad.de/en/study`) — both are normalised to
the bare host, and duplicates collapse. Leave it unset to keep the defaults. **Study abroad is never
auto-applied** — these are programmes you apply to on the institution's own
portal, so the section is display-and-remind only, with an "apply here yourself"
link.

## Setup is mandatory

`/onboarding` is a five-step gate that runs before the dashboard opens, and the
dashboard redirects back to it whenever a required field is missing. Those fields
(`REQUIRED_FIELDS` in `src/convex/suggestions.ts`) are exactly the ones the
tailoring engine and the validator rely on: name, a valid email, phone, location,
major, university, graduation year, at least three skills, at least one target
role, at least one opportunity type, and **your resume**.

The resume step accepts an upload (PDF or text, up to 3 MB; the text is extracted
best-effort and shown back to you for correction) or pasted text. Both are stored
on your profile; the file is kept in the deployment's file storage. Extraction is
deliberately honest: scanned or image-only PDFs fail to extract, and the UI says
so and asks you to paste instead of pretending it read your resume.

## Improvement suggestions

`src/convex/suggestions.ts` is a deterministic advice engine (no LLM) that runs
against your live profile and pipeline, shown in the dashboard's *Improve your
chances* panel and summarised by severity:

- **Setup** — which required fields are still empty, missing profile link or
  headline, GPA and coursework advice.
- **Resume** — no numbers in your bullets, over-long lines, filler phrasing
  ("passionate", "results-driven"), first-person pronouns, too few bullets, and
  any validator flags that are blocking a send.
- **Skills** — recurring gaps across the roles you already match, framed as
  either "add it if you genuinely have it" or a learning plan.
- **Opportunities** — applications waiting on your review and deadlines inside
  seven days.
- **Autopilot** — roles that already clear the autopilot bar while it is off, or
  an armed autopilot with nothing to do.

## Autopilot (opt-in, email only)

Off by default and armed explicitly from the dashboard, `/onboarding`, or the
profile dialog. When armed, the daily run (and the *Run autopilot now* button)
picks shortlisted roles that:

1. have a verified apply address (`applyMode = email`) — web forms are **never**
   touched,
2. score at or above the autopilot bar (default 85, floor 80, never below your
   overall minimum),
3. tailor successfully and pass the validator — a flagged resume is left for you
   with the reason recorded,
4. are inside the autopilot daily limit (default 2, max 3) and the overall daily
   cap,
5. are not inside the company cooldown, and never the same employer twice in one
   run.

Autopilot's approval is written to the audit trail as `auto-approved`, and the
send itself as `applied (email, autopilot)` — so it counts toward the daily cap
and the company cooldown exactly like a send you approved yourself. Scholarships
and government exams are never auto-applied. Disarming it is one click and takes
effect immediately.

## Company cooldown

After an application goes to an organization, further sends to the same employer
are blocked for the window (default 7 days, clamped 3–90). Name variants such as
"Acme Inc" and "ACME" are the same company; matching is intentionally
conservative, so "Google" does **not** swallow "Google India". Only applications
recorded here count — including ones you record by hand and ones autopilot sent —
because the audit trail is the single source of truth. Applies you made elsewhere
are invisible by design.

## Excel export

`Export to Excel` builds `Student_Applications_Master.xlsx` in Convex storage
with one sheet per section — **All, Jobs, Internships, Research, Scholarships,
Govt Exams, Study Abroad, Shortlisted, Applied, Dashboard Summary** — and the columns
`Job_ID, Platform_Source, Type, Organization, Title, Location, Link, Match_Score,
Matched_Skills, Missing_Skills, Deadline, Status, Date_Scraped, Date_Applied,
Auto_Applied, Notes`.

Matched/missing skills are split into two columns so the sheet stays pivotable;
`Auto_Applied` marks what autopilot sent. The Dashboard Summary sheet carries
counts by status and by type (including scholarships, exams and study abroad),
average score,
applied-today and how much of it was autopilot, remaining quota, active sources
and the enforced policy text. The export is a one-way snapshot: edit `Status` and
`Notes` inside the app, not in the file.

## PDF resume

`Download PDF` renders the same structured resume that produced the HTML: single
column, standard Helvetica, no tables and no images — the shape ATS parsers read
most reliably. The identical bytes are attached to approved email applications,
so what you reviewed is what the recruiter receives.

**Encoding is a workaround, not a solution.** pdf-lib's standard fonts are
WinAnsi (Latin-1 plus typography). Characters that can be folded to Latin stay
readable; anything else (Devanagari, CJK, Cyrillic) becomes `?` and the UI warns
you, pointing at your browser's **Print → Save as PDF** for full Unicode.
Practical advice: keep the resume in English and use the Latin spelling of your
name — ATS parsers read those most reliably.

## Application kit (web forms, no automation)

Form-mode roles get a copy-paste kit: name, email, phone, location, links,
education, skills, the cover letter as plain text, the resume as plain text, the
ATS PDF, and an *I submitted this myself* button that records the application in
the audit trail (and counts against the daily cap, with an undo). Nothing in this
codebase fills, submits or automates a web form.

## Digest and scheduling

The daily pass runs at the hour you choose in your profile (default **06:30
UTC** = 12:00 IST; each option is shown in your local timezone). A Convex cron
fires hourly at `:30`, the profile's own hour selects which pass does the work,
and a 20-hour guard prevents a second run in the same day — so a manual *Send
digest* defers the scheduled one to the next day. The digest lists new
high-scoring matches, applications awaiting your approval, and deadlines inside
seven days. Email needs a profile email; Telegram needs `TELEGRAM_BOT_TOKEN` and
`TELEGRAM_CHAT_ID`.

## Tests

```bash
bun test                                        # 199 tests
bunx convex dev --once && bunx tsc -b --noEmit   # backend codegen + typecheck
```

What the suites actually prove, rather than assert:

- **Validator** — invented skills, employers, metrics and AI-slop phrasing are
  blocked, so a flagged resume can never be sent.
- **Exports** — a real `.xlsx` is built and loaded back (all ten sheets, column
  order, row mapping, summary maths, `Auto_Applied`), and a real `.pdf` is built
  and its text *extracted back out* (inflating content streams, decoding WinAnsi)
  to prove linear order and no garbled characters. The PDF tests also include a
  non-Latin profile: one proves pdf-lib cannot encode Devanagari with standard
  fonts, the rest prove the export still returns an openable PDF with honest
  warnings instead of failing.
- **Resume upload** — `extractPdfText` round-trips a pdf-lib document, keeps the
  order, survives typographic punctuation, and returns an empty string (never
  throws) on unusable input.
- **Cooldown and autopilot** — same org inside the window, just outside it, a
  different org, name variants, hand-recorded applies, undone applies, cap and
  limit edges, "never two sends to one company in a run", and every clamp
  (score floor 80/limit 3/scholarships excluded).
- **Web channels** — which channels a profile opts into, an inert channel when
  `EXA_API_KEY` is missing, query construction, result mapping (deadline and
  apply-address extraction), and that community/blog search needs an explicit
  domain list.
- **Official allow-lists** — that scholarships, exams and study abroad always
  carry a non-empty allow-list, that job boards stay unrestricted, that no
  affiliate aggregator appears on any list, that every entry is a bare host, that
  an env var replaces a built-in list without touching the others, and that the
  community channel has no built-in list at all.
- **Never auto-applied** — study abroad, scholarships and exams are dropped from
  the autopilot type list even if a profile asks for them, and are ignored by the
  candidate selector.
- **Suggestions** — completeness rules and each advice rule, including that skill
  gaps are framed as "only if you genuinely have it".
- **Collector status** — never leaks a credential value, only the variable name.

## Privacy — what is stored and how to delete it

Everything lives in **your** Convex deployment, tied to your account.

**Stored**

- Account: the email you signed in with and the session state.
- Master Profile: name, headline, contact details, education, skills, experience,
  projects, certifications, country, target roles, preferred locations, score
  floor, daily cap, company blacklist, demo-mode flag, digest hour, and the
  autopilot settings (enabled, score floor, daily limit, sections).
- Your resume: the pasted text, plus the uploaded file (in the deployment's file
  storage) with its filename and whatever text was extracted from it.
- Listings: source, organization, title, location, public URL, snippet/description
  text, extracted skills, match score, matched/missing skills, explanation,
  deadline, and whether autopilot applied.
- Documents: tailored resume (structured data + HTML) and cover letter for roles
  you chose to tailor, plus validator notes.
- Audit trail: one timestamped row per action (scoring, tailoring, approval,
  autopilot approval, send, export, digest, resume upload), including the
  organization name at the time of a send — this is what enforces the daily cap
  and the company cooldown.
- Temporary files: generated `.xlsx` / `.pdf` exports in the same deployment's
  file storage.

**Not stored**

- No job-board logins or cookies, no password for third-party sites, no payment
  data, no browsing history, no device fingerprinting, no IP logging by this app.

**Shared with third parties**

- The LLM gateway receives your profile and the job description you tailor for.
- The email gateway receives digests and applications, addressed to you or to the
  role's apply address.
- The public job APIs receive only your target role keywords. The web-search
  index receives the generated query (derived from your major, target roles,
  location and selected sections) — nothing else about you — and for the
  scholarship, exam and study-abroad channels the request is additionally
  restricted to the official-portal allow-list.

Collector API keys live in the deployment environment; they are never written to
the database and never sent to the browser.

**Delete everything:** Dashboard → *Profile* → *Delete all my data*. That removes
the profile, every listing, every tailored document, the audit trail, the
uploaded resume file **and** the generated export blobs recorded in the audit
trail, immediately, with no soft-delete or backup copy kept by the app. Deleting
your sign-in removes the account row.

**Using this responsibly:** prefer official APIs, keep volume low and targeted,
and only apply to roles you would actually take. Some boards' terms restrict
automation; when a site blocks automated access the app skips it and marks the
role "manual apply" rather than working around the block.
