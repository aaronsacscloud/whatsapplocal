import { searchEvents, type SearchFilters } from "./repository.js";
import { getConfig } from "../config.js";
import type { Event } from "../db/schema.js";
import type { ClassificationResult } from "../llm/classifier.js";

export async function searchFromClassification(
  classification: ClassificationResult
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
    limit: 10,
  };

  // Parse date expressions
  if (classification.date) {
    const { dateFrom, dateTo } = parseDateRange(classification.date);
    filters.dateFrom = dateFrom;
    filters.dateTo = dateTo;
  } else {
    // Default: events from start of today (UTC) until end of next week
    const now = new Date();
    const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    filters.dateFrom = todayUtc;
    const nextWeek = new Date(todayUtc);
    nextWeek.setUTCDate(nextWeek.getUTCDate() + 7);
    filters.dateTo = nextWeek;
  }

  return searchEvents(filters);
}

function parseDateRange(dateStr: string): {
  dateFrom: Date;
  dateTo: Date;
} {
  const now = new Date();
  // Use UTC to match DB timestamps
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const tomorrow = new Date(today);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

  const lower = dateStr.toLowerCase().trim();

  if (lower === "hoy" || lower === "today" || lower.includes("esta noche")) {
    return {
      dateFrom: today, // Start of day, not current time
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

  if (lower.includes("esta semana") || lower.includes("this week")) {
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
