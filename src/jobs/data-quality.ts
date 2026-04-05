import { sql, and, gte, lte, lt } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { events } from "../db/schema.js";
import { crossSourceDedup } from "../scraper/smart-dedup.js";
import { recalculateAllFreshness } from "../scraper/freshness.js";
import { deleteEventsOlderThan } from "../events/repository.js";
import { getConfig } from "../config.js";
import { getLogger } from "../utils/logger.js";
import { updateJobState, shouldRunJob } from "./scheduler.js";

const JOB_NAME = "data-quality";
const MIN_INTERVAL_MS = 20 * 60 * 60 * 1000; // 20 hours minimum between runs

export interface QualityReport {
  eventsPerDay: Array<{ date: string; count: number }>;
  lowCoverageDays: string[];
  completeness: {
    withImage: number;
    withPrice: number;
    withDescription: number;
    withVenue: number;
    total: number;
  };
  dedupReport: {
    pairsChecked: number;
    pairsConfirmed: number;
    eventsMerged: number;
    eventsDeleted: number;
  };
  freshnessUpdated: number;
  oldEventsRemoved: number;
  lowConfidenceRemoved: number;
}

/**
 * Run the daily data quality check.
 * Called at 9:00 AM SMA time (15:00 UTC) before the daily digest.
 */
export async function runDataQualityCheck(): Promise<QualityReport> {
  const logger = getLogger();
  const db = getDb();
  const config = getConfig();

  logger.info("Data quality check starting");

  const report: QualityReport = {
    eventsPerDay: [],
    lowCoverageDays: [],
    completeness: { withImage: 0, withPrice: 0, withDescription: 0, withVenue: 0, total: 0 },
    dedupReport: { pairsChecked: 0, pairsConfirmed: 0, eventsMerged: 0, eventsDeleted: 0 },
    freshnessUpdated: 0,
    oldEventsRemoved: 0,
    lowConfidenceRemoved: 0,
  };

  // ─── Step 1: Count events per day for next 7 days ─────────────────
  const now = new Date();
  const sma = new Date(now.getTime() - 6 * 3600000);

  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const dayStart = new Date(
      Date.UTC(sma.getUTCFullYear(), sma.getUTCMonth(), sma.getUTCDate() + dayOffset, 6, 0, 0)
    );
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    const result = await db
      .select({ cnt: sql<number>`COUNT(*)` })
      .from(events)
      .where(
        and(
          sql`${events.city} = ${config.DEFAULT_CITY}`,
          gte(events.eventDate, dayStart),
          lt(events.eventDate, dayEnd)
        )
      );

    const count = Number((result as unknown as Array<{ cnt: string }>)[0]?.cnt) || 0;
    const dateStr = dayStart.toISOString().split("T")[0];
    report.eventsPerDay.push({ date: dateStr, count });

    if (count < 3) {
      report.lowCoverageDays.push(dateStr);
    }
  }

  if (report.lowCoverageDays.length > 0) {
    logger.warn(
      { lowCoverageDays: report.lowCoverageDays },
      "Low event coverage detected for upcoming days"
    );
  }

  // ─── Step 2: Calculate completeness ────────────────────────────────
  const futureStart = new Date(
    Date.UTC(sma.getUTCFullYear(), sma.getUTCMonth(), sma.getUTCDate(), 6, 0, 0)
  );

  const completenessResult = await db
    .select({
      total: sql<number>`COUNT(*)`,
      withImage: sql<number>`COUNT(CASE WHEN ${events.imageUrl} IS NOT NULL THEN 1 END)`,
      withPrice: sql<number>`COUNT(CASE WHEN ${events.price} IS NOT NULL THEN 1 END)`,
      withDescription: sql<number>`COUNT(CASE WHEN ${events.description} IS NOT NULL AND LENGTH(${events.description}) > 10 THEN 1 END)`,
      withVenue: sql<number>`COUNT(CASE WHEN ${events.venueAddress} IS NOT NULL THEN 1 END)`,
    })
    .from(events)
    .where(
      and(
        sql`${events.city} = ${config.DEFAULT_CITY}`,
        gte(events.eventDate, futureStart)
      )
    );

  const c = completenessResult[0];
  report.completeness = {
    total: Number(c?.total) || 0,
    withImage: Number(c?.withImage) || 0,
    withPrice: Number(c?.withPrice) || 0,
    withDescription: Number(c?.withDescription) || 0,
    withVenue: Number(c?.withVenue) || 0,
  };

  // ─── Step 3: Cross-source deduplication ────────────────────────────
  try {
    report.dedupReport = await crossSourceDedup();
  } catch (error) {
    logger.error({ error }, "Cross-source dedup failed during quality check");
  }

  // ─── Step 4: Freshness recalculation ───────────────────────────────
  try {
    report.freshnessUpdated = await recalculateAllFreshness();
  } catch (error) {
    logger.error({ error }, "Freshness recalculation failed during quality check");
  }

  // ─── Step 5: Remove events older than yesterday ────────────────────
  try {
    const yesterday = new Date(
      Date.UTC(sma.getUTCFullYear(), sma.getUTCMonth(), sma.getUTCDate() - 1, 6, 0, 0)
    );
    report.oldEventsRemoved = await deleteEventsOlderThan(yesterday);
  } catch (error) {
    logger.error({ error }, "Old event removal failed during quality check");
  }

  // ─── Step 6: Remove events with confidence < 0.3 ──────────────────
  try {
    const lowConfResult = await db
      .delete(events)
      .where(
        and(
          sql`${events.confidence} IS NOT NULL`,
          lt(events.confidence, 0.3)
        )
      )
      .returning({ id: events.id });

    report.lowConfidenceRemoved = lowConfResult.length;
  } catch (error) {
    logger.error({ error }, "Low confidence removal failed during quality check");
  }

  // ─── Log final report ──────────────────────────────────────────────
  logger.info(
    {
      eventsPerDay: report.eventsPerDay,
      lowCoverageDays: report.lowCoverageDays,
      completeness: report.completeness,
      dedup: report.dedupReport,
      freshnessUpdated: report.freshnessUpdated,
      oldEventsRemoved: report.oldEventsRemoved,
      lowConfidenceRemoved: report.lowConfidenceRemoved,
    },
    "Data quality check complete"
  );

  return report;
}

/**
 * Execute the data quality job with job state tracking.
 */
export async function executeDataQualityJob(): Promise<void> {
  const logger = getLogger();

  const canRun = await shouldRunJob(JOB_NAME, MIN_INTERVAL_MS);
  if (!canRun) {
    logger.debug("Data quality job skipped: too soon since last run");
    return;
  }

  logger.info("Data quality job starting");

  try {
    await updateJobState(JOB_NAME, "running");
    const report = await runDataQualityCheck();
    await updateJobState(JOB_NAME, "idle");

    logger.info(
      {
        eventsPerDay: report.eventsPerDay.map((d) => `${d.date}: ${d.count}`),
        lowCoverage: report.lowCoverageDays.length,
        merged: report.dedupReport.eventsMerged,
        oldRemoved: report.oldEventsRemoved,
        lowConfRemoved: report.lowConfidenceRemoved,
      },
      "Data quality job completed"
    );
  } catch (error) {
    await updateJobState(JOB_NAME, "error");
    logger.error({ error }, "Data quality job failed");
  }
}
