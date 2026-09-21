// Skill taxonomy + normalized matching. Deterministic, no LLM, no network.

/** Canonical skill name -> aliases (matched case-insensitively in text). */
export const SKILL_TAXONOMY: Record<string, string[]> = {
  Python: ["python", "python3"],
  TypeScript: ["typescript", " ts"],
  JavaScript: ["javascript", " js", "es6"],
  Java: ["java"],
  "C++": ["c++", "cpp"],
  Go: ["golang"],
  Rust: ["rust"],
  SQL: ["sql", "postgres", "postgresql", "mysql", "sqlite"],
  React: ["react", "reactjs", "react.js"],
  "Node.js": ["node", "nodejs", "node.js"],
  PyTorch: ["pytorch", "torch"],
  TensorFlow: ["tensorflow", "keras"],
  Pandas: ["pandas"],
  NumPy: ["numpy", "numpy "],
  scikit: ["scikit-learn", "sklearn", "scikit learn"],
  "Machine Learning": ["machine learning", "ml models", "deep learning", "neural network"],
  "Data Analysis": ["data analysis", "data analytics", "data mining"],
  "Computer Vision": ["computer vision", "opencv", "image recognition"],
  NLP: ["nlp", "natural language processing", "language models"],
  "Reinforcement Learning": ["reinforcement learning", "rl agent", "policy gradient"],
  Docker: ["docker", "containeriz"],
  Kubernetes: ["kubernetes", "k8s"],
  AWS: ["aws", "amazon web services", "s3", "ec2", "lambda"],
  Git: ["git", "github", "version control"],
  Linux: ["linux", "unix", "bash", "shell"],
  "REST APIs": ["rest api", "restful", "api development", "api integration"],
  GraphQL: ["graphql"],
  Testing: ["unit test", "pytest", "jest", "testing"],
  Statistics: ["statistics", "statistical", "probability"],
  "MATLAB / R": ["matlab", "r language", "rstudio"],
  "Next.js": ["next.js", "nextjs"],
  Tailwind: ["tailwind"],
  FastAPI: ["fastapi"],
  Django: ["django"],
  Flask: ["flask"],
  MongoDB: ["mongodb", "mongo"],
  Spark: ["spark", "pyspark"],
  "System Design": ["system design", "distributed systems"],
  "Embedded C": ["embedded c", "microcontroller", "firmware"],
  Networking: ["networking", "tcp/ip", "network protocol"],
};

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** All alias patterns -> canonical skill, longest aliases first. */
const ALIASES: { alias: string; skill: string }[] = Object.entries(
  SKILL_TAXONOMY,
).flatMap(([skill, aliases]) =>
  [skill.toLowerCase(), ...aliases.map((a) => a.toLowerCase())].map(
    (alias) => ({ alias, skill }),
  ),
);

const sortedAliases = () => {
  if (!cachedAliases) {
    cachedAliases = [...ALIASES].sort((a, b) => b.alias.length - a.alias.length);
  }
  return cachedAliases;
};
let cachedAliases: { alias: string; skill: string }[] | null = null;

/** Normalize skill names so "pytorch" and "PyTorch" compare equal. */
export function normalizeSkill(name: string): string {
  const lower = name.trim().toLowerCase();
  const hit = sortedAliases().find((a) => a.alias === lower);
  return hit ? hit.skill : name.trim().replace(/\s+/g, " ");
}

function matchInText(text: string, alias: string): boolean {
  const pattern = new RegExp(`(^|[^a-z0-9+#])${escapeRe(alias)}([^a-z0-9+#]|$)`);
  return pattern.test(text);
}

/** Detect taxonomy skills mentioned in free text (a JD or a resume line). */
export function extractSkills(text: string): string[] {
  if (!text) return [];
  const lower = ` ${text.toLowerCase()} `;
  const found: string[] = [];
  for (const { alias, skill } of sortedAliases()) {
    if (found.includes(skill)) continue;
    if (matchInText(lower, alias)) found.push(skill);
  }
  return found;
}

/** Parse a comma/newline separated skill list from the profile form. */
export function parseSkillList(raw: string | undefined | null): string[] {
  if (!raw) return [];
  const parts = raw
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const canon = normalizeSkill(p);
    const key = canon.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(canon);
    }
  }
  return out;
}

/** Jaccard similarity over word sets — used by the fuzzy deduplicator. */
export function similarity(a: string, b: string): number {
  const words = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 1),
    );
  const sa = words(a);
  const sb = words(b);
  if (sa.size === 0 && sb.size === 0) return 1;
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const w of sa) if (sb.has(w)) inter++;
  return inter / (sa.size + sb.size - inter);
}
