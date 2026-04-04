import type { Event } from "../db/schema.js";

interface CachedEvents {
  allEvents: Event[];      // ALL events from the last query
  shownCount: number;      // How many we've shown so far
  timestamp: number;
}

const TTL_MS = 30 * 60 * 1000; // 30 minutes
const recentEventsCache = new Map<string, CachedEvents>();

/**
 * Store ALL events from a query, reset shown count.
 */
export function storeRecentEvents(phone: string, events: Event[]): void {
  recentEventsCache.set(phone, {
    allEvents: events,
    shownCount: 0,
    timestamp: Date.now(),
  });

  if (recentEventsCache.size > 500) pruneCache();
}

/**
 * Mark N events as shown.
 */
export function markEventsShown(phone: string, count: number): void {
  const cached = recentEventsCache.get(phone);
  if (cached) {
    cached.shownCount = count;
  }
}

/**
 * Get events that haven't been shown yet (for "show me more").
 */
export function getNextEvents(phone: string, batchSize: number = 8): Event[] {
  const cached = recentEventsCache.get(phone);
  if (!cached) return [];

  if (Date.now() - cached.timestamp > TTL_MS) {
    recentEventsCache.delete(phone);
    return [];
  }

  const start = cached.shownCount;
  const next = cached.allEvents.slice(start, start + batchSize);

  // Update shown count
  cached.shownCount = start + next.length;

  return next;
}

/**
 * Get the count of remaining unshown events.
 */
export function getRemainingCount(phone: string): number {
  const cached = recentEventsCache.get(phone);
  if (!cached) return 0;
  if (Date.now() - cached.timestamp > TTL_MS) return 0;
  return Math.max(0, cached.allEvents.length - cached.shownCount);
}

/**
 * Get recently shown events (for calendar/share features).
 */
export function getRecentEvents(phone: string): Event[] {
  const cached = recentEventsCache.get(phone);
  if (!cached) return [];
  if (Date.now() - cached.timestamp > TTL_MS) return [];
  return cached.allEvents.slice(0, cached.shownCount);
}

function pruneCache(): void {
  const now = Date.now();
  for (const [key, value] of recentEventsCache) {
    if (now - value.timestamp > TTL_MS) {
      recentEventsCache.delete(key);
    }
  }
}
