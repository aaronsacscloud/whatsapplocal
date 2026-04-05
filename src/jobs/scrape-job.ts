import { runScrapeAll, runSmartScrape } from "../scraper/manager.js";
import { fillMissingImages } from "../scraper/image-filler.js";
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

  logger.info("Scrape job starting (smart mode)");

  try {
    await updateJobState(JOB_NAME, "running");
    const result = await runSmartScrape();

    // Fill missing images from event source pages
    try {
      const imagesFilled = await fillMissingImages();
      if (imagesFilled > 0) {
        logger.info({ imagesFilled }, "Filled missing event images");
      }
    } catch (imgError) {
      logger.warn({ error: imgError }, "Image fill step failed (non-critical)");
    }

    await updateJobState(JOB_NAME, "idle");

    logger.info(result, "Scrape job completed");
  } catch (error) {
    await updateJobState(JOB_NAME, "error");
    logger.error({ error }, "Scrape job failed");
  }
}
