import type { ApifyRawEvent } from "./apify.js";
import type { NewEvent } from "../db/schema.js";
import { eventDeduplicationHash } from "../utils/hash.js";

export function normalizeApifyEvent(
  raw: ApifyRawEvent,
  city: string,
  sourceUrl: string
): NewEvent | null {
  if (!raw.name) return null;

  const venueName = raw.location?.name ?? null;
  const eventDate = raw.startDate ? new Date(raw.startDate) : null;

  let dedupHash: string | undefined;
  if (venueName && eventDate) {
    dedupHash = eventDeduplicationHash(
      venueName,
      eventDate.toISOString(),
      city
    );
  }

  const expiresAt = eventDate
    ? new Date(eventDate.getTime() + 6 * 60 * 60 * 1000)
    : null;

  return {
    title: raw.name,
    venueName,
    venueAddress: raw.location?.address ?? null,
    city,
    eventDate,
    eventEndDate: raw.endDate ? new Date(raw.endDate) : null,
    category: "other",
    description: raw.description?.slice(0, 500) ?? null,
    sourceUrl: raw.url ?? sourceUrl,
    sourceType: "facebook_page",
    confidence: 0.9,
    rawContent: JSON.stringify(raw).slice(0, 2000),
    imageUrl: typeof raw.image === "string" ? raw.image : null,
    dedupHash,
    expiresAt,
  };
}

export function normalizeApifyEvents(
  rawEvents: ApifyRawEvent[],
  city: string,
  sourceUrl: string
): NewEvent[] {
  return rawEvents
    .map((raw) => normalizeApifyEvent(raw, city, sourceUrl))
    .filter((e): e is NewEvent => e !== null);
}
