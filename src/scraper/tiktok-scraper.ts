/**
 * TikTok scraper using Apify.
 *
 * ## Integration into manager.ts
 *
 * To wire this into the scraping pipeline, add after Phase 4 in runScrapeAll()
 * and after Step 3 in runSmartScrape():
 *
 * ```typescript
 * import { scrapeTikTokProfile, normalizeTikTokPost } from "./tiktok-scraper.js";
 *
 * // Phase 5: TikTok scrapers (Apify, paid, low priority)
 * // Only run if event count is still low (< 10 for today)
 * const todayCount = await countEventsForDate(config.DEFAULT_CITY, todayStart, todayEnd);
 * if (todayCount < 10 && config.APIFY_API_TOKEN && config.APIFY_API_TOKEN !== "placeholder") {
 *   const tiktokResult = await runTikTokPhase(config.DEFAULT_CITY, result);
 *   result.sourcesProcessed += tiktokResult.sourcesProcessed;
 *   result.eventsInserted += tiktokResult.eventsInserted;
 *   result.duplicatesSkipped += tiktokResult.duplicatesSkipped;
 *   result.eventsRejected += tiktokResult.eventsRejected;
 *   result.errors += tiktokResult.errors;
 * }
 * ```
 *
 * And add the runTikTokPhase function:
 *
 * ```typescript
 * async function runTikTokPhase(city: string, parentResult: ScrapeResult): Promise<ScrapeResult> {
 *   const logger = getLogger();
 *   const result: ScrapeResult = { sourcesProcessed: 0, eventsInserted: 0, duplicatesSkipped: 0, eventsRejected: 0, duplicatesMerged: 0, errors: 0 };
 *
 *   const activeSources = await getActiveSources();
 *   const tiktokSources = activeSources.filter((s) => s.type === "tiktok");
 *
 *   for (const source of tiktokSources) {
 *     try {
 *       const posts = await scrapeTikTokProfile(source.url, 10);
 *       const events = posts
 *         .map((p) => normalizeTikTokPost(p, source.name, city))
 *         .filter((e): e is NewEvent => e !== null);
 *
 *       const { valid, rejected } = validateAndSanitize(events);
 *       result.eventsRejected += rejected;
 *       const { unique, duplicates } = await deduplicateEvents(valid);
 *
 *       for (const event of unique) {
 *         await upsertEvent({ ...event, scrapedAt: new Date() });
 *       }
 *
 *       result.sourcesProcessed++;
 *       result.eventsInserted += unique.length;
 *       result.duplicatesSkipped += duplicates;
 *
 *       logger.info({ source: source.name, posts: posts.length, inserted: unique.length }, "TikTok source scraped");
 *     } catch (error) {
 *       result.errors++;
 *       logger.error({ error, source: source.name }, "TikTok scrape failed");
 *     }
 *   }
 *
 *   return result;
 * }
 * ```
 */

import { ApifyClient } from "apify-client";
import { getConfig } from "../config.js";
import { getLogger } from "../utils/logger.js";
import { eventDeduplicationHash } from "../utils/hash.js";
import type { NewEvent } from "../db/schema.js";

let _client: ApifyClient | null = null;

function getApifyClient(): ApifyClient {
  if (_client) return _client;
  const config = getConfig();
  _client = new ApifyClient({ token: config.APIFY_API_TOKEN });
  return _client;
}

export interface ApifyTikTokPost {
  text?: string;
  desc?: string;
  webVideoUrl?: string;
  videoUrl?: string;
  diggCount?: number;
  shareCount?: number;
  playCount?: number;
  commentCount?: number;
  createTime?: number; // Unix timestamp
  authorMeta?: {
    name?: string;
    nickName?: string;
    avatar?: string;
    [key: string]: unknown;
  };
  musicMeta?: {
    musicName?: string;
    musicAuthor?: string;
    [key: string]: unknown;
  };
  covers?: {
    default?: string;
    origin?: string;
    dynamic?: string;
    [key: string]: unknown;
  };
  videoMeta?: {
    coverUrl?: string;
    duration?: number;
    [key: string]: unknown;
  };
  hashtags?: Array<{
    name?: string;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

/**
 * Scrape recent posts from a TikTok profile or hashtag page via Apify.
 * Uses the clockworks/tiktok-scraper actor.
 */
export async function scrapeTikTokProfile(
  sourceUrl: string,
  limit: number = 10
): Promise<ApifyTikTokPost[]> {
  const logger = getLogger();
  const client = getApifyClient();

  try {
    logger.info({ source: sourceUrl }, "Starting Apify TikTok scrape");

    const run = await client
      .actor("clockworks/tiktok-scraper")
      .call(
        {
          startUrls: [{ url: sourceUrl }],
          resultsPerPage: limit,
        },
        { waitSecs: 120 }
      );

    const { items } = await client
      .dataset(run.defaultDatasetId)
      .listItems();

    logger.info(
      { source: sourceUrl, count: items.length },
      "Apify TikTok scrape completed"
    );

    return items as ApifyTikTokPost[];
  } catch (error) {
    logger.error({ error, source: sourceUrl }, "Apify TikTok scrape failed");
    throw error;
  }
}

/**
 * Normalize an Apify TikTok post into a NewEvent.
 * TikTok data is less structured than Facebook/Instagram, so confidence is lower.
 */
export function normalizeTikTokPost(
  post: ApifyTikTokPost,
  sourceName: string,
  city: string
): NewEvent | null {
  const description = post.text || post.desc || "";
  if (description.length < 10) return null;

  const textLower = description.toLowerCase();

  // Skip if no event signals
  if (!hasEventSignals(textLower)) return null;

  // Extract video thumbnail as imageUrl
  const imageUrl =
    post.covers?.origin ||
    post.covers?.default ||
    post.videoMeta?.coverUrl ||
    null;

  // Extract hashtags
  const hashtags = (post.hashtags || [])
    .map((h) => h.name?.toLowerCase() || "")
    .filter(Boolean);

  // Try to extract event date from description
  const eventDate = extractEventDateFromText(description);

  // Extract venue from text (look for common venue indicators)
  const venueName = extractVenueMention(description) || sourceName;

  // Build title from first line of description
  const title = extractTitle(description);

  // Create dedup hash from title + date
  let dedupHash: string | undefined;
  if (title && eventDate) {
    dedupHash = eventDeduplicationHash(
      title,
      eventDate.toISOString(),
      city
    );
  }

  const expiresAt = eventDate
    ? new Date(eventDate.getTime() + 3 * 24 * 60 * 60 * 1000) // 3 days for TikTok
    : null;

  const sourceUrl =
    post.webVideoUrl ||
    post.videoUrl ||
    null;

  return {
    title,
    venueName,
    city,
    eventDate: eventDate ?? null,
    category: detectCategory(textLower, hashtags),
    contentType: eventDate ? "event" : "post",
    description: description.substring(0, 500),
    sourceUrl,
    sourceType: "tiktok",
    confidence: 0.5,
    rawContent: description.substring(0, 2000),
    imageUrl,
    dedupHash,
    expiresAt,
  };
}

/**
 * Extract a short title from description text.
 */
function extractTitle(text: string): string {
  const firstLine = text.split("\n")[0].trim();

  // Strip hashtags from end
  const withoutTags = firstLine.replace(/#\w+\s*/g, "").trim();

  if (withoutTags.length > 80) {
    const firstSentence = withoutTags.match(/^[^.!?]+[.!?]/);
    if (firstSentence) return firstSentence[0].trim();
    return withoutTags.substring(0, 77) + "...";
  }

  return withoutTags || firstLine.substring(0, 77) || "TikTok Event";
}

/**
 * Check if text has event-related signals.
 */
function hasEventSignals(text: string): boolean {
  const signals = [
    /esta noche|tonight|hoy|today/i,
    /en vivo|live music|live band/i,
    /concierto|concert/i,
    /evento|event/i,
    /reserva|booking|reservation/i,
    /cover|entrada|admission/i,
    /\d{1,2}:\d{2}|hrs|pm|am/i,
    /viernes|sabado|sábado|domingo|lunes|martes|miercoles|jueves/i,
    /friday|saturday|sunday|monday|tuesday|wednesday|thursday/i,
    /dj\b|musica|música|jazz|blues|rock|salsa|cumbia/i,
    /happy hour|promo|descuento|2x1/i,
    /feria|festival|exposicion|exposición|taller|workshop/i,
    /sanmigueldeallende|sanmiguel|sma\b/i,
  ];

  let matchCount = 0;
  for (const signal of signals) {
    if (signal.test(text)) matchCount++;
  }

  return matchCount >= 2;
}

/**
 * Try to extract a specific event date from post text.
 */
function extractEventDateFromText(text: string): Date | undefined {
  const currentYear = new Date().getFullYear();

  const monthNames: Record<string, number> = {
    january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
    july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
    jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
    enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
    julio: 6, agosto: 7, septiembre: 8, octubre: 9, noviembre: 10, diciembre: 11,
  };

  for (const [name, month] of Object.entries(monthNames)) {
    const pattern1 = new RegExp(`${name}\\s+(\\d{1,2})`, "i");
    const pattern2 = new RegExp(`(\\d{1,2})\\s+(?:de\\s+)?${name}`, "i");

    const m1 = text.match(pattern1);
    if (m1) {
      const day = parseInt(m1[1], 10);
      if (day >= 1 && day <= 31) {
        return new Date(Date.UTC(currentYear, month, day, 12, 0, 0));
      }
    }

    const m2 = text.match(pattern2);
    if (m2) {
      const day = parseInt(m2[1], 10);
      if (day >= 1 && day <= 31) {
        return new Date(Date.UTC(currentYear, month, day, 12, 0, 0));
      }
    }
  }

  return undefined;
}

/**
 * Try to extract a venue name from the text.
 * Looks for "en [Venue]", "at [Venue]", "@venue" patterns.
 */
function extractVenueMention(text: string): string | null {
  // "en VenueName" or "at VenueName" — capture until newline or hashtag
  const enMatch = text.match(/(?:^|\s)(?:en|at)\s+([A-Z][^#\n]{2,30})/);
  if (enMatch) return enMatch[1].trim();

  // "@venuename" mention
  const mentionMatch = text.match(/@([A-Za-z0-9_.]{3,30})/);
  if (mentionMatch) return mentionMatch[1].replace(/_/g, " ");

  return null;
}

/**
 * Detect event category from text and hashtags.
 */
function detectCategory(
  text: string,
  hashtags: string[]
): "music" | "food" | "nightlife" | "culture" | "wellness" | "wine" | "other" {
  const combined = text + " " + hashtags.join(" ");

  if (/concierto|concert|live\s*music|en\s*vivo|dj\b|banda|jazz|blues|rock|salsa/i.test(combined)) {
    return "music";
  }
  if (/restaurante|comida|food|brunch|cena|dinner|menu|chef|gastronomia/i.test(combined)) {
    return "food";
  }
  if (/bar|fiesta|party|nightlife|club|noche|drinks|cocktail/i.test(combined)) {
    return "nightlife";
  }
  if (/museo|museum|arte|art|galeria|gallery|teatro|theatre|theater|exposicion|cultura/i.test(combined)) {
    return "culture";
  }
  if (/yoga|meditacion|wellness|spa|retiro|retreat|bienestar/i.test(combined)) {
    return "wellness";
  }
  if (/vino|wine|vinedo|vineyard|cata|tasting|bodega/i.test(combined)) {
    return "wine";
  }

  return "other";
}
