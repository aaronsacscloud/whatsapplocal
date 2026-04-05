/**
 * Scraper for visitsanmiguel.travel — Wix-based event listing.
 * Extracts event data embedded in the SSR HTML (no API needed).
 */

import { getLogger } from "../utils/logger.js";
import type { NewEvent } from "../db/schema.js";
import { eventDeduplicationHash } from "../utils/hash.js";
import { sanitizeImageForStorage } from "../utils/image-sanitizer.js";

const logger = getLogger();

interface WixEvent {
  title: string;
  startDate: string;
  endDate?: string;
  location?: string;
  imageUrl?: string;
  description?: string;
}

/**
 * Scrape events from visitsanmiguel.travel/event-list
 */
export async function scrapeVisitSMA(): Promise<NewEvent[]> {
  const url = "https://www.visitsanmiguel.travel/event-list";
  logger.info({ url }, "Scraping visitsanmiguel.travel");

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; WhatsAppLocalBot/1.0)" },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      logger.error({ status: response.status }, "visitsanmiguel.travel fetch failed");
      return [];
    }

    const html = await response.text();
    const rawEvents = parseWixEvents(html);

    logger.info({ count: rawEvents.length }, "Parsed events from visitsanmiguel.travel");

    return rawEvents
      .filter((e) => e.title.length > 3 && !e.title.includes("Gracias"))
      .map((raw) => wixEventToNewEvent(raw))
      .filter((e): e is NewEvent => e !== null);
  } catch (error) {
    logger.error({ error }, "Failed to scrape visitsanmiguel.travel");
    return [];
  }
}

/**
 * Parse Wix SSR HTML to extract event data.
 * Wix embeds event data as JSON in the rendered HTML.
 */
function parseWixEvents(html: string): WixEvent[] {
  const events: WixEvent[] = [];

  // Extract title + startDate pairs
  const titleDatePattern =
    /"title"\s*:\s*"([^"]{3,120})"\s*,[\s\S]*?"startDate"\s*:\s*"(\d{4}-\d{2}-\d{2}T[^"]+)"/g;

  // Extract all images
  const imgPattern = /"mainImage"\s*:\s*\{[^}]*"url"\s*:\s*"([^"]+)"/g;
  const images: string[] = [];
  let im;
  while ((im = imgPattern.exec(html)) !== null) {
    // Unescape Wix URL format
    images.push(im[1].replace(/\\\//g, "/"));
  }

  // Extract all locations
  const locPattern = /"location"\s*:\s*\{[^}]*"name"\s*:\s*"([^"]+)"/g;
  const locations: string[] = [];
  let lm;
  while ((lm = locPattern.exec(html)) !== null) {
    locations.push(lm[1]);
  }

  let match;
  let idx = 0;
  while ((match = titleDatePattern.exec(html)) !== null) {
    const title = match[1];
    // Skip navigation/menu items
    if (
      title.includes("wix") ||
      title.includes("http") ||
      title.length < 5 ||
      title === "Detalles y registro" ||
      title === "Página de servicio"
    ) {
      continue;
    }

    events.push({
      title,
      startDate: match[2],
      imageUrl: images[idx] || undefined,
      location: locations[idx] || undefined,
    });
    idx++;
  }

  return events;
}

/**
 * Convert a Wix event to our NewEvent format.
 */
function wixEventToNewEvent(raw: WixEvent): NewEvent | null {
  const eventDate = new Date(raw.startDate);
  if (isNaN(eventDate.getTime())) return null;

  // Skip past events
  if (eventDate < new Date()) return null;

  const imageUrl = raw.imageUrl ? sanitizeImageForStorage(raw.imageUrl) : null;

  const dedupHash = eventDeduplicationHash(
    raw.title,
    eventDate.toISOString(),
    "San Miguel de Allende"
  );

  return {
    title: raw.title,
    venueName: raw.location || null,
    venueAddress: null,
    neighborhood: null,
    city: "San Miguel de Allende",
    eventDate,
    eventEndDate: null,
    category: detectCategory(raw.title),
    contentType: "event",
    description: raw.description || null,
    sourceUrl: "https://www.visitsanmiguel.travel/event-list",
    sourceType: "website",
    confidence: 0.8,
    rawContent: null,
    imageUrl: imageUrl ?? undefined,
    dedupHash,
    scrapedAt: new Date(),
    freshnessScore: 1.0,
    sourceCount: 1,
    expiresAt: new Date(eventDate.getTime() + 24 * 60 * 60 * 1000),
  } as NewEvent;
}

function detectCategory(title: string): string {
  const lower = title.toLowerCase();
  if (/yoga|wellness|bienestar|meditaci/i.test(lower)) return "wellness";
  if (/misa|iglesia|capilla|templo|pascua/i.test(lower)) return "culture";
  if (/feria|arte|artesani|gastronomia/i.test(lower)) return "culture";
  if (/teatro|obra|picasso|dramaturgia/i.test(lower)) return "culture";
  if (/habana|jazz|music|concert|concierto/i.test(lower)) return "music";
  if (/conferencia|charla/i.test(lower)) return "culture";
  if (/sale|warehouse|venta/i.test(lower)) return "popup";
  return "other";
}
