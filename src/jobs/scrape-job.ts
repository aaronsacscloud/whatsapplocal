import { runScrapeAll } from "../scraper/manager.js";
import { getLogger } from "../utils/logger.js";
import { updateJobState, shouldRunJob } from "./scheduler.js";

const JOB_NAME = "scrape";
const MIN_INTERVAL_MS = 3 * 60 * 60 * 1000; // 3 hours minimum between runs

export async function executeScrapeJob(): Promise<void> {
  const logger = getLogger();

  const canRun = await shouldRunJob(JOB_NAME, MIN_INTERVAL_MS);
  if (!canRun) {
    logger.debug("Scrape job skipped: too soon since last run");
    return;
  }

  logger.info("Scrape job starting");

  try {
    await updateJobState(JOB_NAME, "running");
    const result = await runScrapeAll();
    await updateJobState(JOB_NAME, "idle");

    logger.info(result, "Scrape job completed");
  } catch (error) {
    await updateJobState(JOB_NAME, "error");
    logger.error({ error }, "Scrape job failed");
  }
}
