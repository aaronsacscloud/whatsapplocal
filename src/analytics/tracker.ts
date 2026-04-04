import { getDb } from "../db/index.js";
import { analytics } from "../db/schema.js";
import { getLogger } from "../utils/logger.js";

export interface TrackQueryData {
  phoneHash: string;
  intent: string;
  query?: string;
  category?: string;
  city?: string;
  resultsCount?: number;
  responseTimeMs?: number;
}

/**
 * Track a query in the analytics table.
 * Fire-and-forget: does not throw, logs errors internally.
 */
export function trackQuery(data: TrackQueryData): void {
  const logger = getLogger();

  // Fire and forget — run the insert but don't await it in the caller
  const db = getDb();
  db.insert(analytics)
    .values({
      phoneHash: data.phoneHash,
      intent: data.intent,
      query: data.query,
      category: data.category,
      city: data.city,
      resultsCount: data.resultsCount ?? 0,
      responseTimeMs: data.responseTimeMs,
    })
    .then(() => {
      // Successfully tracked
    })
    .catch((error) => {
      logger.error({ error }, "Failed to track analytics query");
    });
}
