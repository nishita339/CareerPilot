import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// One polite daily pass: collect from configured public sources, score, and
// email each user their digest. Well below any platform's rate limits, and no
// applications are ever sent from a scheduled run — sending requires approval.
crons.daily(
  "daily collect, score and digest",
  { hourUTC: 6, minuteUTC: 30 },
  internal.scheduler.dailyPipeline,
);

export default crons;
