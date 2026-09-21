import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { COLLECTORS, collectDemoBoard, type RawJob } from "./collectors";

export interface DailyRunReport {
  users: number;
  inserted: number;
  scored: number;
  digests: number;
  errors: string[];
}

/**
 * Daily scheduled pipeline: for every profile — collect from the configured
 * public sources, ingest (dedupe + blacklist + score), then send that user's
 * digest. Runs unattended, so it stays deliberately small and polite:
 * collectors are capped per source and a failure in one never blocks the rest.
 */
export const dailyPipeline = internalAction({
  args: {},
  handler: async (ctx): Promise<DailyRunReport> => {
    const profiles = await ctx.runQuery(internal.private.listProfiles, {});
    const errors: string[] = [];
    let inserted = 0;
    let scored = 0;
    let digests = 0;

    // Collect once per distinct search term set and reuse for all users.
    const cache = new Map<string, RawJob[]>();

    for (const profile of profiles) {
      const terms = (profile.targetRoles.filter(Boolean).length
        ? profile.targetRoles
        : ["software engineer"]
      ).slice(0, 3);
      const location = (profile.locations ?? "").split(/[,\n]/)[0]?.trim() || "";
      const cacheKey = `${terms.join("|")}::${location}`;

      let collected = cache.get(cacheKey);
      if (!collected) {
        collected = [];
        for (const collector of COLLECTORS) {
          if (!collector.configured()) continue;
          try {
            collected.push(...(await collector.run(terms, location)));
          } catch (err) {
            errors.push(
              `${collector.name}: ${err instanceof Error ? err.message : "failed"}`,
            );
          }
        }
        if (profile.demoMode === true) collected.push(...collectDemoBoard());
        cache.set(cacheKey, collected);
      }

      try {
        const result = await ctx.runMutation(internal.private.ingestJobsForUser, {
          userId: profile.userId,
          jobs: collected.map((j) => ({
            ...j,
            description: j.description?.slice(0, 4000),
          })),
        });
        inserted += result.inserted;

        const scoreResult = await ctx.runMutation(internal.private.scoreAllForUser, {
          userId: profile.userId,
        });
        scored += scoreResult.scored;

        await ctx.runMutation(internal.private.logActivity, {
          userId: profile.userId,
          action: "scheduled daily run",
          detail: `${result.inserted} new · ${scoreResult.scored} rescored · ${scoreResult.shortlisted} shortlisted`,
        });

        const digest = await ctx.runAction(internal.digest.sendDigestForUser, {
          userId: profile.userId,
        });
        if (digest.emailed || digest.telegram) digests++;
      } catch (err) {
        errors.push(err instanceof Error ? err.message : "user run failed");
      }
    }

    return { users: profiles.length, inserted, scored, digests, errors };
  },
});
