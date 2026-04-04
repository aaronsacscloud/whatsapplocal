import type { Event } from "../db/schema.js";

/**
 * In-memory cache of recently shown events per user phone.
 * Used for "add to calendar" and "share" features to know which events
 * were recently displayed to a user.
 *
 * TTL: 30 minutes. Cleared on visibility change or process restart.
 */

interface CachedEvents {
  events: Event[];
  timestamp: number;
}

const TTL_MS = 30 * 60 * 1000; // 30 minutes
const recentEventsCache = new Map<string, CachedEvents>();

/**
 * Store events that were just shown to a user.
 */
export function storeRecentEvents(phone: string, events: Event[]): void {
  recentEventsCache.set(phone, {
    events,
    timestamp: Date.now(),
  });

  // Prune old entries periodically
  if (recentEventsCache.size > 500) {
    pruneCache();
  }
}

/**
 * Get recently shown events for a user.
 * Returns empty array if none cached or if TTL expired.
 */
export function getRecentEvents(phone: string): Event[] {
  const cached = recentEventsCache.get(phone);
  if (!cached) return [];

  if (Date.now() - cached.timestamp > TTL_MS) {
    recentEventsCache.delete(phone);
    return [];
  }

  return cached.events;
}

/**
 * Remove expired entries from cache.
 */
function pruneCache(): void {
  const now = Date.now();
  for (const [key, value] of recentEventsCache) {
    if (now - value.timestamp > TTL_MS) {
      recentEventsCache.delete(key);
    }
  }
}
