import { getLogger } from "../utils/logger.js";
import { eventDeduplicationHash } from "../utils/hash.js";
import type { NewEvent } from "../db/schema.js";

const logger = getLogger();

/**
 * Scrape Eventbrite for events in San Miguel de Allende
 */
export async function scrapeEventbrite(): Promise<NewEvent[]> {
  const url =
    "https://www.eventbrite.com/d/mexico--san-miguel-de-allende/events/";
  logger.info({ url }, "Scraping Eventbrite");

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; WhatsAppLocalBot/1.0)" },
    });
    const html = await response.text();
    return parseEventbriteHTML(html);
  } catch (error) {
    logger.error({ error }, "Eventbrite scrape failed");
    return [];
  }
}

/**
 * Scrape Bandsintown for concerts in San Miguel de Allende
 */
export async function scrapeBandsintown(): Promise<NewEvent[]> {
  const url =
    "https://www.bandsintown.com/c/san-miguel-de-allende-mexico";
  logger.info({ url }, "Scraping Bandsintown");

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; WhatsAppLocalBot/1.0)" },
    });
    const html = await response.text();
    return parseBandsintownHTML(html);
  } catch (error) {
    logger.error({ error }, "Bandsintown scrape failed");
    return [];
  }
}

function parseEventbriteHTML(html: string): NewEvent[] {
  const events: NewEvent[] = [];

  // Eventbrite uses structured data (JSON-LD) in the page
  const jsonLdPattern = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi;
  let match;

  while ((match = jsonLdPattern.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      const items = Array.isArray(data) ? data : [data];

      for (const item of items) {
        if (item["@type"] !== "Event") continue;

        const eventDate = item.startDate ? new Date(item.startDate) : null;
        const venueName = item.location?.name || null;

        events.push({
          title: item.name || "Eventbrite Event",
          venueName,
          venueAddress: item.location?.address?.streetAddress || null,
          city: "San Miguel de Allende",
          eventDate,
          eventEndDate: item.endDate ? new Date(item.endDate) : null,
          category: "other",
          description: (item.description || "").substring(0, 500),
          sourceUrl: item.url || null,
          sourceType: "platform",
          confidence: 0.9,
          rawContent: JSON.stringify(item).substring(0, 2000),
          imageUrl: item.image?.[0] || item.image || null,
          dedupHash: venueName && eventDate
            ? eventDeduplicationHash(venueName, eventDate.toISOString(), "San Miguel de Allende")
            : undefined,
          expiresAt: eventDate
            ? new Date(eventDate.getTime() + 24 * 60 * 60 * 1000 - 1)
            : null,
        });
      }
    } catch {
      // Skip invalid JSON-LD blocks
    }
  }

  // Fallback: parse event cards from HTML
  if (events.length === 0) {
    const cardPattern =
      /data-event-id="[^"]*"[\s\S]*?<a[^>]*href="(https:\/\/www\.eventbrite\.com\/e\/[^"]*)"[^>]*>[\s\S]*?class="[^"]*event-card__title[^"]*"[^>]*>([^<]+)/gi;

    while ((match = cardPattern.exec(html)) !== null) {
      events.push({
        title: match[2].trim(),
        city: "San Miguel de Allende",
        sourceUrl: match[1],
        sourceType: "platform",
        confidence: 0.8,
        category: "other",
        description: null,
        rawContent: null,
        imageUrl: null,
        dedupHash: undefined,
        expiresAt: null,
      });
    }
  }

  logger.info({ count: events.length }, "Eventbrite events parsed");
  return events;
}

function parseBandsintownHTML(html: string): NewEvent[] {
  const events: NewEvent[] = [];

  // Bandsintown also uses JSON-LD
  const jsonLdPattern = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi;
  let match;

  while ((match = jsonLdPattern.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      const items = Array.isArray(data) ? data : [data];

      for (const item of items) {
        if (item["@type"] !== "MusicEvent" && item["@type"] !== "Event") continue;

        const eventDate = item.startDate ? new Date(item.startDate) : null;
        const venueName = item.location?.name || null;
        const performer = item.performer?.name || item.performer?.[0]?.name || null;
        // Get image from JSON-LD or performer image
        const imageUrl = item.image?.[0] || item.image
          || item.performer?.image || item.performer?.[0]?.image || null;

        events.push({
          title: performer
            ? `${performer} en ${venueName || "San Miguel"}`
            : item.name || "Concert",
          venueName,
          venueAddress: item.location?.address?.streetAddress || null,
          city: "San Miguel de Allende",
          eventDate,
          category: "music",
          description: performer ? `Concierto de ${performer}` : null,
          sourceUrl: item.url || null,
          sourceType: "platform",
          confidence: 0.95,
          rawContent: JSON.stringify(item).substring(0, 2000),
          imageUrl,
          dedupHash: venueName && eventDate
            ? eventDeduplicationHash(
                performer || item.name || "concert",
                eventDate.toISOString(),
                "San Miguel de Allende"
              )
            : undefined,
          expiresAt: eventDate
            ? new Date(eventDate.getTime() + 24 * 60 * 60 * 1000 - 1)
            : null,
        });
      }
    } catch {
      // Skip invalid JSON-LD
    }
  }

  logger.info({ count: events.length }, "Bandsintown events parsed");
  return events;
}

/**
 * Fetch artist image from Bandsintown public API.
 * Used as fallback for events without images.
 */
export async function fetchBandsintownArtistImage(artistName: string): Promise<string | null> {
  try {
    const encoded = encodeURIComponent(artistName);
    const url = `https://rest.bandsintown.com/artists/${encoded}?app_id=squarespace-whatsapplocal`;
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const data = await response.json() as any;
    const img = data?.image_url || data?.thumb_url || null;
    if (img && img.startsWith("http") && !img.includes("no-img") && img.length > 20) {
      return img;
    }
    return null;
  } catch {
    return null;
  }
}
