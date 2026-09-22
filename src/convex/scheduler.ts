import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { COLLECTORS, collectDemoBoard, type RawJob } from "./collectors";
import { shouldRunForProfile } from "./schedule";
import type { SearchProfile } from "./websearch";

export interface DailyRunReport {
  users: number;
  ran: number;
  skipped: number;
  inserted: number;
  scored: number;
  digests: number;
  /** Applications autopilot sent during this pass. */
  autoApplied: number;
  errors: string[];
}

/**
 * Daily scheduled pipeline: for every profile whose chosen hour has arrived —
 * collect from the configured public sources, ingest (dedupe + blacklist +
 * score), run autopilot if it is armed, then send that user's digest. Runs
 * unattended, so it stays deliberately small and polite: collectors are capped
 * per source and a failure in one never blocks the rest.
 *
 * The cron itself fires hourly at :30 (Convex cron expressions are static), so
 * each profile's own hour — configurable in the profile, default 06:30 UTC —
 * selects which of those passes does the work. `lastDigestAt` prevents a second
 * run in the same day.
 *
 * Autopilot only ever emails roles the user pre-authorised (opt-in, high score,
 * validator-clean, inside its own daily limit and the company cooldown). When
 * it is off, a scheduled run touches nothing but your own dashboard.
 */
export const dailyPipeline = internalAction({
  args: {},
  handler: async (ctx): Promise<DailyRunReport> => {
    const profiles = await ctx.runQuery(internal.private.listProfiles, {});
    const now = Date.now();
    const errors: string[] = [];
    let ran = 0;
    let skipped = 0;
    let inserted = 0;
    let scored = 0;
    let digests = 0;
    let autoApplied = 0;

    // Collect once per distinct search signature and reuse for all users.
    const cache = new Map<string, RawJob[]>();

    for (const profile of profiles) {
      const decision = shouldRunForProfile({
        now,
        digestHourUtc: profile.digestHourUtc,
        lastDigestAt: profile.lastDigestAt,
      });
      if (!decision.run) {
        skipped++;
        continue;
      }
      ran++;

      const terms = (profile.targetRoles.filter(Boolean).length
        ? profile.targetRoles
        : ["software engineer"]
      ).slice(0, 3);
      const location = (profile.locations ?? "").split(/[,\n]/)[0]?.trim() || "";
      const searchProfile: SearchProfile = {
        major: profile.major,
        targetRoles: profile.targetRoles,
        locations: profile.locations,
        country: profile.country,
        opportunityTypes: profile.opportunityTypes,
      };
      const cacheKey = [
        terms.join("|"),
        location,
        profile.country ?? "",
        profile.opportunityTypes.join("|"),
      ].join("::");

      let collected = cache.get(cacheKey);
      if (!collected) {
        collected = [];
        for (const collector of COLLECTORS) {
          if (!collector.configured()) continue;
          if (collector.enabledFor && !collector.enabledFor(searchProfile)) continue;
          try {
            collected.push(
              ...(await collector.run({
                searchTerms: terms,
                location,
                profile: searchProfile,
              })),
            );
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

        // Autopilot is a no-op unless the user armed it.
        const driven = await ctx.runAction(internal.autopilot.autopilotForUser, {
          userId: profile.userId,
        });
        autoApplied += driven.applied.length;

        await ctx.runMutation(internal.private.logActivity, {
          userId: profile.userId,
          action: "scheduled daily run",
          detail: `${result.inserted} new · ${scoreResult.scored} rescored · ${scoreResult.shortlisted} shortlisted · ${driven.applied.length} auto-applied · ${decision.hourUtc}:30 UTC`,
        });

        const digest = await ctx.runAction(internal.digest.sendDigestForUser, {
          userId: profile.userId,
        });
        if (digest.emailed || digest.telegram) digests++;
      } catch (err) {
        errors.push(err instanceof Error ? err.message : "user run failed");
      }
    }

    return {
      users: profiles.length,
      ran,
      skipped,
      inserted,
      scored,
      digests,
      autoApplied,
      errors,
    };
  },
});
