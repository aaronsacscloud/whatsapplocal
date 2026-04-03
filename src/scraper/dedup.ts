import { findByDedupHash } from "../events/repository.js";
import {
  normalizeVenueName,
  levenshteinDistance,
} from "../utils/hash.js";
import type { NewEvent } from "../db/schema.js";
import { getLogger } from "../utils/logger.js";

export interface DedupResult {
  unique: NewEvent[];
  duplicates: number;
  nearMatches: NewEvent[];
}

export async function deduplicateEvents(
  events: NewEvent[]
): Promise<DedupResult> {
  const logger = getLogger();
  const unique: NewEvent[] = [];
  const nearMatches: NewEvent[] = [];
  let duplicates = 0;

  for (const event of events) {
    if (event.dedupHash) {
      const existing = await findByDedupHash(event.dedupHash);
      if (existing) {
        duplicates++;
        continue;
      }
    }

    // Check near-matches against already-accepted events in this batch
    let isNearMatch = false;
    if (event.venueName) {
      const normalizedNew = normalizeVenueName(event.venueName);
      for (const accepted of unique) {
        if (!accepted.venueName) continue;
        const normalizedExisting = normalizeVenueName(accepted.venueName);
        const distance = levenshteinDistance(normalizedNew, normalizedExisting);

        if (
          distance <= 2 &&
          event.eventDate?.toString() === accepted.eventDate?.toString()
        ) {
          isNearMatch = true;
          nearMatches.push(event);
          break;
        }
      }
    }

    if (!isNearMatch) {
      unique.push(event);
    }
  }

  logger.info(
    {
      total: events.length,
      unique: unique.length,
      duplicates,
      nearMatches: nearMatches.length,
    },
    "Deduplication complete"
  );

  return { unique, duplicates, nearMatches };
}
