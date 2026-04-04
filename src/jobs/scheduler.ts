import cron from "node-cron";
import { eq, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { jobState } from "../db/schema.js";
import { getLogger } from "../utils/logger.js";
import { executeScrapeJob } from "./scrape-job.js";
import { executeExpireJob } from "./expire-job.js";
import { executeHealthCheckJob } from "./health-check-job.js";
import { executeDailyDigest } from "./daily-digest.js";
import { executeAlertChecker } from "./alert-checker.js";
import { executeDataQualityJob } from "./data-quality.js";

export async function shouldRunJob(
  jobName: string,
  minIntervalMs: number
): Promise<boolean> {
  const db = getDb();
  const [state] = await db
    .select()
    .from(jobState)
    .where(eq(jobState.jobName, jobName))
    .limit(1);

  if (!state || !state.lastRunAt) return true;
  if (state.status === "running") return false;

  const elapsed = Date.now() - state.lastRunAt.getTime();
  return elapsed >= minIntervalMs;
}

export async function updateJobState(
  jobName: string,
  status: string
): Promise<void> {
  const db = getDb();
  await db
    .insert(jobState)
    .values({
      jobName,
      lastRunAt: new Date(),
      status,
    })
    .onConflictDoUpdate({
      target: jobState.jobName,
      set: {
        lastRunAt: new Date(),
        status,
      },
    });
}

export function startScheduler(): void {
  const logger = getLogger();

  // 9:00 AM SMA (15:00 UTC) - Data quality check + cleanup (runs before digest)
  cron.schedule("0 15 * * *", () => {
    executeDataQualityJob().catch((error) => {
      logger.error({ error }, "Scheduled data quality job failed");
    });
  });

  // 10:00 AM SMA (16:00 UTC) - Daily digest to users
  cron.schedule("0 16 * * *", () => {
    executeDailyDigest().catch((error) => {
      logger.error({ error }, "Scheduled daily digest failed");
    });
  });

  // Every 4 hours - Smart scrape (sanmiguellive + bandsintown always, FB only if needed)
  cron.schedule("0 */4 * * *", () => {
    executeScrapeJob().catch((error) => {
      logger.error({ error }, "Scheduled scrape job failed");
    });
  });

  // Every 1 hour - Expire old events + clean processed messages
  cron.schedule("30 * * * *", () => {
    executeExpireJob().catch((error) => {
      logger.error({ error }, "Scheduled expire job failed");
    });
  });

  // Health check every 30 minutes
  cron.schedule("*/30 * * * *", () => {
    executeHealthCheckJob().catch((error) => {
      logger.error({ error }, "Scheduled health check failed");
    });
  });

  // Alert checker every 2 hours
  cron.schedule("0 */2 * * *", () => {
    executeAlertChecker().catch((error) => {
      logger.error({ error }, "Scheduled alert checker failed");
    });
  });

  logger.info(
    "Scheduler started: quality (9am SMA), digest (10am SMA), scrape (4h), expire (1h), health (30m), alerts (2h)"
  );
}
