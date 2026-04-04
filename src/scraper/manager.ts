import { scrapeSource } from "./apify.js";
import { normalizeApifyPosts } from "./normalizer.js";
import { scrapeSanMiguelLive, scrapeDiscoverSMA } from "./web-scraper.js";
import { deduplicateEvents } from "./dedup.js";
import {
  getActiveSources,
  recordScrapeSuccess,
  recordScrapeFailure,
} from "./health.js";
import { upsertEvent } from "../events/repository.js";
import { extractEvent } from "../llm/extractor.js";
import { getConfig } from "../config.js";
import { getLogger } from "../utils/logger.js";

export interface ScrapeResult {
  sourcesProcessed: number;
  eventsInserted: number;
  duplicatesSkipped: number;
  errors: number;
}

/**
 * Run all scrapers: web aggregators first (free), then Apify for Facebook pages.
 */
export async function runScrapeAll(): Promise<ScrapeResult> {
  const logger = getLogger();
  const config = getConfig();

  const result: ScrapeResult = {
    sourcesProcessed: 0,
    eventsInserted: 0,
    duplicatesSkipped: 0,
    errors: 0,
  };

  // Phase 1: Web scrapers (free, fast)
  logger.info("Starting web scraper phase");
  const webEvents = await runWebScrapers();
  const { unique: webUnique, duplicates: webDups } =
    await deduplicateEvents(webEvents);

  for (const event of webUnique) {
    await upsertEvent(event);
  }

  result.sourcesProcessed += 2;
  result.eventsInserted += webUnique.length;
  result.duplicatesSkipped += webDups;

  logger.info(
    { webEvents: webEvents.length, inserted: webUnique.length, dups: webDups },
    "Web scraper phase complete"
  );

  // Phase 2: Apify Facebook scrapers (paid, slower)
  // Only run if APIFY_API_TOKEN is set and not placeholder
  if (config.APIFY_API_TOKEN && config.APIFY_API_TOKEN !== "placeholder") {
    logger.info("Starting Apify scraper phase");
    const apifyResult = await runApifyScrapers();
    result.sourcesProcessed += apifyResult.sourcesProcessed;
    result.eventsInserted += apifyResult.eventsInserted;
    result.duplicatesSkipped += apifyResult.duplicatesSkipped;
    result.errors += apifyResult.errors;
  } else {
    logger.info("Skipping Apify phase (no API token)");
  }

  logger.info(result, "Full scrape cycle complete");
  return result;
}

/**
 * Scrape web aggregators (sanmiguellive.com, discoversma.com)
 */
async function runWebScrapers(): Promise<ReturnType<typeof scrapeSanMiguelLive> extends Promise<infer T> ? T : never> {
  const logger = getLogger();
  const allEvents = [];

  try {
    const smlEvents = await scrapeSanMiguelLive();
    allEvents.push(...smlEvents);
    logger.info({ count: smlEvents.length }, "sanmiguellive.com scraped");
  } catch (error) {
    logger.error({ error }, "sanmiguellive.com scraper failed");
  }

  try {
    const dsmEvents = await scrapeDiscoverSMA();
    allEvents.push(...dsmEvents);
    logger.info({ count: dsmEvents.length }, "discoversma.com scraped");
  } catch (error) {
    logger.error({ error }, "discoversma.com scraper failed");
  }

  return allEvents;
}

/**
 * Scrape Facebook pages via Apify
 */
async function runApifyScrapers(): Promise<ScrapeResult> {
  const logger = getLogger();
  const config = getConfig();
  const activeSources = await getActiveSources();

  // Only process facebook_page sources
  const fbSources = activeSources.filter(
    (s) => s.type === "facebook_page" && !s.url.includes("sanmiguellive") && !s.url.includes("discoversma")
  );

  const result: ScrapeResult = {
    sourcesProcessed: 0,
    eventsInserted: 0,
    duplicatesSkipped: 0,
    errors: 0,
  };

  for (const source of fbSources) {
    try {
      const rawPosts = await scrapeSource(source.url);
      const normalized = normalizeApifyPosts(
        rawPosts,
        config.DEFAULT_CITY,
        source.url
      );

      for (const event of normalized) {
        if (!event.category || event.category === "other") {
          if (event.rawContent) {
            const extraction = await extractEvent(event.rawContent);
            if (extraction.category) {
              event.category = extraction.category as any;
            }
            if (extraction.neighborhood && !event.neighborhood) {
              event.neighborhood = extraction.neighborhood;
            }
          }
        }
      }

      const { unique, duplicates } = await deduplicateEvents(normalized);

      for (const event of unique) {
        await upsertEvent(event);
      }

      await recordScrapeSuccess(source.id);
      result.sourcesProcessed++;
      result.eventsInserted += unique.length;
      result.duplicatesSkipped += duplicates;

      logger.info(
        { source: source.name, inserted: unique.length, duplicates },
        "Facebook source scraped"
      );
    } catch (error) {
      result.errors++;
      await recordScrapeFailure(source.id);
      logger.error({ error, source: source.name }, "Facebook scrape failed");
    }
  }

  return result;
}
