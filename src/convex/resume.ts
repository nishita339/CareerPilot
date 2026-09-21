// Shared resume model: one structured document rendered to ATS-friendly HTML,
// plain text (email) and PDF (see resumePdf.ts). Single column, no tables,
// no images — parsers read it linearly.

export interface ResumeSection {
  heading: string;
  kind: "text" | "bullets";
  lines: string[];
}

export interface ResumeDoc {
  name: string;
  headline: string;
  contact: string;
  sections: ResumeSection[];
}

export interface ProfileForResume {
  fullName: string;
  headline: string;
  email: string;
  phone: string;
  location: string;
  links?: string;
  major: string;
  university: string;
  graduationYear: string;
  gpa?: string;
  relevantCoursework?: string;
  certifications?: string;
}

export interface TailoredContent {
  summary: string;
  skills: string[];
  bullets: string[];
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Build the single source of truth for both HTML and PDF output. */
export function buildResumeDoc(
  profile: ProfileForResume,
  tailored: TailoredContent,
): ResumeDoc {
  const contact = [
    profile.email,
    profile.phone,
    profile.location,
    profile.links,
  ]
    .filter((v) => v && v.trim())
    .join(" · ");

  const sections: ResumeSection[] = [
    {
      heading: "Education",
      kind: "text",
      lines: [
        `${profile.major}, ${profile.university} (${profile.graduationYear})${profile.gpa ? ` · GPA ${profile.gpa}` : ""}`,
        ...(profile.relevantCoursework
          ? [`Coursework: ${profile.relevantCoursework}`]
          : []),
      ],
    },
    { heading: "Skills", kind: "text", lines: [tailored.skills.join(" · ")] },
    ...(tailored.bullets.length
      ? [
          {
            heading: "Experience & Projects",
            kind: "bullets" as const,
            lines: tailored.bullets,
          },
        ]
      : []),
    ...(profile.certifications
      ? [
          {
            heading: "Certifications",
            kind: "text" as const,
            lines: [profile.certifications],
          },
        ]
      : []),
    ...(tailored.summary
      ? [
          {
            heading: "Summary",
            kind: "text" as const,
            lines: [tailored.summary],
          },
        ]
      : []),
  ];

  return {
    name: profile.fullName,
    headline: profile.headline,
    contact,
    sections,
  };
}

/** ATS-friendly HTML: headings, paragraphs and lists only. */
export function renderResumeHtml(doc: ResumeDoc): string {
  const parts: string[] = [
    `<h3>${escapeHtml(doc.name)}</h3>`,
    `<p class="muted">${escapeHtml([doc.headline, doc.contact].filter(Boolean).join(" · "))}</p>`,
  ];
  for (const section of doc.sections) {
    parts.push(`<p><strong>${escapeHtml(section.heading)}</strong></p>`);
    if (section.kind === "bullets") {
      parts.push(
        `<ul>${section.lines.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul>`,
      );
    } else {
      parts.push(
        ...section.lines
          .filter((l) => l.trim())
          .map((l) => `<p>${escapeHtml(l)}</p>`),
      );
    }
  }
  return parts.join("\n");
}

/** Plain-text rendering for email bodies and clipboard copies. */
export function renderResumeText(doc: ResumeDoc): string {
  const out: string[] = [
    doc.name,
    [doc.headline, doc.contact].filter(Boolean).join(" · "),
    "",
  ];
  for (const section of doc.sections) {
    out.push(section.heading.toUpperCase());
    for (const line of section.lines.filter((l) => l.trim())) {
      out.push(section.kind === "bullets" ? `- ${line}` : line);
    }
    out.push("");
  }
  return out.join("\n").trim();
}

/** Narrow an untrusted stored value back into a ResumeDoc. */
export function asResumeDoc(value: unknown): ResumeDoc | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<ResumeDoc>;
  if (typeof v.name !== "string" || !Array.isArray(v.sections)) return null;
  return {
    name: v.name,
    headline: typeof v.headline === "string" ? v.headline : "",
    contact: typeof v.contact === "string" ? v.contact : "",
    sections: v.sections
      .filter(
        (s): s is ResumeSection =>
          !!s &&
          typeof (s as ResumeSection).heading === "string" &&
          Array.isArray((s as ResumeSection).lines),
      )
      .map((s) => ({
        heading: s.heading,
        kind: s.kind === "bullets" ? "bullets" : "text",
        lines: s.lines.map((l: unknown) => String(l)),
      })),
  };
}
