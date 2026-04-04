import type { ApifyFacebookPost } from "./apify.js";
import type { NewEvent } from "../db/schema.js";
import { eventDeduplicationHash } from "../utils/hash.js";

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

  const eventDate = post.time ? new Date(post.time) : null;
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

  return {
    title: extractTitle(post.text),
    venueName,
    city,
    eventDate,
    category: "other", // LLM extractor will enrich this
    description: post.text.substring(0, 500),
    sourceUrl: post.url || sourceUrl,
    sourceType: "facebook_page",
    confidence: isLikelyEvent ? 0.7 : 0.4,
    rawContent: post.text.substring(0, 2000),
    imageUrl,
    dedupHash,
    expiresAt,
  };
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

// Keep backward compatibility
export { normalizeApifyPosts as normalizeApifyEvents };
