import { getLogger } from "../utils/logger.js";
import { extractEvent } from "../llm/extractor.js";
import { eventDeduplicationHash } from "../utils/hash.js";
import type { NewEvent } from "../db/schema.js";

const logger = getLogger();

interface ScrapedRawEvent {
  title: string;
  venue?: string;
  date?: string;
  time?: string;
  category?: string;
  description?: string;
  url?: string;
  imageUrl?: string;
}

/**
 * Scrape events from sanmiguellive.com
 */
export async function scrapeSanMiguelLive(): Promise<NewEvent[]> {
  const url = "https://sanmiguellive.com/";
  logger.info({ url }, "Scraping sanmiguellive.com");

  try {
    const response = await fetch(url);
    const html = await response.text();
    const rawEvents = parseSanMiguelLiveHTML(html);

    logger.info(
      { count: rawEvents.length },
      "Parsed events from sanmiguellive.com"
    );

    return rawEvents
      .map((raw) => rawToNewEvent(raw, "San Miguel de Allende", url))
      .filter((e): e is NewEvent => e !== null);
  } catch (error) {
    logger.error({ error }, "Failed to scrape sanmiguellive.com");
    return [];
  }
}

/**
 * Scrape events from discoversma.com via RSS feed
 */
export async function scrapeDiscoverSMA(): Promise<NewEvent[]> {
  const url = "https://discoversma.com/events/feed/";
  logger.info({ url }, "Scraping discoversma.com (RSS)");

  try {
    const response = await fetch(url);
    const xml = await response.text();
    const rawEvents = parseDiscoverSMARSS(xml);

    logger.info(
      { count: rawEvents.length },
      "Parsed events from discoversma.com RSS"
    );

    return rawEvents
      .map((raw) => rawToNewEvent(raw, "San Miguel de Allende", url))
      .filter((e): e is NewEvent => e !== null);
  } catch (error) {
    logger.error({ error }, "Failed to scrape discoversma.com");
    return [];
  }
}

/**
 * Parse sanmiguellive.com HTML into raw events.
 * Structure: event cards with h3 title, ul with venue/date/category details
 */
function parseSanMiguelLiveHTML(html: string): ScrapedRawEvent[] {
  const events: ScrapedRawEvent[] = [];

  // Extract event blocks: each event has a title in h3 and details in ul
  // Pattern: <h3><a href="...">[Title]</a></h3> ... <li><strong>Venue:</strong> [Venue]</li>
  const eventPattern =
    /<h3[^>]*>\s*<a[^>]*href="([^"]*)"[^>]*>([^<]+)<\/a>\s*<\/h3>([\s\S]*?)(?=<h3|$)/gi;

  let match;
  while ((match = eventPattern.exec(html)) !== null) {
    const [, eventUrl, title, detailsBlock] = match;

    const venue = extractField(detailsBlock, "Venue");
    const dateStr = extractField(detailsBlock, "Date") ||
      extractDateFromUrl(eventUrl);
    const category = extractField(detailsBlock, "Event Category");
    const genres = extractField(detailsBlock, "Genres");
    const area = extractField(detailsBlock, "Area");
    const performers = extractField(detailsBlock, "Performers");

    // Extract image
    const imgMatch = detailsBlock.match(/<img[^>]*src="([^"]*)"[^>]*>/i);

    let description = "";
    if (performers) description += `Artistas: ${performers}. `;
    if (genres) description += `Genero: ${genres}. `;
    if (area) description += `Zona: ${area}.`;

    events.push({
      title: decodeHTML(title.trim()),
      venue: venue ? decodeHTML(venue) : undefined,
      date: dateStr || undefined,
      category: mapCategory(category || genres || ""),
      description: description.trim() || undefined,
      url: eventUrl
        ? `https://sanmiguellive.com${eventUrl}`
        : undefined,
      imageUrl: imgMatch?.[1] || undefined,
    });
  }

  return events;
}

/**
 * Parse discoversma.com RSS feed into raw events.
 */
function parseDiscoverSMARSS(xml: string): ScrapedRawEvent[] {
  const events: ScrapedRawEvent[] = [];

  const itemPattern = /<item>([\s\S]*?)<\/item>/gi;
  let match;

  while ((match = itemPattern.exec(xml)) !== null) {
    const block = match[1];

    const title = extractXMLTag(block, "title");
    const link = extractXMLTag(block, "link");
    const pubDate = extractXMLTag(block, "pubDate");
    const description = extractXMLTag(block, "description");
    const categories = extractAllXMLTags(block, "category");

    if (title) {
      // Extract venue from title pattern: "Event Name [] Venue Name"
      const venueSplit = title.split(/\s*\[\]\s*/);
      const eventTitle = venueSplit[0].trim();
      const venue = venueSplit.length > 1 ? venueSplit[1].trim() : undefined;

      events.push({
        title: decodeHTML(eventTitle),
        venue: venue ? decodeHTML(venue) : undefined,
        date: pubDate || undefined,
        category: mapCategory(categories.join(" ")),
        description: description
          ? decodeHTML(description.replace(/<[^>]+>/g, " ").trim()).substring(0, 500)
          : undefined,
        url: link || undefined,
      });
    }
  }

  return events;
}

function extractXMLTag(xml: string, tag: string): string | null {
  // Handle CDATA: <tag><![CDATA[content]]></tag>
  const cdataPattern = new RegExp(
    `<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`,
    "i"
  );
  const cdataMatch = xml.match(cdataPattern);
  if (cdataMatch) return cdataMatch[1].trim();

  // Handle plain: <tag>content</tag>
  const plainPattern = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, "i");
  const plainMatch = xml.match(plainPattern);
  return plainMatch ? plainMatch[1].trim() : null;
}

function extractAllXMLTags(xml: string, tag: string): string[] {
  const results: string[] = [];
  const pattern = new RegExp(
    `<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`,
    "gi"
  );
  let match;
  while ((match = pattern.exec(xml)) !== null) {
    results.push(match[1].trim());
  }
  return results;
}

function extractField(html: string, fieldName: string): string | null {
  const pattern = new RegExp(
    `<strong>${fieldName}:?<\\/strong>\\s*([^<]+)`,
    "i"
  );
  const match = html.match(pattern);
  return match ? match[1].trim() : null;
}

function extractDateFromUrl(url: string): string | null {
  // URLs like /event/name/2026-04-05/20:00
  const match = url.match(/(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function mapCategory(
  raw: string
): "music" | "food" | "nightlife" | "culture" | "sports" | "popup" | "other" {
  const lower = raw.toLowerCase();
  if (
    lower.includes("music") ||
    lower.includes("jazz") ||
    lower.includes("blues") ||
    lower.includes("cumbia") ||
    lower.includes("salsa") ||
    lower.includes("acoustic") ||
    lower.includes("dj")
  )
    return "music";
  if (lower.includes("food") || lower.includes("gastro") || lower.includes("cocina"))
    return "food";
  if (lower.includes("theater") || lower.includes("teatro") || lower.includes("art") || lower.includes("dance"))
    return "culture";
  if (lower.includes("sport") || lower.includes("deporte"))
    return "sports";
  if (lower.includes("festival") || lower.includes("feria") || lower.includes("popup") || lower.includes("pop-up"))
    return "popup";
  if (lower.includes("night") || lower.includes("party") || lower.includes("fiesta"))
    return "nightlife";
  return "other";
}

function rawToNewEvent(
  raw: ScrapedRawEvent,
  city: string,
  sourceUrl: string
): NewEvent | null {
  if (!raw.title) return null;

  let eventDate: Date | null = null;
  if (raw.date) {
    const parsed = new Date(raw.date);
    if (!isNaN(parsed.getTime())) {
      eventDate = parsed;
    }
  }

  let dedupHash: string | undefined;
  if (raw.venue && eventDate) {
    dedupHash = eventDeduplicationHash(
      raw.venue,
      eventDate.toISOString(),
      city
    );
  }

  // Expire at end of day (23:59 UTC), not +6h from midnight
  const expiresAt = eventDate
    ? new Date(eventDate.getTime() + 24 * 60 * 60 * 1000 - 1)
    : null;

  return {
    title: raw.title,
    venueName: raw.venue || null,
    neighborhood: null,
    city,
    eventDate,
    category: (raw.category as any) || "other",
    description: raw.description || null,
    sourceUrl: raw.url || sourceUrl,
    sourceType: "facebook_page", // Using as generic "web" for now
    confidence: 0.85,
    rawContent: JSON.stringify(raw).slice(0, 2000),
    imageUrl: raw.imageUrl || null,
    dedupHash,
    expiresAt,
  };
}

function decodeHTML(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&ndash;/g, "-")
    .replace(/&mdash;/g, "-");
}
