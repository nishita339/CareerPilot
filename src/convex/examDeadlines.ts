// Admission & Competitive Exam Deadlines Tracker.
// Covers both Foreign Entrance Exams (GRE, IELTS, TOEFL, GMAT) and
// National Entrance & Govt Competitive Exams (GATE, CAT, CUET, UGC NET, UPSC, SSC).
// Pure module: fully testable, config-driven, links strictly to official portals.

export type ExamCategory =
  | "admission-foreign"
  | "admission-national"
  | "govt-recruitment"
  | "fellowship-exam";

export interface ExamWindow {
  label: string;
  applicationOpen?: string; // YYYY-MM-DD
  deadline?: string;        // YYYY-MM-DD
  examDate?: string;        // YYYY-MM-DD
  isRolling?: boolean;
}

export interface ExamOpportunity {
  id: string;
  name: string;
  category: ExamCategory;
  conductingBody: string;
  officialUrl: string;
  eligibility: string;
  frequency: string;
  tags: string[];
  windows: ExamWindow[];
  notes?: string;
}

export const OFFICIAL_EXAMS: ExamOpportunity[] = [
  // ---------------- Foreign Admission Exams ----------------
  {
    id: "gre-general",
    name: "GRE General Test",
    category: "admission-foreign",
    conductingBody: "ETS (Educational Testing Service)",
    officialUrl: "https://www.ets.org/gre",
    eligibility: "Open to all graduates applying for MS/PhD/MBA programs abroad",
    frequency: "Year-round (computer-delivered appointments)",
    tags: ["study-abroad", "research", "engineering", "computer science", "stem", "gre"],
    windows: [
      {
        label: "Year-Round Continuous Testing",
        isRolling: true,
      },
    ],
    notes: "Accepted by universities across US, Canada, Germany, UK, and Europe for Graduate Admissions.",
  },
  {
    id: "ielts-academic",
    name: "IELTS Academic",
    category: "admission-foreign",
    conductingBody: "British Council & IDP Education",
    officialUrl: "https://www.ielts.org",
    eligibility: "English proficiency test for study in UK, Australia, Canada, Europe, USA",
    frequency: "Multiple times weekly (Computer & Paper)",
    tags: ["study-abroad", "foreign", "scholarship", "ielts", "language"],
    windows: [
      {
        label: "Frequent Rolling Slots",
        isRolling: true,
      },
    ],
    notes: "Scores valid for 2 years. Required for most English-taught foreign university admissions.",
  },
  {
    id: "toefl-ibt",
    name: "TOEFL iBT",
    category: "admission-foreign",
    conductingBody: "ETS",
    officialUrl: "https://www.ets.org/toefl",
    eligibility: "English language proficiency for North American and European universities",
    frequency: "Over 60 test dates per year",
    tags: ["study-abroad", "foreign", "toefl", "language"],
    windows: [
      {
        label: "Rolling Testing Dates",
        isRolling: true,
      },
    ],
  },
  {
    id: "gmat-focus",
    name: "GMAT Focus Edition",
    category: "admission-foreign",
    conductingBody: "GMAC (Graduate Management Admission Council)",
    officialUrl: "https://www.mba.com/exams/gmat-focus-edition",
    eligibility: "Graduates seeking admission to Global MBA and Masters in Management (MiM)",
    frequency: "Year-round appointments",
    tags: ["study-abroad", "management", "mba", "business"],
    windows: [
      {
        label: "Continuous Registration",
        isRolling: true,
      },
    ],
  },

  // ---------------- National Entrance Exams (India) ----------------
  {
    id: "gate-engineering",
    name: "GATE (Graduate Aptitude Test in Engineering)",
    category: "admission-national",
    conductingBody: "IITs / IISc Bangalore (National Coordinating Body)",
    officialUrl: "https://gate2025.iitr.ac.in",
    eligibility: "B.Tech/B.E./M.Sc. students (3rd year and graduates) in engineering/sciences",
    frequency: "Annual (February)",
    tags: ["engineering", "computer science", "research", "fellowship", "govt-exam", "gate", "stem"],
    windows: [
      {
        label: "GATE Cycle",
        applicationOpen: "2026-08-25",
        deadline: "2026-10-10",
        examDate: "2027-02-06",
      },
    ],
    notes: "Mandatory for M.Tech admissions in IITs/NITs and PSU recruitment (IOCL, ONGC, NTPC, BHEL).",
  },
  {
    id: "cat-management",
    name: "CAT (Common Admission Test)",
    category: "admission-national",
    conductingBody: "IIMs (Indian Institutes of Management)",
    officialUrl: "https://iimcat.ac.in",
    eligibility: "Bachelor's degree with 50% marks (or final year students)",
    frequency: "Annual (Last Sunday of November)",
    tags: ["management", "business", "mba", "cat"],
    windows: [
      {
        label: "CAT Annual Cycle",
        applicationOpen: "2026-08-01",
        deadline: "2026-09-20",
        examDate: "2026-11-29",
      },
    ],
    notes: "Gateway to 21 IIMs, FMS Delhi, SPJIMR, and premier management institutes.",
  },
  {
    id: "cuet-pg",
    name: "CUET-PG (Common University Entrance Test PG)",
    category: "admission-national",
    conductingBody: "National Testing Agency (NTA)",
    officialUrl: "https://pgcuet.samarth.ac.in",
    eligibility: "Graduates seeking Master's (M.A., M.Sc., MCA, M.Com) in Central & State Universities",
    frequency: "Annual (March)",
    tags: ["higher-education", "computer science", "science", "arts", "central-university"],
    windows: [
      {
        label: "CUET PG Cycle",
        applicationOpen: "2026-12-20",
        deadline: "2027-01-31",
        examDate: "2027-03-15",
      },
    ],
    notes: "Unified admission test for DU, JNU, BHU, Hyderabad University, and 150+ universities.",
  },
  {
    id: "csir-ugc-net",
    name: "CSIR UGC NET (JRF & Lectureship)",
    category: "fellowship-exam",
    conductingBody: "National Testing Agency (NTA) & CSIR",
    officialUrl: "https://csirnet.nta.ac.in",
    eligibility: "M.Sc. or equivalent in Life/Chemical/Mathematical/Physical/Earth Sciences",
    frequency: "Twice a year (June & December)",
    tags: ["research", "fellowship", "science", "mathematics", "jrf"],
    windows: [
      {
        label: "June Session",
        applicationOpen: "2026-04-15",
        deadline: "2026-05-25",
        examDate: "2026-06-25",
      },
      {
        label: "December Session",
        applicationOpen: "2026-10-15",
        deadline: "2026-11-20",
        examDate: "2026-12-22",
      },
    ],
    notes: "Provides Junior Research Fellowship (JRF stipend ₹37,000/mo) for PhD scholars.",
  },

  // ---------------- Major Govt Recruitment Exams ----------------
  {
    id: "upsc-cse",
    name: "UPSC Civil Services Examination (CSE)",
    category: "govt-recruitment",
    conductingBody: "Union Public Service Commission (UPSC)",
    officialUrl: "https://upsc.gov.in",
    eligibility: "Any graduate aged 21-32 years",
    frequency: "Annual (Prelims in May/June)",
    tags: ["govt-exam", "civil-services", "upsc", "administration"],
    windows: [
      {
        label: "UPSC CSE Annual Notification",
        applicationOpen: "2027-02-05",
        deadline: "2027-02-25",
        examDate: "2027-05-23",
      },
    ],
    notes: "Selection for IAS, IPS, IFS, IRS and group A central services.",
  },
  {
    id: "ssc-cgl",
    name: "SSC Combined Graduate Level (CGL)",
    category: "govt-recruitment",
    conductingBody: "Staff Selection Commission (SSC)",
    officialUrl: "https://ssc.gov.in",
    eligibility: "Bachelor's degree in any discipline",
    frequency: "Annual",
    tags: ["govt-exam", "ssc", "administration", "inspector"],
    windows: [
      {
        label: "SSC CGL Notification",
        applicationOpen: "2026-06-15",
        deadline: "2026-07-20",
        examDate: "2026-09-15",
      },
    ],
    notes: "Recruitment for Assistant Section Officer, Income Tax Inspector, and Central Secretariat posts.",
  },
  {
    id: "ibps-po",
    name: "IBPS Probationary Officer (PO/MT)",
    category: "govt-recruitment",
    conductingBody: "Institute of Banking Personnel Selection (IBPS)",
    officialUrl: "https://ibps.in",
    eligibility: "Graduates aged 20-30 years",
    frequency: "Annual (August notification)",
    tags: ["govt-exam", "banking", "finance", "ibps"],
    windows: [
      {
        label: "IBPS PO Cycle",
        applicationOpen: "2026-08-01",
        deadline: "2026-08-25",
        examDate: "2026-10-18",
      },
    ],
    notes: "Unified recruitment for 11 public sector nationalized banks in India.",
  },
];

/** Matches exam opportunities against a user's profile interests, major, and opportunity types. */
export function matchExamsForProfile(
  profile: {
    major?: string;
    targetRoles?: string[];
    opportunityTypes?: string[];
    country?: string;
  },
  exams: ExamOpportunity[] = OFFICIAL_EXAMS,
): { exam: ExamOpportunity; relevanceScore: number; reason: string }[] {
  const profileTokens = [
    profile.major ?? "",
    ...(profile.targetRoles ?? []),
    ...(profile.opportunityTypes ?? []),
    profile.country ?? "",
  ]
    .join(" ")
    .toLowerCase();

  const isAbroadSeeker =
    (profile.opportunityTypes ?? []).includes("study-abroad") ||
    /abroad|foreign|germany|usa|uk|europe|international/i.test(profileTokens);

  const isResearchSeeker =
    (profile.opportunityTypes ?? []).includes("research") ||
    (profile.opportunityTypes ?? []).includes("fellowship") ||
    /research|phd|fellowship|scientist/i.test(profileTokens);

  const isGovtSeeker =
    (profile.opportunityTypes ?? []).includes("govt-exam") ||
    /govt|government|upsc|ssc|psu|civil/i.test(profileTokens);

  const results: { exam: ExamOpportunity; relevanceScore: number; reason: string }[] = [];

  for (const exam of exams) {
    let score = 20; // baseline
    const reasons: string[] = [];

    // Category matches
    if (exam.category === "admission-foreign" && isAbroadSeeker) {
      score += 40;
      reasons.push("Matches your interest in study abroad and international programs");
    }
    if (exam.category === "fellowship-exam" && isResearchSeeker) {
      score += 40;
      reasons.push("Offers funding/fellowship aligned with research paths");
    }
    if (exam.category === "govt-recruitment" && isGovtSeeker) {
      score += 40;
      reasons.push("Official government examination notification");
    }
    if (exam.category === "admission-national") {
      score += 20;
    }

    // Tag matching with profile keywords
    const matchingTags = exam.tags.filter((t) => profileTokens.includes(t));
    if (matchingTags.length > 0) {
      score += Math.min(30, matchingTags.length * 10);
      reasons.push(`Relevant to: ${matchingTags.slice(0, 3).join(", ")}`);
    }

    results.push({
      exam,
      relevanceScore: Math.min(100, score),
      reason: reasons.join(". ") || "Standard national/foreign qualification exam.",
    });
  }

  return results.sort((a, b) => b.relevanceScore - a.relevanceScore);
}

/** Check if any deadline is coming up within N days */
export function getUpcomingDeadlines(
  exams: ExamOpportunity[] = OFFICIAL_EXAMS,
  withinDays: number = 30,
  nowMs: number = Date.now(),
): { exam: ExamOpportunity; window: ExamWindow; daysRemaining: number }[] {
  const upcoming: { exam: ExamOpportunity; window: ExamWindow; daysRemaining: number }[] = [];
  const oneDayMs = 24 * 60 * 60 * 1000;

  for (const exam of exams) {
    for (const win of exam.windows) {
      if (win.deadline) {
        const deadlineMs = new Date(win.deadline).getTime();
        const diffDays = Math.ceil((deadlineMs - nowMs) / oneDayMs);
        if (diffDays >= 0 && diffDays <= withinDays) {
          upcoming.push({ exam, window: win, daysRemaining: diffDays });
        }
      }
    }
  }

  return upcoming.sort((a, b) => a.daysRemaining - b.daysRemaining);
}
