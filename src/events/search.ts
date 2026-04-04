import { searchEvents, type SearchFilters } from "./repository.js";
import { getConfig } from "../config.js";
import type { Event } from "../db/schema.js";
import type { ClassificationResult } from "../llm/classifier.js";

export async function searchFromClassification(
  classification: ClassificationResult,
  interests?: string[]
): Promise<Event[]> {
  const config = getConfig();
  const city = classification.city ?? config.DEFAULT_CITY;

  const filters: SearchFilters = {
    city,
    neighborhood: classification.neighborhood ?? undefined,
    category: classification.category ?? undefined,
    // Only use query for specific searches (not generic questions)
    query: classification.query && !isGenericQuery(classification.query)
      ? classification.query
      : undefined,
    limit: 30, // Enough for multi-day queries, responder handles pagination
    contentType: "event", // Default: only real events with dates
  };

  // Parse date expressions
  if (classification.date) {
    const { dateFrom, dateTo } = parseDateRange(classification.date);
    filters.dateFrom = dateFrom;
    filters.dateTo = dateTo;
  } else {
    // Default: events from start of today (SMA timezone) until end of next week
    const SMA_TZ = -6;
    const now = new Date();
    const smaMs = now.getTime() + now.getTimezoneOffset() * 60000 + SMA_TZ * 3600000;
    const sma = new Date(smaMs);
    const todaySMA = new Date(Date.UTC(sma.getFullYear(), sma.getMonth(), sma.getDate()) - SMA_TZ * 3600000);
    filters.dateFrom = todaySMA;
    const nextWeek = new Date(todaySMA.getTime() + 7 * 24 * 60 * 60 * 1000);
    filters.dateTo = nextWeek;
  }

  let results = await searchEvents(filters);

  // Fallback: if no events found, also include activities
  if (results.length === 0) {
    filters.contentType = "all";
    results = await searchEvents(filters);
  }

  // Boost events matching user interests (put matching categories first)
  if (interests && interests.length > 0 && !classification.category) {
    return boostByInterests(results, interests);
  }

  return results;
}

/**
 * Re-order events so those matching user interests appear first,
 * while preserving chronological order within each group.
 */
function boostByInterests(events: Event[], interests: string[]): Event[] {
  const interestSet = new Set(interests.map((i) => i.toLowerCase()));

  const matching: Event[] = [];
  const rest: Event[] = [];

  for (const event of events) {
    const category = ((event as any).category || "").toLowerCase();
    if (interestSet.has(category)) {
      matching.push(event);
    } else {
      rest.push(event);
    }
  }

  return [...matching, ...rest];
}

function parseDateRange(dateStr: string): {
  dateFrom: Date;
  dateTo: Date;
} {
  // Use SMA timezone (UTC-6) to determine "today"
  const SMA_TZ_OFFSET = -6;
  const now = new Date();
  const smaMs = now.getTime() + now.getTimezoneOffset() * 60000 + SMA_TZ_OFFSET * 3600000;
  const sma = new Date(smaMs);
  // "today" in SMA = start of day in UTC (SMA midnight = UTC 06:00)
  const today = new Date(Date.UTC(sma.getFullYear(), sma.getMonth(), sma.getDate()) - SMA_TZ_OFFSET * 3600000);
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

  const lower = dateStr.toLowerCase().trim();

  // "hoy y mañana" / "today and tomorrow" = 2-day range
  if (
    (lower.includes("hoy") && lower.includes("mana")) ||
    (lower.includes("today") && lower.includes("tomorrow"))
  ) {
    return {
      dateFrom: today,
      dateTo: new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000),
    };
  }

  if (lower === "hoy" || lower === "today" || lower.includes("esta noche")) {
    return {
      dateFrom: today,
      dateTo: new Date(today.getTime() + 24 * 60 * 60 * 1000),
    };
  }

  if (lower === "manana" || lower === "mañana" || lower === "tomorrow") {
    return {
      dateFrom: tomorrow,
      dateTo: new Date(tomorrow.getTime() + 24 * 60 * 60 * 1000),
    };
  }

  if (
    lower.includes("fin de semana") ||
    lower.includes("finde") ||
    lower.includes("weekend")
  ) {
    const dayOfWeek = now.getUTCDay();
    const daysUntilSaturday = (6 - dayOfWeek + 7) % 7 || 7;
    const saturday = new Date(today);
    saturday.setUTCDate(today.getUTCDate() + daysUntilSaturday);
    const monday = new Date(saturday);
    monday.setUTCDate(saturday.getUTCDate() + 2);
    return { dateFrom: saturday, dateTo: monday };
  }

  if (
    lower.includes("esta semana") ||
    lower.includes("this week") ||
    lower.includes("la semana") ||
    lower.includes("weekly") ||
    lower === "semana"
  ) {
    const endOfWeek = new Date(today);
    endOfWeek.setUTCDate(today.getUTCDate() + (7 - today.getUTCDay()));
    return { dateFrom: today, dateTo: endOfWeek };
  }

  // Try parsing as ISO date
  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) {
    const endOfDay = new Date(parsed);
    endOfDay.setDate(endOfDay.getDate() + 1);
    return { dateFrom: parsed, dateTo: endOfDay };
  }

  // Fallback: next 7 days
  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);
  return { dateFrom: now, dateTo: nextWeek };
}

const GENERIC_PATTERNS = [
  /^que hay/i,
  /^que hacer/i,
  /^que se puede/i,
  /^que pasa/i,
  /^donde ir/i,
  /^recomien/i,
  /^algo para/i,
];

function isGenericQuery(query: string): boolean {
  return GENERIC_PATTERNS.some((p) => p.test(query.trim()));
}
