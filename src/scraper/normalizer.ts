import type { ApifyFacebookPost } from "./apify.js";
import type { NewEvent } from "../db/schema.js";
import { eventDeduplicationHash } from "../utils/hash.js";
import { detectRecurrence, detectWorkshop, extractPrice, extractDuration } from "./web-scraper.js";

/**
 * Normalize an Apify Facebook post into a NewEvent.
 * Facebook posts are raw text, not structured events, so we extract
 * what we can and rely on the LLM extractor to enrich later.
 */
export function normalizeApifyPost(
  post: ApifyFacebookPost,
  city: string,
  sourceUrl: string
): NewEvent | null {
  if (!post.text || post.text.length < 10) return null;

  // Skip non-event posts (shares, generic updates)
  const text = post.text.toLowerCase();
  const isLikelyEvent = hasEventSignals(text);

  // IMPORTANT: post.time is when the post was PUBLISHED, not when the event is.
  // Don't use it as eventDate. The real event date comes from:
  // 1. Text extraction (LLM parses "Saturday April 11, 5pm" from the post text)
  // 2. Image analysis (Claude Vision reads the flyer)
  // We store post.time only as metadata, not as the event date.
  const postDate = post.time ? new Date(post.time) : null;
  // Don't use post publication date as event date.
  // Try to extract a real event date from the text first.
  // If text mentions a specific date, use that. Otherwise leave null for LLM/Vision to fill.
  let eventDate: Date | null = extractEventDateFromText(post.text) ?? null;
  const pageName = post.pageName || null;

  // Use page name as venue name
  const venueName = pageName
    ? pageName.replace(/([A-Z])/g, " $1").trim() // CamelCase to spaces
    : null;

  let dedupHash: string | undefined;
  if (venueName && eventDate) {
    dedupHash = eventDeduplicationHash(
      venueName,
      eventDate.toISOString(),
      city
    );
  }

  // Get image from media
  let imageUrl: string | null = null;
  if (post.media && post.media.length > 0) {
    const firstMedia = post.media[0];
    imageUrl =
      firstMedia.photo_image?.uri || firstMedia.thumbnail || null;
  }

  const expiresAt = eventDate
    ? new Date(eventDate.getTime() + 7 * 24 * 60 * 60 * 1000) // 7 days for FB posts
    : null;

  // Detect recurrence and workshop signals
  const fullText = post.text;
  const recurrence = detectRecurrence(fullText);
  const isWorkshop = detectWorkshop(fullText);
  const price = extractPrice(fullText);
  const duration = extractDuration(fullText);

  // Classify content_type based on event signals + recurrence + workshop detection
  const contentType = classifyContentType(text, isLikelyEvent, eventDate, recurrence.isRecurring, isWorkshop);

  // For recurring events, set a stable dedup hash and longer expiry
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

  return {
    title: extractTitle(post.text),
    venueName,
    city,
    eventDate,
    category: "other", // LLM extractor will enrich this
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
    description: post.text.substring(0, 500),
    sourceUrl: post.url || sourceUrl,
    sourceType: "facebook_page",
    confidence: isLikelyEvent ? 0.7 : 0.4,
    rawContent: post.text.substring(0, 2000),
    imageUrl,
    dedupHash,
    expiresAt: finalExpiresAt,
  };
}

/**
 * Try to extract a specific event date from post text.
 * Looks for patterns like "April 11", "11 de abril", "Sabado 11", etc.
 */
function extractEventDateFromText(text: string): Date | undefined {
  const currentYear = new Date().getFullYear();

  // Pattern: "April 11" or "Apr 11" or "11 April"
  const monthNames: Record<string, number> = {
    january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
    july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
    jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
    enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
    julio: 6, agosto: 7, septiembre: 8, octubre: 9, noviembre: 10, diciembre: 11,
    abr: 3,
  };

  // "April 11" / "Apr 11th" / "11 de abril"
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

export function normalizeApifyPosts(
  posts: ApifyFacebookPost[],
  city: string,
  sourceUrl: string
): NewEvent[] {
  return posts
    .map((post) => normalizeApifyPost(post, city, sourceUrl))
    .filter((e): e is NewEvent => e !== null && (e.confidence ?? 0) >= 0.5);
}

/**
 * Extract a short title from the post text (first line or first sentence).
 */
function extractTitle(text: string): string {
  // Take first line
  const firstLine = text.split("\n")[0].trim();

  // If too long, take first sentence
  if (firstLine.length > 80) {
    const firstSentence = firstLine.match(/^[^.!?]+[.!?]/);
    if (firstSentence) return firstSentence[0].trim();
    return firstLine.substring(0, 77) + "...";
  }

  return firstLine || text.substring(0, 77) + "...";
}

/**
 * Check if post text contains event-related signals.
 */
function hasEventSignals(text: string): boolean {
  const signals = [
    /esta noche|tonight|hoy|today/i,
    /en vivo|live music|live band/i,
    /concierto|concert/i,
    /evento|event/i,
    /reserva|booking|reservation/i,
    /cover|entrada|admission/i,
    /\d{1,2}:\d{2}|hrs|pm|am/i, // Time patterns
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
 * Classify Facebook post into content_type:
 * - 'event': has specific date/time signals (tonight, this saturday, date, time)
 * - 'recurring': happens on a specific day every week
 * - 'workshop': is a class, taller, workshop, curso
 * - 'activity': recurring/permanent (every day, always, open daily, daily specials)
 * - 'post': generic content about the business (no event signals)
 */
function classifyContentType(
  text: string,
  isLikelyEvent: boolean,
  eventDate: Date | null,
  isRecurring: boolean,
  isWorkshop: boolean
): string {
  // Workshop/class detection takes priority for recurring classes
  if (isWorkshop && isRecurring) {
    return "recurring"; // Recurring class = recurring content_type
  }

  if (isWorkshop) {
    return "workshop";
  }

  if (isRecurring) {
    return "recurring";
  }

  // Strong date/time signals -> event
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

  // Recurring/permanent activity signals
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

  if (hasActivitySignal && isLikelyEvent) {
    return "activity";
  }

  // If it has event signals but no specific date, still an event (low confidence)
  if (isLikelyEvent) {
    return "event";
  }

  // Generic post about the business
  return "post";
}

// Keep backward compatibility
export { normalizeApifyPosts as normalizeApifyEvents };
