// Curated Skill-to-Course Recommendation Map
// Connects identified skill gaps to free, high-quality, reputable learning resources
// (freeCodeCamp, Harvard CS50, MIT OpenCourseWare, Kaggle, Official Guides).
// Pure module: deterministic, no external network requests, unit testable.

export interface CourseResource {
  title: string;
  provider: string;
  url: string;
  type: "interactive" | "video-course" | "official-guide" | "free-certification";
  estimatedDuration?: string;
  freeTier: boolean;
}

export interface SkillCourseRecommendation {
  skill: string;
  resources: CourseResource[];
}

export const SKILL_COURSE_CATALOG: Record<string, CourseResource[]> = {
  Python: [
    {
      title: "Scientific Computing with Python Certification",
      provider: "freeCodeCamp",
      url: "https://www.freecodecamp.org/learn/scientific-computing-with-python/",
      type: "free-certification",
      estimatedDuration: "20 hours",
      freeTier: true,
    },
    {
      title: "CS50's Introduction to Programming with Python",
      provider: "Harvard University (edX)",
      url: "https://cs50.harvard.edu/python/",
      type: "video-course",
      estimatedDuration: "10 weeks",
      freeTier: true,
    },
  ],
  SQL: [
    {
      title: "Interactive SQL Tutorials & Lessons",
      provider: "SQLBolt",
      url: "https://sqlbolt.com/",
      type: "interactive",
      estimatedDuration: "4 hours",
      freeTier: true,
    },
    {
      title: "Relational Database Certification",
      provider: "freeCodeCamp",
      url: "https://www.freecodecamp.org/learn/relational-database/",
      type: "free-certification",
      estimatedDuration: "25 hours",
      freeTier: true,
    },
  ],
  TypeScript: [
    {
      title: "TypeScript for JavaScript Programmers",
      provider: "Official TypeScript Handbook",
      url: "https://www.typescriptlang.org/docs/handbook/typescript-in-5-minutes.html",
      type: "official-guide",
      estimatedDuration: "3 hours",
      freeTier: true,
    },
    {
      title: "Learn TypeScript - Full Course for Beginners",
      provider: "freeCodeCamp",
      url: "https://www.youtube.com/watch?v=gp5H0Vw39kE",
      type: "video-course",
      estimatedDuration: "4 hours",
      freeTier: true,
    },
  ],
  React: [
    {
      title: "Quick Start & Deep Dive Tutorial",
      provider: "React Official Documentation",
      url: "https://react.dev/learn",
      type: "interactive",
      estimatedDuration: "8 hours",
      freeTier: true,
    },
    {
      title: "Front End Development Libraries (React)",
      provider: "freeCodeCamp",
      url: "https://www.freecodecamp.org/learn/front-end-development-libraries/",
      type: "free-certification",
      estimatedDuration: "30 hours",
      freeTier: true,
    },
  ],
  Docker: [
    {
      title: "Docker Curriculum: A Hands-on Guide",
      provider: "DockerCurriculum",
      url: "https://docker-curriculum.com/",
      type: "interactive",
      estimatedDuration: "3 hours",
      freeTier: true,
    },
    {
      title: "Play with Docker Interactive Labs",
      provider: "Docker Official",
      url: "https://labs.play-with-docker.com/",
      type: "interactive",
      estimatedDuration: "5 hours",
      freeTier: true,
    },
  ],
  Kubernetes: [
    {
      title: "Kubernetes Basics Tutorial",
      provider: "Kubernetes Official Docs",
      url: "https://kubernetes.io/docs/tutorials/kubernetes-basics/",
      type: "interactive",
      estimatedDuration: "4 hours",
      freeTier: true,
    },
  ],
  Git: [
    {
      title: "Learn Git Branching - Visual Interactive Guide",
      provider: "LearnGitBranching",
      url: "https://learngitbranching.js.org/",
      type: "interactive",
      estimatedDuration: "2 hours",
      freeTier: true,
    },
    {
      title: "Git & GitHub for Beginners - Full Course",
      provider: "freeCodeCamp",
      url: "https://www.youtube.com/watch?v=RGOj5yH7evk",
      type: "video-course",
      estimatedDuration: "1.5 hours",
      freeTier: true,
    },
  ],
  Linux: [
    {
      title: "Linux Survival - Interactive Shell Tutorial",
      provider: "LinuxSurvival",
      url: "https://linuxsurvival.com/",
      type: "interactive",
      estimatedDuration: "3 hours",
      freeTier: true,
    },
  ],
  "Machine Learning": [
    {
      title: "Machine Learning Crash Course",
      provider: "Google Developers",
      url: "https://developers.google.com/machine-learning/crash-course",
      type: "interactive",
      estimatedDuration: "15 hours",
      freeTier: true,
    },
    {
      title: "Intro to Machine Learning",
      provider: "Kaggle Learn",
      url: "https://www.kaggle.com/learn/intro-to-machine-learning",
      type: "interactive",
      estimatedDuration: "3 hours",
      freeTier: true,
    },
  ],
  PyTorch: [
    {
      title: "Deep Learning with PyTorch: A 60 Minute Blitz",
      provider: "PyTorch Official",
      url: "https://pytorch.org/tutorials/beginner/deep_learning_60min_blitz.html",
      type: "official-guide",
      estimatedDuration: "2 hours",
      freeTier: true,
    },
  ],
  Pandas: [
    {
      title: "Pandas Micro-Course for Data Science",
      provider: "Kaggle Learn",
      url: "https://www.kaggle.com/learn/pandas",
      type: "interactive",
      estimatedDuration: "4 hours",
      freeTier: true,
    },
  ],
  "REST APIs": [
    {
      title: "REST API Design Best Practices Guide",
      provider: "Red Hat Developer",
      url: "https://www.redhat.com/en/topics/api/what-is-a-rest-api",
      type: "official-guide",
      estimatedDuration: "2 hours",
      freeTier: true,
    },
  ],
  FastAPI: [
    {
      title: "FastAPI Official Tutorial & User Guide",
      provider: "FastAPI Documentation",
      url: "https://fastapi.tiangolo.com/tutorial/",
      type: "interactive",
      estimatedDuration: "5 hours",
      freeTier: true,
    },
  ],
  AWS: [
    {
      title: "AWS Cloud Practitioner Essentials",
      provider: "AWS Skill Builder",
      url: "https://explore.skillbuilder.aws/learn/course/external/view/elearning/134/aws-cloud-practitioner-essentials",
      type: "video-course",
      estimatedDuration: "6 hours",
      freeTier: true,
    },
  ],
};

/**
 * Returns free course recommendations for given missing skills.
 */
export function getRecommendedCoursesForSkills(
  skills: string[],
  limitPerSkill: number = 2,
): SkillCourseRecommendation[] {
  const recommendations: SkillCourseRecommendation[] = [];

  for (const skill of skills) {
    // Exact or normalized lookup
    const canonicalKey = Object.keys(SKILL_COURSE_CATALOG).find(
      (k) => k.toLowerCase() === skill.trim().toLowerCase(),
    );

    if (canonicalKey && SKILL_COURSE_CATALOG[canonicalKey]?.length) {
      recommendations.push({
        skill: canonicalKey,
        resources: SKILL_COURSE_CATALOG[canonicalKey].slice(0, limitPerSkill),
      });
    }
  }

  return recommendations;
}
