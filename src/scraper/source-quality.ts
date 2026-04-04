import { eq, sql, desc, and } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { sources, type Source } from "../db/schema.js";
import { getLogger } from "../utils/logger.js";

/**
 * After scraping a page, update its quality score based on how many
 * useful events it produced, especially from images.
 *
 * Quality score formula:
 *   score = (eventsFound * 0.3 + eventsFromImages * 0.7) / totalScrapes
 *
 * Pages with more image-based events get higher scores because
 * flyer images contain the most reliable event data (exact dates, times, prices).
 */
export async function updateSourceQuality(
  sourceId: string,
  eventsFound: number,
  eventsFromImages: number
): Promise<void> {
  const db = getDb();
  const logger = getLogger();

  // Increment cumulative counters
  await db
    .update(sources)
    .set({
      eventsFound: sql`COALESCE(${sources.eventsFound}, 0) + ${eventsFound}`,
      eventsFromImages: sql`COALESCE(${sources.eventsFromImages}, 0) + ${eventsFromImages}`,
      totalScrapes: sql`COALESCE(${sources.totalScrapes}, 0) + 1`,
      lastUsefulEventAt: eventsFound > 0 ? new Date() : undefined,
    })
    .where(eq(sources.id, sourceId));

  // Recalculate quality_score from cumulative values
  const [updated] = await db
    .select()
    .from(sources)
    .where(eq(sources.id, sourceId))
    .limit(1);

  if (updated) {
    const totalEvents = updated.eventsFound ?? 0;
    const totalImageEvents = updated.eventsFromImages ?? 0;
    const totalScrapes = updated.totalScrapes ?? 1;

    // Weighted score: image events are worth more
    const rawScore =
      (totalEvents * 0.3 + totalImageEvents * 0.7) / totalScrapes;
    // Clamp between 0 and 1
    const qualityScore = Math.min(1.0, Math.max(0.0, rawScore));

    await db
      .update(sources)
      .set({ qualityScore })
      .where(eq(sources.id, sourceId));

    logger.info(
      {
        sourceId,
        name: updated.name,
        eventsFound: totalEvents,
        eventsFromImages: totalImageEvents,
        totalScrapes,
        qualityScore: qualityScore.toFixed(3),
      },
      "Source quality updated"
    );
  }
}

/**
 * Get Facebook page sources sorted by quality score (best first).
 * Used for efficient scraping: scrape the best pages first.
 */
export async function getSourcesByQuality(
  limit: number = 15
): Promise<Source[]> {
  const db = getDb();

  return db
    .select()
    .from(sources)
    .where(
      and(
        eq(sources.isActive, true),
        eq(sources.type, "facebook_page"),
        // Exclude web scrapers masquerading as facebook_page sources
        sql`${sources.url} LIKE 'https://www.facebook.com/%'`
      )
    )
    .orderBy(desc(sources.qualityScore))
    .limit(limit);
}

/**
 * Check if a source should be skipped based on quality history.
 * Skip pages that have never produced an event after 3+ scrapes.
 */
export function shouldSkipSource(source: Source): {
  skip: boolean;
  reason: string;
} {
  const totalScrapes = source.totalScrapes ?? 0;
  const eventsFound = source.eventsFound ?? 0;
  const qualityScore = source.qualityScore ?? 0.5;

  // Never scrapped yet: always try
  if (totalScrapes === 0) {
    return { skip: false, reason: "" };
  }

  // Skip if quality is too low
  if (qualityScore < 0.2 && totalScrapes >= 2) {
    return {
      skip: true,
      reason: `quality_score ${qualityScore.toFixed(2)} < 0.2 after ${totalScrapes} scrapes`,
    };
  }

  // Skip if never produced an event after 3+ scrapes
  if (eventsFound === 0 && totalScrapes >= 3) {
    return {
      skip: true,
      reason: `0 events found after ${totalScrapes} scrapes`,
    };
  }

  return { skip: false, reason: "" };
}
