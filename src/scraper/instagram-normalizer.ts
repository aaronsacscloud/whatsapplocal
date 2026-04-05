import type { ApifyInstagramPost } from "./instagram-scraper.js";
import type { NewEvent } from "../db/schema.js";
import { eventDeduplicationHash } from "../utils/hash.js";
import { detectRecurrence, detectWorkshop, extractPrice, extractDuration } from "./web-scraper.js";

/**
 * Normalize an Apify Instagram post into a NewEvent.
 * Instagram posts are caption + image, so we extract what we can
 * and rely on Vision API / LLM extractor to enrich later.
 */
export function normalizeInstagramPost(
  post: ApifyInstagramPost,
  sourceName: string,
  city: string
): NewEvent | null {
  const caption = post.caption || "";
  if (caption.length < 10 && !getImageUrl(post)) return null;

  const text = caption.toLowerCase();
  const isLikelyEvent = hasEventSignals(text);

  // Extract event date from caption text (not post timestamp)
  let eventDate: Date | null = extractEventDateFromText(caption) ?? null;

  const venueName = post.ownerFullName || post.ownerUsername || sourceName || null;

  let dedupHash: string | undefined;
  if (venueName && eventDate) {
    dedupHash = eventDeduplicationHash(
      venueName,
      eventDate.toISOString(),
      city
    );
  }

  const imageUrl = getImageUrl(post);

  const expiresAt = eventDate
    ? new Date(eventDate.getTime() + 7 * 24 * 60 * 60 * 1000)
    : null;

  // Detect recurrence and workshop signals
  const recurrence = detectRecurrence(caption);
  const isWorkshop = detectWorkshop(caption);
  const price = extractPrice(caption);
  const duration = extractDuration(caption);

  const contentType = classifyContentType(text, isLikelyEvent, eventDate, recurrence.isRecurring, isWorkshop);

  // Stable dedup/expiry for recurring and workshop content
  let finalExpiresAt = expiresAt;
  if (contentType === "recurring") {
    finalExpiresAt = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000);
    if (!dedupHash && venueName) {
      dedupHash = eventDeduplicationHash(
        venueName,
        `recurring-${recurrence.recurrenceDay ?? "any"}`,
        city
      );
    }
  } else if (contentType === "workshop") {
    finalExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    if (!dedupHash && venueName) {
      dedupHash = eventDeduplicationHash(
        venueName,
        "workshop",
        city
      );
    }
  }

  const category = detectCategory(text);

  return {
    title: extractTitle(caption),
    venueName,
    city,
    eventDate,
    category,
    contentType,
    recurrenceDay: recurrence.recurrenceDay,
    recurrenceTime: recurrence.recurrenceTime,
    recurrenceEndDate: null,
    workshopStartDate: contentType === "workshop" ? eventDate : null,
    workshopEndDate: contentType === "workshop" && eventDate
      ? new Date(eventDate.getTime() + 30 * 24 * 60 * 60 * 1000)
      : null,
    price,
    duration,
    description: caption.substring(0, 500),
    sourceUrl: post.url || `https://www.instagram.com/p/${post.shortCode || ""}`,
    sourceType: "instagram",
    confidence: isLikelyEvent ? 0.6 : 0.4,
    rawContent: caption.substring(0, 2000),
    imageUrl,
    dedupHash,
    expiresAt: finalExpiresAt,
  };
}

/**
 * Get the best image URL from an Instagram post.
 */
function getImageUrl(post: ApifyInstagramPost): string | null {
  return post.displayUrl || post.imageUrl || (post.images && post.images[0]) || null;
}

/**
 * Try to extract a specific event date from caption text.
 * Reuses the same patterns as the Facebook normalizer.
 */
function extractEventDateFromText(text: string): Date | undefined {
  const currentYear = new Date().getFullYear();

  const monthNames: Record<string, number> = {
    january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
    july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
    jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
    enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
    julio: 6, agosto: 7, septiembre: 8, octubre: 9, noviembre: 10, diciembre: 11,
    abr: 3,
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
 * Extract a short title from the caption (first line or first sentence).
 */
function extractTitle(text: string): string {
  if (!text) return "Instagram post";

  const firstLine = text.split("\n")[0].trim();

  if (firstLine.length > 80) {
    const firstSentence = firstLine.match(/^[^.!?]+[.!?]/);
    if (firstSentence) return firstSentence[0].trim();
    return firstLine.substring(0, 77) + "...";
  }

  return firstLine || text.substring(0, 77) + "...";
}

/**
 * Check if caption text contains event-related signals.
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
    /menu|menú|cena|dinner|brunch/i,
  ];

  let matchCount = 0;
  for (const signal of signals) {
    if (signal.test(text)) matchCount++;
  }

  return matchCount >= 2;
}

/**
 * Detect category from caption keywords.
 */
function detectCategory(text: string): "music" | "food" | "nightlife" | "culture" | "sports" | "wellness" | "tour" | "class" | "adventure" | "wine" | "popup" | "other" {
  const categoryPatterns: Array<[RegExp, "music" | "food" | "nightlife" | "culture" | "sports" | "wellness" | "tour" | "class" | "adventure" | "wine" | "popup"]> = [
    [/concierto|concert|live music|en vivo|dj\b|jazz|blues|rock|salsa|cumbia|musica|música|banda|band/i, "music"],
    [/restaurante|restaurant|brunch|cena|dinner|comida|food|menu|menú|gastronomia|chef/i, "food"],
    [/bar|club|nightlife|fiesta|party|noche|night|after\s*party/i, "nightlife"],
    [/museo|museum|galeria|gallery|arte|art|exposicion|exposición|cultura|theater|teatro/i, "culture"],
    [/deporte|sport|futbol|football|carrera|race|torneo|tournament/i, "sports"],
    [/yoga|meditacion|meditation|wellness|bienestar|spa|retiro|retreat|salud|health/i, "wellness"],
    [/tour|recorrido|visita|excursion|paseo/i, "tour"],
    [/taller|workshop|clase|class|curso|course|masterclass/i, "class"],
    [/aventura|adventure|hiking|senderismo|kayak|ciclismo|cycling/i, "adventure"],
    [/vino|wine|vinedo|vineyard|cata|tasting|bodega|winery/i, "wine"],
    [/popup|pop.up|mercado|market|bazar|bazaar|feria/i, "popup"],
  ];

  for (const [pattern, category] of categoryPatterns) {
    if (pattern.test(text)) return category;
  }

  return "other";
}

/**
 * Classify Instagram post into content_type.
 */
function classifyContentType(
  text: string,
  isLikelyEvent: boolean,
  eventDate: Date | null,
  isRecurring: boolean,
  isWorkshop: boolean
): string {
  if (isWorkshop && isRecurring) return "recurring";
  if (isWorkshop) return "workshop";
  if (isRecurring) return "recurring";

  const specificDateSignals = [
    /esta noche|tonight/i,
    /hoy\b|today\b/i,
    /este (viernes|sabado|sábado|domingo|lunes|martes|miercoles|miércoles|jueves)/i,
    /this (friday|saturday|sunday|monday|tuesday|wednesday|thursday)/i,
    /\d{1,2}\s*de\s*(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/i,
    /\d{1,2}\/\d{1,2}\/\d{2,4}/i,
    /\d{4}-\d{2}-\d{2}/i,
  ];

  const hasSpecificDate = specificDateSignals.some((p) => p.test(text));

  if (hasSpecificDate || (isLikelyEvent && eventDate)) {
    return "event";
  }

  const activitySignals = [
    /todos los dias|every day|daily/i,
    /todos los (lunes|martes|miercoles|jueves|viernes|sabados|domingos)/i,
    /every (monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
    /abierto|open daily|horario|hours/i,
    /permanente|permanent|siempre|always/i,
    /menu del dia|daily special|happy hour/i,
    /de\s+\d{1,2}(:\d{2})?\s*(a|to)\s+\d{1,2}(:\d{2})?\s*(am|pm|hrs)?/i,
  ];

  const hasActivitySignal = activitySignals.some((p) => p.test(text));

  if (hasActivitySignal && isLikelyEvent) return "activity";
  if (isLikelyEvent) return "event";
  return "post";
}
