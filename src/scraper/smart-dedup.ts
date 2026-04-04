import { eq, and, gte, lte, sql, ne } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { events, type Event } from "../db/schema.js";
import { getLLMClient } from "../llm/client.js";
import { getLogger } from "../utils/logger.js";
import { normalizeVenueName } from "../utils/hash.js";

// Source authority ranking (higher = more authoritative)
const SOURCE_AUTHORITY: Record<string, number> = {
  website: 5,       // sanmiguellive, discoversma
  platform: 4,      // bandsintown, eventbrite
  facebook_page: 3,
  user_forwarded: 2,
  instagram: 1,
  tiktok: 1,
};

export interface DedupReport {
  pairsChecked: number;
  pairsConfirmed: number;
  eventsMerged: number;
  eventsDeleted: number;
}

/**
 * Cross-source deduplication: find and merge duplicate events
 * that came from different sources with different titles.
 *
 * Strategy:
 * 1. Group events by venue (normalized) + same date (within 2 hours)
 * 2. For groups with 2+ events, batch-confirm with Haiku
 * 3. Merge: keep the one with more data, delete the other
 */
export async function crossSourceDedup(): Promise<DedupReport> {
  const logger = getLogger();
  const db = getDb();

  const report: DedupReport = {
    pairsChecked: 0,
    pairsConfirmed: 0,
    eventsMerged: 0,
    eventsDeleted: 0,
  };

  try {
    // Get all future events
    const now = new Date();
    const allEvents = await db
      .select()
      .from(events)
      .where(
        and(
          gte(events.eventDate, now),
          sql`${events.contentType} = 'event'`
        )
      );

    if (allEvents.length < 2) {
      logger.info("Cross-source dedup: fewer than 2 future events, nothing to do");
      return report;
    }

    // Group events by normalized venue + approximate date
    const groups = groupByVenueAndDate(allEvents);

    // Find candidate pairs for dedup
    const candidatePairs: Array<[Event, Event]> = [];
    for (const group of groups.values()) {
      if (group.length < 2) continue;

      // Generate all pairs within the group
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          // Only compare events from different sources
          if (group[i].sourceType !== group[j].sourceType ||
              group[i].sourceUrl !== group[j].sourceUrl) {
            candidatePairs.push([group[i], group[j]]);
          }
        }
      }
    }

    if (candidatePairs.length === 0) {
      logger.info("Cross-source dedup: no candidate pairs found");
      return report;
    }

    logger.info(
      { candidatePairs: candidatePairs.length },
      "Cross-source dedup: checking candidate pairs"
    );

    // Batch confirm with LLM (send multiple pairs at once)
    const BATCH_SIZE = 10;
    for (let i = 0; i < candidatePairs.length; i += BATCH_SIZE) {
      const batch = candidatePairs.slice(i, i + BATCH_SIZE);
      const results = await batchConfirmDuplicates(batch);

      for (let j = 0; j < batch.length; j++) {
        report.pairsChecked++;
        if (results[j]) {
          report.pairsConfirmed++;
          const [a, b] = batch[j];
          const { primary, secondary } = pickPrimary(a, b);
          const merged = mergeEvents(primary, secondary);

          // Update the primary event with merged data
          await db
            .update(events)
            .set({
              imageUrl: merged.imageUrl,
              description: merged.description,
              price: merged.price,
              venueAddress: merged.venueAddress,
              sourceUrl: merged.sourceUrl,
              sourceCount: sql`COALESCE(${events.sourceCount}, 1) + 1`,
              freshnessScore: sql`LEAST(1.0, COALESCE(${events.freshnessScore}, 1.0) + 0.2)`,
            })
            .where(eq(events.id, primary.id));
          report.eventsMerged++;

          // Delete the secondary event
          await db.delete(events).where(eq(events.id, secondary.id));
          report.eventsDeleted++;

          logger.debug(
            {
              primaryTitle: primary.title,
              secondaryTitle: secondary.title,
              venue: primary.venueName,
            },
            "Events merged (cross-source dedup)"
          );
        }
      }
    }

    logger.info(report, "Cross-source dedup complete");
  } catch (error) {
    logger.error({ error }, "Cross-source dedup failed");
  }

  return report;
}

/**
 * Group events by normalized venue name + date (within 2-hour window).
 * Returns a Map where the key is "venue|date_bucket" and value is array of events.
 */
function groupByVenueAndDate(eventList: Event[]): Map<string, Event[]> {
  const groups = new Map<string, Event[]>();

  for (const event of eventList) {
    if (!event.venueName || !event.eventDate) continue;

    const venueKey = normalizeVenueName(event.venueName);
    // Bucket by 2-hour windows (round to nearest 2 hours)
    const dateMs = new Date(event.eventDate).getTime();
    const bucket = Math.floor(dateMs / (2 * 60 * 60 * 1000));
    const key = `${venueKey}|${bucket}`;

    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(event);
  }

  return groups;
}

/**
 * Pick which event is the "primary" (to keep) and which is "secondary" (to merge into primary).
 * The primary is the one with more data or from a more authoritative source.
 */
function pickPrimary(a: Event, b: Event): { primary: Event; secondary: Event } {
  const scoreA = eventDataScore(a);
  const scoreB = eventDataScore(b);

  // If data scores are close, prefer more authoritative source
  if (Math.abs(scoreA - scoreB) < 2) {
    const authA = SOURCE_AUTHORITY[a.sourceType || ""] || 0;
    const authB = SOURCE_AUTHORITY[b.sourceType || ""] || 0;
    if (authB > authA) return { primary: b, secondary: a };
  }

  return scoreA >= scoreB
    ? { primary: a, secondary: b }
    : { primary: b, secondary: a };
}

/**
 * Score an event by how much data it has.
 */
function eventDataScore(event: Event): number {
  let score = 0;
  if (event.description && event.description.length > 50) score += 2;
  if (event.imageUrl) score += 3;
  if (event.price) score += 1;
  if (event.venueAddress) score += 1;
  if (event.venueName) score += 1;
  if (event.category && event.category !== "other") score += 1;
  if (event.confidence && event.confidence > 0.7) score += 1;
  return score;
}

/**
 * Merge the best data from both events.
 * Returns partial event data to update the primary with.
 */
export function mergeEvents(
  primary: Event,
  secondary: Event
): Partial<Event> {
  const merged: Partial<Event> = {};

  // Take image_url from whichever has one (prefer primary)
  merged.imageUrl = primary.imageUrl || secondary.imageUrl;

  // Take longer description
  if (
    secondary.description &&
    (!primary.description ||
      secondary.description.length > primary.description.length)
  ) {
    merged.description = secondary.description;
  } else {
    merged.description = primary.description;
  }

  // Take price if available (prefer primary)
  merged.price = primary.price || secondary.price;

  // Take venue_address from whichever has one
  merged.venueAddress = primary.venueAddress || secondary.venueAddress;

  // Take the more authoritative source URL
  const authPrimary = SOURCE_AUTHORITY[primary.sourceType || ""] || 0;
  const authSecondary = SOURCE_AUTHORITY[secondary.sourceType || ""] || 0;
  merged.sourceUrl =
    authPrimary >= authSecondary
      ? primary.sourceUrl
      : secondary.sourceUrl;

  return merged;
}

/**
 * Batch-confirm potential duplicate pairs using Haiku LLM.
 * Sends up to 10 pairs in a single request to keep costs low.
 * Returns an array of booleans (true = confirmed duplicate).
 */
async function batchConfirmDuplicates(
  pairs: Array<[Event, Event]>
): Promise<boolean[]> {
  const logger = getLogger();

  if (pairs.length === 0) return [];

  try {
    const client = getLLMClient();

    // Build a compact prompt with all pairs
    const pairDescriptions = pairs
      .map((pair, idx) => {
        const [a, b] = pair;
        return `Pair ${idx + 1}:
  A: "${a.title}" at "${a.venueName || "unknown"}" on ${a.eventDate ? new Date(a.eventDate).toISOString().slice(0, 16) : "unknown"}
  B: "${b.title}" at "${b.venueName || "unknown"}" on ${b.eventDate ? new Date(b.eventDate).toISOString().slice(0, 16) : "unknown"}`;
      })
      .join("\n\n");

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 256,
      system: `You are a duplicate event detector for San Miguel de Allende, Mexico. Given pairs of events, determine if each pair is the SAME event listed on different sources. Events may have different titles in Spanish/English. Respond with ONLY a JSON array of booleans, one per pair. Example: [true, false, true]`,
      messages: [
        {
          role: "user",
          content: `Are these event pairs the same event? Answer with a JSON array of booleans:\n\n${pairDescriptions}`,
        },
      ],
    });

    const rawText =
      response.content[0].type === "text" ? response.content[0].text : "[]";

    // Parse the JSON array from the response
    const cleaned = rawText
      .replace(/^```(?:json)?\s*\n?/m, "")
      .replace(/\n?```\s*$/m, "")
      .trim();

    const results: boolean[] = JSON.parse(cleaned);

    // Ensure we have the right number of results
    while (results.length < pairs.length) {
      results.push(false); // Default to "not duplicate" if LLM didn't answer
    }

    return results.slice(0, pairs.length);
  } catch (error) {
    logger.error({ error }, "Batch duplicate confirmation failed");
    // On error, default to "not duplicate" for all pairs
    return pairs.map(() => false);
  }
}
