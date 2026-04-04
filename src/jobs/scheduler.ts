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

  // Scrape every 4 hours
  cron.schedule("0 */4 * * *", () => {
    executeScrapeJob().catch((error) => {
      logger.error({ error }, "Scheduled scrape job failed");
    });
  });

  // Expire old events every hour
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

  // Daily digest at 10:00 AM SMA time (16:00 UTC)
  cron.schedule("0 16 * * *", () => {
    executeDailyDigest().catch((error) => {
      logger.error({ error }, "Scheduled daily digest failed");
    });
  });

  // Alert checker every 2 hours
  cron.schedule("0 */2 * * *", () => {
    executeAlertChecker().catch((error) => {
      logger.error({ error }, "Scheduled alert checker failed");
    });
  });

  logger.info("Scheduler started: scrape (4h), expire (1h), health (30m), digest (daily 10am SMA), alerts (2h)");
}
