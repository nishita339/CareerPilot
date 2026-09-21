import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
import { SCHEDULE_DEFAULTS } from "./schedule";

const crons = cronJobs();

// Convex cron expressions are static, so this fires hourly at :30 and
// `scheduler.dailyPipeline` runs only the profiles whose chosen hour matches
// (configurable in the Master Profile, default 06:30 UTC = 12:00 IST).
// Each profile therefore gets exactly one polite daily pass: collect from
// configured public sources, score, and email the digest. Well below any
// platform's rate limits, and no applications are ever sent from a scheduled
// run — sending requires your approval.
crons.hourly(
  "hourly tick: run each profile at its own digest hour",
  { minuteUTC: SCHEDULE_DEFAULTS.MINUTE_UTC },
  internal.scheduler.dailyPipeline,
);

export default crons;
