import { sql, lte, and, gte } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { events } from "../db/schema.js";
import { getLogger } from "../utils/logger.js";

/**
 * Calculate a freshness score for a single event.
 *
 * Score 0-1 based on:
 * - How recently it was scraped (1.0 if today, 0.5 if 3 days ago, 0.1 if 7+ days)
 * - If confirmed by multiple sources (bonus +0.2)
 * - If has image (bonus +0.1)
 * - If has price (bonus +0.05)
 */
export function calculateFreshness(event: {
  scrapedAt?: Date | null;
  sourceCount?: number | null;
  imageUrl?: string | null;
  price?: string | null;
}): number {
  let score = 0;

  // Base score from scrape recency
  if (event.scrapedAt) {
    const ageMs = Date.now() - new Date(event.scrapedAt).getTime();
    const ageDays = ageMs / (24 * 60 * 60 * 1000);

    if (ageDays <= 0.5) {
      score = 1.0; // Less than 12 hours
    } else if (ageDays <= 1) {
      score = 0.9; // Less than 1 day
    } else if (ageDays <= 2) {
      score = 0.7;
    } else if (ageDays <= 3) {
      score = 0.5;
    } else if (ageDays <= 5) {
      score = 0.3;
    } else if (ageDays <= 7) {
      score = 0.1;
    } else {
      score = 0.05;
    }
  } else {
    score = 0.5; // No scraped_at data, assume moderate freshness
  }

  // Bonus for multiple sources
  if (event.sourceCount && event.sourceCount > 1) {
    score = Math.min(1.0, score + 0.2);
  }

  // Bonus for having an image
  if (event.imageUrl) {
    score = Math.min(1.0, score + 0.1);
  }

  // Bonus for having a price
  if (event.price) {
    score = Math.min(1.0, score + 0.05);
  }

  return Math.round(score * 100) / 100; // Round to 2 decimal places
}

/**
 * Recalculate freshness scores for all future events in the database.
 * Called as part of the daily data quality job.
 */
export async function recalculateAllFreshness(): Promise<number> {
  const logger = getLogger();
  const db = getDb();

  try {
    const now = new Date();

    // Get all future events
    const futureEvents = await db
      .select({
        id: events.id,
        scrapedAt: events.scrapedAt,
        sourceCount: events.sourceCount,
        imageUrl: events.imageUrl,
        price: events.price,
      })
      .from(events)
      .where(
        sql`(${events.eventDate} >= ${now} OR ${events.contentType} IN ('recurring', 'workshop', 'activity'))`
      );

    let updated = 0;
    for (const event of futureEvents) {
      const newScore = calculateFreshness(event);
      await db
        .update(events)
        .set({ freshnessScore: newScore })
        .where(sql`${events.id} = ${event.id}`);
      updated++;
    }

    logger.info({ updated }, "Freshness scores recalculated");
    return updated;
  } catch (error) {
    logger.error({ error }, "Freshness recalculation failed");
    return 0;
  }
}

/**
 * Get events that are getting stale (freshness < 0.3) and are still in the future.
 * These could be re-scraped to get updated info.
 */
export async function getStaleEvents(): Promise<
  Array<{ id: string; title: string; freshnessScore: number | null; sourceUrl: string | null }>
> {
  const db = getDb();
  const now = new Date();

  return db
    .select({
      id: events.id,
      title: events.title,
      freshnessScore: events.freshnessScore,
      sourceUrl: events.sourceUrl,
    })
    .from(events)
    .where(
      and(
        lte(events.freshnessScore, 0.3),
        gte(events.eventDate, now)
      )
    );
}

/**
 * Count stale events (freshness < 0.3) that are still in the future.
 */
export async function countStaleEvents(): Promise<number> {
  const db = getDb();
  const now = new Date();

  const result = await db
    .select({ cnt: sql<number>`COUNT(*)` })
    .from(events)
    .where(
      and(
        lte(events.freshnessScore, 0.3),
        gte(events.eventDate, now)
      )
    );

  return Number((result as unknown as Array<{ cnt: string }>)[0]?.cnt) || 0;
}
