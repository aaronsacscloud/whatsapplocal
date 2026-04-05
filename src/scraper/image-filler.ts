import { getDb } from "../db/index.js";
import { events } from "../db/schema.js";
import { eq, isNull, and, gt, sql } from "drizzle-orm";
import { getLogger } from "../utils/logger.js";

const logger = getLogger();

/**
 * Fill missing images for events that have a sourceUrl.
 * Fetches the event page and extracts og:image or the first relevant image.
 * Runs as a background job after scraping.
 */
export async function fillMissingImages(): Promise<number> {
  const db = getDb();

  // Find events without images that have a source URL
  const eventsWithoutImages = await db
    .select({ id: events.id, title: events.title, sourceUrl: events.sourceUrl })
    .from(events)
    .where(
      and(
        gt(events.eventDate, new Date()),
        isNull(events.imageUrl),
        sql`${events.sourceUrl} IS NOT NULL AND LENGTH(${events.sourceUrl}) > 10`
      )
    )
    .limit(20); // Process 20 at a time to avoid rate limits

  if (eventsWithoutImages.length === 0) return 0;

  logger.info({ count: eventsWithoutImages.length }, "Filling missing event images");

  let filled = 0;

  for (const event of eventsWithoutImages) {
    try {
      const imageUrl = await extractImageFromUrl(event.sourceUrl!);
      if (imageUrl) {
        await db
          .update(events)
          .set({ imageUrl })
          .where(eq(events.id, event.id));
        filled++;
        logger.debug({ title: event.title?.substring(0, 30), imageUrl: imageUrl.substring(0, 60) }, "Image filled");
      }
    } catch (error) {
      // Skip this event, try next
    }
  }

  logger.info({ filled, attempted: eventsWithoutImages.length }, "Image fill complete");
  return filled;
}

/**
 * Extract the best image URL from a web page.
 * Priority: og:image > twitter:image > first large image.
 */
async function extractImageFromUrl(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; WhatsAppLocalBot/1.0)" },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) return null;

    const html = await response.text();

    // Try og:image first (most reliable)
    const ogMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
    if (ogMatch?.[1] && isValidImageUrl(ogMatch[1])) {
      return ogMatch[1];
    }

    // Try twitter:image
    const twitterMatch = html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:image["']/i);
    if (twitterMatch?.[1] && isValidImageUrl(twitterMatch[1])) {
      return twitterMatch[1];
    }

    // Try first large image in content
    const imgMatches = html.matchAll(/<img[^>]*src=["']([^"']+)["'][^>]*/gi);
    for (const m of imgMatches) {
      const src = m[1];
      if (isValidImageUrl(src) && !isIconOrLogo(src)) {
        return src;
      }
    }

    return null;
  } catch {
    return null;
  }
}

function isValidImageUrl(url: string): boolean {
  if (!url || url.length < 15) return false;
  if (!url.startsWith("http")) return false;
  // Skip tiny icons, tracking pixels, SVGs
  if (url.includes("1x1") || url.includes("pixel") || url.endsWith(".svg")) return false;
  return true;
}

function isIconOrLogo(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.includes("logo") || lower.includes("icon") || lower.includes("favicon")
    || lower.includes("avatar") || lower.includes("sprite") || lower.includes("badge");
}
