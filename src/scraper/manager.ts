import { scrapeSource } from "./apify.js";
import { normalizeApifyPost } from "./normalizer.js";
import { scrapeSanMiguelLive, scrapeDiscoverSMA } from "./web-scraper.js";
import { scrapeEventbrite, scrapeBandsintown } from "./platform-scraper.js";
import { deduplicateEvents } from "./dedup.js";
import {
  getActiveSources,
  recordScrapeSuccess,
  recordScrapeFailure,
} from "./health.js";
import { updateSourceQuality, getSourcesByQuality, shouldSkipSource } from "./source-quality.js";
import { upsertEvent, countEventsForDate, deleteEventsOlderThan } from "../events/repository.js";
import { analyzeEventImage, enrichEventWithImageData } from "./image-enricher.js";
import { validateAndSanitize } from "./validator.js";
import { crossSourceDedup } from "./smart-dedup.js";
import { recalculateAllFreshness } from "./freshness.js";
import type { NewEvent } from "../db/schema.js";
import { scrapeLogs } from "../db/schema.js";
import { getDb } from "../db/index.js";
import type { ApifyFacebookPost } from "./apify.js";
import { extractEvent } from "../llm/extractor.js";
import { getConfig } from "../config.js";
import { getLogger } from "../utils/logger.js";

/**
 * Log a scrape run to the scrape_logs table.
 */
async function logScrapeRun(
  trigger: string,
  startedAt: Date,
  result: ScrapeResult
): Promise<void> {
  try {
    const db = getDb();
    await db.insert(scrapeLogs).values({
      startedAt,
      completedAt: new Date(),
      sourcesProcessed: result.sourcesProcessed,
      eventsInserted: result.eventsInserted,
      eventsRejected: result.eventsRejected,
      duplicatesMerged: result.duplicatesMerged,
      errors: result.errors,
      trigger,
      details: {
        duplicatesSkipped: result.duplicatesSkipped,
      },
    });
  } catch (error) {
    const logger = getLogger();
    logger.error({ error }, "Failed to log scrape run");
  }
}

export interface ScrapeResult {
  sourcesProcessed: number;
  eventsInserted: number;
  duplicatesSkipped: number;
  eventsRejected: number;
  duplicatesMerged: number;
  errors: number;
}

/**
 * Run all scrapers: web aggregators first (free), then Apify for Facebook pages.
 */
export async function runScrapeAll(trigger = "manual"): Promise<ScrapeResult> {
  const logger = getLogger();
  const config = getConfig();
  const scrapeStartedAt = new Date();

  const result: ScrapeResult = {
    sourcesProcessed: 0,
    eventsInserted: 0,
    duplicatesSkipped: 0,
    eventsRejected: 0,
    duplicatesMerged: 0,
    errors: 0,
  };

  // Phase 1: Web scrapers (free, fast)
  logger.info("Starting web scraper phase");
  const webEvents = await runWebScrapers();
  const { valid: webValidated, rejected: webRejected } = validateAndSanitize(webEvents);
  result.eventsRejected += webRejected;
  const { unique: webUnique, duplicates: webDups } =
    await deduplicateEvents(webValidated);

  for (const event of webUnique) {
    await upsertEvent({ ...event, scrapedAt: new Date() });
  }

  result.sourcesProcessed += 2;
  result.eventsInserted += webUnique.length;
  result.duplicatesSkipped += webDups;

  logger.info(
    { webEvents: webEvents.length, validated: webValidated.length, inserted: webUnique.length, dups: webDups, rejected: webRejected },
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
    result.eventsRejected += apifyResult.eventsRejected;
    result.errors += apifyResult.errors;
  } else {
    logger.info("Skipping Apify phase (no API token)");
  }

  // Phase 3: Platform scrapers (Eventbrite, Bandsintown - free)
  logger.info("Starting platform scraper phase");
  const platformEvents = await runPlatformScrapers();
  const { valid: platValidated, rejected: platRejected } = validateAndSanitize(platformEvents);
  result.eventsRejected += platRejected;
  const { unique: platUnique, duplicates: platDups } =
    await deduplicateEvents(platValidated);

  for (const event of platUnique) {
    await upsertEvent({ ...event, scrapedAt: new Date() });
  }

  result.sourcesProcessed += 2;
  result.eventsInserted += platUnique.length;
  result.duplicatesSkipped += platDups;

  logger.info(
    { platformEvents: platformEvents.length, inserted: platUnique.length },
    "Platform scraper phase complete"
  );

  // Phase 4: Cross-source dedup + freshness
  try {
    const dedupReport = await crossSourceDedup();
    result.duplicatesMerged += dedupReport.eventsMerged;
    logger.info(dedupReport, "Cross-source dedup complete");
  } catch (error) {
    logger.error({ error }, "Cross-source dedup failed");
  }

  try {
    await recalculateAllFreshness();
  } catch (error) {
    logger.error({ error }, "Freshness recalculation failed");
  }

  logger.info(result, "Full scrape cycle complete");
  await logScrapeRun(trigger, scrapeStartedAt, result);
  return result;
}

/**
 * Scrape platforms (Eventbrite, Bandsintown)
 */
async function runPlatformScrapers(): Promise<NewEvent[]> {
  const logger = getLogger();
  const allEvents: NewEvent[] = [];

  try {
    const ebEvents = await scrapeEventbrite();
    allEvents.push(...ebEvents);
    logger.info({ count: ebEvents.length }, "Eventbrite scraped");
  } catch (error) {
    logger.error({ error }, "Eventbrite scraper failed");
  }

  try {
    const bitEvents = await scrapeBandsintown();
    allEvents.push(...bitEvents);
    logger.info({ count: bitEvents.length }, "Bandsintown scraped");
  } catch (error) {
    logger.error({ error }, "Bandsintown scraper failed");
  }

  return allEvents;
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
 * Smart scrape: run free scrapers always, only scrape Facebook if we need more events.
 * Also cleans up old events.
 */
export async function runSmartScrape(trigger = "cron"): Promise<ScrapeResult> {
  const logger = getLogger();
  const config = getConfig();
  const scrapeStartedAt = new Date();

  const result: ScrapeResult = {
    sourcesProcessed: 0,
    eventsInserted: 0,
    duplicatesSkipped: 0,
    eventsRejected: 0,
    duplicatesMerged: 0,
    errors: 0,
  };

  // Step 1: Delete events older than yesterday (SMA timezone)
  const SMA_TZ = -6;
  const now = new Date();
  const smaMs = now.getTime() + now.getTimezoneOffset() * 60000 + SMA_TZ * 3600000;
  const sma = new Date(smaMs);
  const yesterday = new Date(Date.UTC(sma.getFullYear(), sma.getMonth(), sma.getDate() - 1) - SMA_TZ * 3600000);

  try {
    const deleted = await deleteEventsOlderThan(yesterday);
    if (deleted > 0) {
      logger.info({ deleted }, "Cleaned up old events");
    }
  } catch (error) {
    logger.error({ error }, "Failed to clean up old events");
  }

  // Step 2: Always scrape free sources (web scrapers + platforms)
  logger.info("Smart scrape: running free scrapers");
  const webEvents = await runWebScrapers();
  const { valid: webValidated, rejected: webRejected } = validateAndSanitize(webEvents);
  result.eventsRejected += webRejected;
  const { unique: webUnique, duplicates: webDups } = await deduplicateEvents(webValidated);

  for (const event of webUnique) {
    await upsertEvent({ ...event, scrapedAt: new Date() });
  }

  result.sourcesProcessed += 2;
  result.eventsInserted += webUnique.length;
  result.duplicatesSkipped += webDups;

  // Platform scrapers
  const platformEvents = await runPlatformScrapers();
  const { valid: platValidated, rejected: platRejected } = validateAndSanitize(platformEvents);
  result.eventsRejected += platRejected;
  const { unique: platUnique, duplicates: platDups } = await deduplicateEvents(platValidated);

  for (const event of platUnique) {
    await upsertEvent({ ...event, scrapedAt: new Date() });
  }

  result.sourcesProcessed += 2;
  result.eventsInserted += platUnique.length;
  result.duplicatesSkipped += platDups;

  logger.info(
    { webInserted: webUnique.length, platformInserted: platUnique.length, rejected: result.eventsRejected },
    "Free scraper phase complete"
  );

  // Step 3: Check if we need Facebook scraping
  // Count events for today
  const todayStart = new Date(Date.UTC(sma.getFullYear(), sma.getMonth(), sma.getDate()) - SMA_TZ * 3600000);
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const todayCount = await countEventsForDate(config.DEFAULT_CITY, todayStart, todayEnd);

  logger.info({ todayCount }, "Events for today after free scrape");

  // Only scrape Facebook if fewer than 5 events for today
  if (todayCount < 5 && config.APIFY_API_TOKEN && config.APIFY_API_TOKEN !== "placeholder") {
    logger.info("Smart scrape: running Facebook scrapers with quality filter (need more events)");
    const apifyResult = await runApifyScrapers({
      useQualityFilter: true,
      maxSources: 15,
    });
    result.sourcesProcessed += apifyResult.sourcesProcessed;
    result.eventsInserted += apifyResult.eventsInserted;
    result.duplicatesSkipped += apifyResult.duplicatesSkipped;
    result.eventsRejected += apifyResult.eventsRejected;
    result.errors += apifyResult.errors;
  } else {
    logger.info(
      { todayCount, hasApify: !!config.APIFY_API_TOKEN },
      "Smart scrape: skipping Facebook (enough events or no API token)"
    );
  }

  // Step 4: After ALL scrapers finish, run cross-source dedup + freshness
  try {
    const dedupReport = await crossSourceDedup();
    result.duplicatesMerged += dedupReport.eventsMerged;
    logger.info(dedupReport, "Cross-source dedup complete");
  } catch (error) {
    logger.error({ error }, "Cross-source dedup failed");
  }

  try {
    await recalculateAllFreshness();
  } catch (error) {
    logger.error({ error }, "Freshness recalculation failed");
  }

  // Log a scrape report
  logger.info(
    {
      sourcesProcessed: result.sourcesProcessed,
      eventsInserted: result.eventsInserted,
      duplicatesMerged: result.duplicatesMerged,
      duplicatesSkipped: result.duplicatesSkipped,
      eventsRejected: result.eventsRejected,
      errors: result.errors,
    },
    `Scraped ${result.sourcesProcessed} sources, found ${result.eventsInserted} new events, merged ${result.duplicatesMerged} duplicates, rejected ${result.eventsRejected}`
  );

  await logScrapeRun(trigger, scrapeStartedAt, result);
  return result;
}

/**
 * Maximum images to analyze per Facebook page per scrape (cost control).
 */
const MAX_IMAGES_PER_PAGE = 3;

export interface ApifyScrapeOptions {
  /** If true, filter sources by quality score and skip low-quality ones */
  useQualityFilter?: boolean;
  /** Max sources to scrape (used with quality sorting) */
  maxSources?: number;
}

/**
 * Scrape Facebook pages via Apify with image-first pipeline.
 *
 * For each page:
 * 1. Scrape posts via Apify
 * 2. Prioritize posts with images (flyers have the best event data)
 * 3. Run Claude Vision on image posts (up to MAX_IMAGES_PER_PAGE)
 * 4. Fall back to text extraction for non-image posts
 * 5. Track quality: how many events came from images vs text
 */
export async function runApifyScrapers(
  options: ApifyScrapeOptions = {}
): Promise<ScrapeResult> {
  const logger = getLogger();
  const config = getConfig();

  let fbSources;

  if (options.useQualityFilter) {
    // Smart mode: get sources sorted by quality, filter out bad ones
    const qualitySources = await getSourcesByQuality(options.maxSources ?? 15);
    const skipped: Array<{ name: string; reason: string }> = [];

    fbSources = qualitySources.filter((s) => {
      const { skip, reason } = shouldSkipSource(s);
      if (skip) {
        skipped.push({ name: s.name, reason });
      }
      return !skip;
    });

    if (skipped.length > 0) {
      logger.info(
        { skipped },
        "Skipped low-quality Facebook sources"
      );
    }
  } else {
    // Default mode: get all active sources
    const activeSources = await getActiveSources();
    fbSources = activeSources.filter(
      (s) =>
        s.type === "facebook_page" &&
        s.url.includes("facebook.com") &&
        !s.url.includes("sanmiguellive") &&
        !s.url.includes("discoversma")
    );
  }

  const result: ScrapeResult = {
    sourcesProcessed: 0,
    eventsInserted: 0,
    duplicatesSkipped: 0,
    eventsRejected: 0,
    duplicatesMerged: 0,
    errors: 0,
  };

  for (const source of fbSources) {
    try {
      const rawPosts = await scrapeSource(source.url);

      const scrapeStats = await processPostsImageFirst(
        rawPosts,
        config.DEFAULT_CITY,
        source.url,
        logger
      );

      // Validate and sanitize before dedup
      const { valid: validated, rejected } = validateAndSanitize(scrapeStats.events);
      result.eventsRejected += rejected;

      const { unique, duplicates } = await deduplicateEvents(validated);

      for (const event of unique) {
        await upsertEvent({ ...event, scrapedAt: new Date() });
      }

      await recordScrapeSuccess(source.id);

      // Update source quality with event counts
      await updateSourceQuality(
        source.id,
        unique.length,
        scrapeStats.eventsFromImages
      );

      result.sourcesProcessed++;
      result.eventsInserted += unique.length;
      result.duplicatesSkipped += duplicates;

      logger.info(
        {
          source: source.name,
          totalPosts: rawPosts.length,
          postsWithImages: scrapeStats.postsWithImages,
          imagesAnalyzed: scrapeStats.imagesAnalyzed,
          eventsFromImages: scrapeStats.eventsFromImages,
          eventsFromText: scrapeStats.eventsFromText,
          inserted: unique.length,
          duplicates,
        },
        "Facebook source scraped (image-first)"
      );
    } catch (error) {
      result.errors++;
      await recordScrapeFailure(source.id);
      logger.error({ error, source: source.name }, "Facebook scrape failed");
    }
  }

  return result;
}

interface PostProcessingStats {
  events: NewEvent[];
  postsWithImages: number;
  imagesAnalyzed: number;
  eventsFromImages: number;
  eventsFromText: number;
}

/**
 * Process posts with an image-first strategy:
 * - Posts with images get priority: Claude Vision reads the flyer for dates/times
 * - Posts without images get text-only extraction at lower confidence
 */
async function processPostsImageFirst(
  rawPosts: ApifyFacebookPost[],
  city: string,
  sourceUrl: string,
  logger: ReturnType<typeof getLogger>
): Promise<PostProcessingStats> {
  const events: NewEvent[] = [];
  let postsWithImages = 0;
  let imagesAnalyzed = 0;
  let eventsFromImages = 0;
  let eventsFromText = 0;

  // Separate posts: image posts first (most valuable), then text-only
  const imagePosts: ApifyFacebookPost[] = [];
  const textOnlyPosts: ApifyFacebookPost[] = [];

  for (const post of rawPosts) {
    const hasImage =
      post.media &&
      post.media.length > 0 &&
      (post.media[0].photo_image?.uri || post.media[0].thumbnail);

    if (hasImage) {
      imagePosts.push(post);
      postsWithImages++;
    } else {
      textOnlyPosts.push(post);
    }
  }

  // Phase 1: Process image posts with Claude Vision (up to MAX_IMAGES_PER_PAGE)
  for (const post of imagePosts.slice(0, MAX_IMAGES_PER_PAGE)) {
    const normalized = normalizeApifyPost(post, city, sourceUrl);
    if (!normalized) continue;

    // Run Vision on the image first — this is the primary source of truth
    if (normalized.imageUrl) {
      try {
        const imageData = await analyzeEventImage(normalized.imageUrl);
        imagesAnalyzed++;

        if (imageData && imageData.hasEventInfo) {
          enrichEventWithImageData(normalized, imageData);
          normalized.confidence = 0.9; // High confidence for vision-extracted events
          eventsFromImages++;
          events.push(normalized);
          logger.debug(
            { title: normalized.title, date: normalized.eventDate },
            "Event extracted from image (Vision)"
          );
          continue; // Skip text extraction for image-confirmed events
        }
      } catch {
        // Fall through to text extraction
      }
    }

    // Image didn't yield event info — try text extraction
    const textEvent = await enrichWithTextExtraction(normalized, logger);
    if (textEvent) {
      textEvent.confidence = 0.5; // Lower confidence for text-only
      eventsFromText++;
      events.push(textEvent);
    }
  }

  // Phase 2: Remaining image posts beyond MAX_IMAGES_PER_PAGE (text-only)
  for (const post of imagePosts.slice(MAX_IMAGES_PER_PAGE)) {
    const normalized = normalizeApifyPost(post, city, sourceUrl);
    if (!normalized) continue;

    const textEvent = await enrichWithTextExtraction(normalized, logger);
    if (textEvent) {
      textEvent.confidence = 0.5;
      eventsFromText++;
      events.push(textEvent);
    }
  }

  // Phase 3: Text-only posts
  for (const post of textOnlyPosts) {
    const normalized = normalizeApifyPost(post, city, sourceUrl);
    if (!normalized) continue;

    const textEvent = await enrichWithTextExtraction(normalized, logger);
    if (textEvent) {
      textEvent.confidence = 0.5;
      eventsFromText++;
      events.push(textEvent);
    }
  }

  return {
    events,
    postsWithImages,
    imagesAnalyzed,
    eventsFromImages,
    eventsFromText,
  };
}

/**
 * Enrich an event using LLM text extraction.
 * Returns the enriched event, or null if it's not worth keeping.
 */
async function enrichWithTextExtraction(
  event: NewEvent,
  logger: ReturnType<typeof getLogger>
): Promise<NewEvent | null> {
  if (!event.rawContent) return event;

  try {
    const extraction = await extractEvent(event.rawContent);

    // Category
    if (
      extraction.category &&
      (!event.category || event.category === "other")
    ) {
      event.category = extraction.category as any;
    }
    if (extraction.neighborhood && !event.neighborhood) {
      event.neighborhood = extraction.neighborhood;
    }

    // Extract the REAL event date from text (not the FB post date)
    if (extraction.eventDate) {
      try {
        const parsedDate = new Date(extraction.eventDate);
        if (!isNaN(parsedDate.getTime())) {
          event.eventDate = parsedDate;
          event.contentType = "event";
        }
      } catch {
        // Skip unparseable dates
      }
    }

    // Recurring/workshop fields
    if (extraction.isRecurring && !event.recurrenceDay) {
      event.contentType = "recurring";
      event.recurrenceDay = extraction.recurrenceDay;
      event.recurrenceTime = extraction.recurrenceTime;
    }

    if (extraction.price && !event.price) event.price = extraction.price;
    if (extraction.duration && !event.duration)
      event.duration = extraction.duration;
  } catch (error) {
    logger.debug({ error, title: event.title }, "Text extraction failed");
  }

  return event;
}
