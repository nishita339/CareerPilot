import { getAuthUserId } from "@convex-dev/auth/server";
import { action, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  COLLECTORS,
  collectDemoBoard,
  collectorStatuses,
  type RawJob,
} from "./collectors";
import type { SearchProfile } from "./websearch";

export interface CollectSummary {
  fetched: number;
  inserted: number;
  /** Listings skipped because the same role was already tracked. */
  deduped: number;
  blacklisted: number;
  ran: string[];
  skipped: { name: string; reason: string }[];
  errors: string[];
  demoMode: boolean;
}

/** Everything a collector needs to know about the student. */
function searchProfileFor(profile: {
  major: string;
  targetRoles: string[];
  locations?: string;
  country?: string;
  opportunityTypes: string[];
}): SearchProfile {
  return {
    major: profile.major,
    targetRoles: profile.targetRoles,
    locations: profile.locations,
    country: profile.country,
    opportunityTypes: profile.opportunityTypes,
  };
}

/** Runs the configured collectors, then dedupes, filters and scores. */
export const collect = action({
  args: {},
  handler: async (ctx): Promise<CollectSummary> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in required.");

    const { profile } = await ctx.runQuery(internal.private.getMyData, {});
    if (!profile) throw new Error("Complete your Master Profile first.");

    const searchTerms = profile.targetRoles.filter(Boolean).slice(0, 3);
    if (searchTerms.length === 0) searchTerms.push("software engineer");
    const location =
      (profile.locations ?? "").split(/[,\n]/)[0]?.trim() || "";
    const searchProfile = searchProfileFor(profile);

    const collected: RawJob[] = [];
    const ran: string[] = [];
    const skipped: { name: string; reason: string }[] = [];
    const errors: string[] = [];

    for (const collector of COLLECTORS) {
      if (!collector.configured()) {
        skipped.push({
          name: collector.name,
          reason: `needs ${collector.requiresEnv.join(" + ")} in the project environment`,
        });
        continue;
      }
      if (collector.enabledFor && !collector.enabledFor(searchProfile)) {
        skipped.push({
          name: collector.name,
          reason: "not one of your selected opportunity types",
        });
        continue;
      }
      try {
        const jobs = await collector.run({
          searchTerms,
          location,
          profile: searchProfile,
        });
        collected.push(...jobs);
        ran.push(collector.name);
      } catch (err) {
        // One failing collector must never crash the run.
        errors.push(
          `${collector.name}: ${err instanceof Error ? err.message : "failed"}`,
        );
      }
    }

    const demoMode = profile.demoMode === true;
    if (demoMode) {
      collected.push(...collectDemoBoard());
      ran.push("DemoBoard");
    }

    const result = await ctx.runMutation(internal.private.ingestJobs, {
      jobs: collected.map((j) => ({
        ...j,
        description: j.description?.slice(0, 4000),
      })),
    });

    return {
      fetched: collected.length,
      inserted: result.inserted,
      deduped: result.duplicates,
      blacklisted: result.blacklisted,
      ran,
      skipped,
      errors,
      demoMode,
    };
  },
});

/** Which collectors are usable right now — names only, never key values. */
export const collectorStatus = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    const profile = userId
      ? await ctx.db
          .query("profiles")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .unique()
      : null;
    const statuses = collectorStatuses(
      profile ? searchProfileFor(profile) : undefined,
    );
    return {
      collectors: statuses,
      configuredCount: statuses.filter((s) => s.configured).length,
      enabledCount: statuses.filter((s) => s.configured && s.enabled).length,
      demoMode: profile?.demoMode === true,
    };
  },
});

void v;
