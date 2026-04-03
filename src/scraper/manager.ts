import { scrapeSource } from "./apify.js";
import { normalizeApifyEvents } from "./normalizer.js";
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

export async function runScrapeAll(): Promise<ScrapeResult> {
  const logger = getLogger();
  const config = getConfig();
  const activeSources = await getActiveSources();

  const result: ScrapeResult = {
    sourcesProcessed: 0,
    eventsInserted: 0,
    duplicatesSkipped: 0,
    errors: 0,
  };

  logger.info(
    { sourceCount: activeSources.length },
    "Starting scrape cycle"
  );

  for (const source of activeSources) {
    try {
      const rawEvents = await scrapeSource(source.url);
      const normalized = normalizeApifyEvents(
        rawEvents,
        config.DEFAULT_CITY,
        source.url
      );

      // Enrich events that lack structured fields
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
        {
          source: source.name,
          raw: rawEvents.length,
          normalized: normalized.length,
          inserted: unique.length,
          duplicates,
        },
        "Source scraped successfully"
      );
    } catch (error) {
      result.errors++;
      await recordScrapeFailure(source.id);
      logger.error(
        { error, source: source.name },
        "Failed to scrape source"
      );
    }
  }

  logger.info(result, "Scrape cycle complete");
  return result;
}
