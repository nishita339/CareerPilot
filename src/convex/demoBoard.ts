// Sample listings used ONLY when the user turns demo mode on. Never part of a
// production run — every row is clearly labeled and the apply addresses are
// unroutable, so the send path simulates instead of mailing anyone.

import type { RawJob } from "./opportunities";

export function collectDemoBoard(): RawJob[] {
  return [
    {
      source: "DEMO-Research",
      externalId: "rs-1",
      title: "Undergraduate Research Assistant — ML for Healthcare",
      organization: "Stanford HAI (demo)",
      location: "Stanford, CA",
      remoteOk: false,
      url: "https://example.com/research/ml-health",
      description:
        "Join our lab to build machine learning pipelines for clinical data. " +
        "Requirements: strong Python, PyTorch, Pandas, NumPy; data analysis experience; " +
        "comfort with SQL; statistics background. Minimum 1 year of research experience preferred. " +
        "GPA 3.6+. Email your CV and a short note.",
      applyEmail: "talent@demo-lab.example",
      deadline: "Rolling",
      opportunityType: "research",
    },
    {
      source: "DEMO-Internships",
      externalId: "in-1",
      title: "Software Engineering Intern",
      organization: "Acme Cloud (demo)",
      location: "Remote",
      remoteOk: true,
      url: "https://example.com/intern/acme",
      description:
        "Work with our product team on developer tooling. Looking for: TypeScript, React, " +
        "Node.js, REST APIs, testing discipline, Git. Nice to have: Next.js, Tailwind, GraphQL. " +
        "1+ years of experience building projects. Send your resume by email.",
      applyEmail: "hiring@acme-demo.example",
      deadline: "2026-10-15",
      opportunityType: "internship",
    },
    {
      source: "DEMO-Research",
      externalId: "rs-2",
      title: "Research Intern — Reinforcement Learning",
      organization: "Nordic AI Institute (demo)",
      location: "Stockholm, Sweden (Remote-friendly)",
      remoteOk: true,
      url: "https://example.com/research/rl-intern",
      description:
        "Research intern position in reinforcement learning and robotics. Skills: Python, " +
        "Reinforcement Learning, PyTorch, computer vision basics, Linux, Docker. " +
        "Experience with robotics simulation is a plus. Email applications only.",
      applyEmail: "phd-office@nordic-demo.example",
      opportunityType: "research",
    },
    {
      source: "DEMO-Internships",
      externalId: "in-2",
      title: "Backend Engineering Intern (Go / Python)",
      organization: "Ferrous Systems Inc (demo)",
      location: "Austin, TX",
      remoteOk: false,
      url: "https://example.com/intern/backend",
      description:
        "Build internal services and APIs. Requirements: Go, Python, SQL, Docker, REST APIs, " +
        "system design fundamentals, 1-2 years of experience. Email your CV.",
      applyEmail: "people@ferrous-demo.example",
      opportunityType: "internship",
    },
    {
      source: "DEMO-Data",
      externalId: "da-1",
      title: "Data Analyst, Growth",
      organization: "Cobalt Retail (demo)",
      location: "Remote (EU)",
      remoteOk: true,
      url: "https://example.com/job/analyst",
      description:
        "Analyze funnel and retention data. Requirements: SQL, Python, Pandas, data analysis, " +
        "statistics, dashboards, communication. 2+ years of experience preferred. Apply by email.",
      applyEmail: "jobs@cobalt-demo.example",
      opportunityType: "job",
    },
    {
      source: "DEMO-Scholarship",
      externalId: "sc-1",
      title: "Merit Scholarship for Undergraduate STEM Students",
      organization: "Helios Foundation (demo)",
      location: "Remote / international",
      remoteOk: true,
      url: "https://example.com/scholarships/merit-stem",
      description:
        "Merit scholarship covering tuition and a monthly stipend for undergraduate STEM " +
        "students. Eligibility: enrolled in a Computer Science or engineering program, GPA 3.5+, " +
        "demonstrated project work. Requires one reference letter and a statement of purpose. " +
        "Deadline 2026-11-30. Submit the application form on the foundation portal.",
      deadline: "2026-11-30",
      opportunityType: "scholarship",
    },
    {
      source: "DEMO-Exams",
      externalId: "ex-1",
      title: "Graduate Level Engineering Services Examination — Notification",
      organization: "Public Service Commission (demo)",
      location: "Nationwide",
      remoteOk: false,
      url: "https://example.com/exams/engineering-services",
      description:
        "Government recruitment notification for graduate engineers. Eligibility: bachelor's " +
        "degree in engineering or computer science, age 21-30. Selection: preliminary exam, " +
        "mains exam, interview. Online application closes 2027-01-20. Read the official " +
        "notification before applying and check the syllabus and cutoff.",
      deadline: "2027-01-20",
      opportunityType: "govt-exam",
    },
    {
      source: "DEMO-Fellowship",
      externalId: "fe-1",
      title: "Open Source Fellowship — Data Tooling",
      organization: "Commons Collective (demo)",
      location: "Remote",
      remoteOk: true,
      url: "https://example.com/fellowship/open-source",
      description:
        "Six-month fellowship for students who want to work on open source data tooling. " +
        "Skills: Python, Git, testing, documentation, SQL. Stipend provided. " +
        "Apply with a short project proposal and links to your repositories.",
      applyEmail: "fellowship@commons-demo.example",
      opportunityType: "fellowship",
    },
  ];
}
