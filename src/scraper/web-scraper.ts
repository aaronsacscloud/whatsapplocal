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

  // sanmiguellive.com structure:
  //   <div class="...">
  //     <img src="/storage/events/XXX.webp" alt="EVENT TITLE">  ← image BEFORE h3
  //     <h3><a href="URL">TITLE</a></h3>
  //     <ul><li><strong>Venue:</strong> ...</li></ul>
  //   </div>
  //
  // Strategy: find each <img> with alt + event URL, then find the h3 and details after it.
  // We split by event cards and extract image + title + details from each card.

  // Find all event card blocks: image followed by h3
  // Match: everything from an event image to the next event image (or end)
  const cardPattern = /<img[^>]*src="([^"]*storage\/events\/[^"]*)"[^>]*alt="([^"]*)"[^>]*>[\s\S]*?<h3[^>]*>\s*<a[^>]*href="([^"]*)"[^>]*>[^<]*<\/a>\s*<\/h3>([\s\S]*?)(?=<img[^>]*storage\/events|$)/gi;

  let match;
  while ((match = cardPattern.exec(html)) !== null) {
    const [, imgSrc, imgAlt, eventUrl, detailsBlock] = match;

    const venue = extractField(detailsBlock, "Venue");
    const fieldDate = extractField(detailsBlock, "Date");
    const urlDateTime = extractDateTimeFromUrl(eventUrl);
    const htmlTime = extractTimeFromHTML(detailsBlock);
    const category = extractField(detailsBlock, "Event Category");
    const genres = extractField(detailsBlock, "Genres");
    const area = extractField(detailsBlock, "Area");
    const performers = extractField(detailsBlock, "Performers");

    // Use alt text as title (most reliable), fallback to h3 content
    const title = imgAlt || "";

    // Build the best date+time string
    let dateStr: string | undefined;
    if (urlDateTime) {
      const time = urlDateTime.time || htmlTime;
      const isoString = time
        ? `${urlDateTime.date}T${time}:00-06:00`
        : `${urlDateTime.date}T00:00:00-06:00`;
      dateStr = isoString;
    } else if (fieldDate) {
      dateStr = fieldDate;
    }

    // Image: from the <img> tag of THIS card (matched correctly now)
    const imageUrl = imgSrc
      ? (imgSrc.startsWith("http") ? imgSrc : `https://sanmiguellive.com${imgSrc}`)
      : undefined;

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
        ? (eventUrl.startsWith("http") ? eventUrl : `https://sanmiguellive.com${eventUrl}`)
        : undefined,
      imageUrl,
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

function extractDateTimeFromUrl(url: string): { date: string; time: string | null } | null {
  const dateMatch = url.match(/(\d{4}-\d{2}-\d{2})/);
  if (!dateMatch) return null;
  const timeMatch = url.match(/(\d{4}-\d{2}-\d{2})\/(\d{2}:\d{2})/);
  return {
    date: dateMatch[1],
    time: timeMatch ? timeMatch[2] : null,
  };
}

/**
 * Extract time from HTML text near an event listing.
 * Looks for patterns like "11:30am", "8:00pm", "19:30", "8 PM"
 */
function extractTimeFromHTML(html: string): string | null {
  // Match 12-hour time: "8:00pm", "11:30 AM", "8 pm"
  const time12Match = html.match(/(\d{1,2}):(\d{2})\s*(am|pm|AM|PM)/);
  if (time12Match) {
    let hours = parseInt(time12Match[1], 10);
    const minutes = time12Match[2];
    const period = time12Match[3].toLowerCase();
    if (period === "pm" && hours !== 12) hours += 12;
    if (period === "am" && hours === 12) hours = 0;
    return `${hours.toString().padStart(2, "0")}:${minutes}`;
  }

  // Match "8 PM" / "8PM" (no minutes)
  const timeNoMinMatch = html.match(/\b(\d{1,2})\s*(am|pm|AM|PM)\b/);
  if (timeNoMinMatch) {
    let hours = parseInt(timeNoMinMatch[1], 10);
    const period = timeNoMinMatch[2].toLowerCase();
    if (period === "pm" && hours !== 12) hours += 12;
    if (period === "am" && hours === 12) hours = 0;
    return `${hours.toString().padStart(2, "0")}:00`;
  }

  // Match 24-hour time: "19:30", "20:00" (but not year-like 2026)
  const time24Match = html.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (time24Match) {
    const hours = parseInt(time24Match[1], 10);
    // Skip if this looks like it's part of a date (e.g., within a URL date)
    if (hours >= 6 && hours <= 23) {
      return `${hours.toString().padStart(2, "0")}:${time24Match[2]}`;
    }
  }

  return null;
}

function mapCategory(
  raw: string
): string {
  const lower = raw.toLowerCase();
  if (
    lower.includes("music") || lower.includes("jazz") || lower.includes("blues") ||
    lower.includes("cumbia") || lower.includes("salsa") || lower.includes("acoustic") ||
    lower.includes("dj") || lower.includes("concert") || lower.includes("concierto")
  )
    return "music";
  if (lower.includes("food") || lower.includes("gastro") || lower.includes("cocina") || lower.includes("brunch"))
    return "food";
  if (lower.includes("theater") || lower.includes("teatro") || lower.includes("art") || lower.includes("dance") || lower.includes("gallery"))
    return "culture";
  if (lower.includes("sport") || lower.includes("deporte") || lower.includes("golf") || lower.includes("tennis") || lower.includes("yoga") || lower.includes("crossfit"))
    return "sports";
  if (lower.includes("festival") || lower.includes("feria") || lower.includes("popup") || lower.includes("pop-up"))
    return "popup";
  if (lower.includes("night") || lower.includes("party") || lower.includes("fiesta"))
    return "nightlife";
  if (lower.includes("spa") || lower.includes("wellness") || lower.includes("temazcal") || lower.includes("meditation") || lower.includes("healing"))
    return "wellness";
  if (lower.includes("tour") || lower.includes("recorrido") || lower.includes("walk") || lower.includes("excursion"))
    return "tour";
  if (lower.includes("class") || lower.includes("taller") || lower.includes("workshop") || lower.includes("curso") || lower.includes("lesson"))
    return "class";
  if (lower.includes("balloon") || lower.includes("globo") || lower.includes("horseback") || lower.includes("cabalgata") || lower.includes("hiking") || lower.includes("adventure"))
    return "adventure";
  if (lower.includes("wine") || lower.includes("vino") || lower.includes("cata") || lower.includes("mezcal") || lower.includes("tasting"))
    return "wine";
  return "other";
}

/**
 * Detect recurrence patterns in title and description.
 * Returns { isRecurring, recurrenceDay, recurrenceTime } if found.
 */
export function detectRecurrence(title: string, description?: string): {
  isRecurring: boolean;
  recurrenceDay: number | null;
  recurrenceTime: string | null;
} {
  const text = `${title} ${description || ""}`.toLowerCase();

  // English day patterns: "Every Monday", "All Tuesdays", "Weekly on Wednesday"
  const enDayMap: Record<string, number> = {
    sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
    thursday: 4, friday: 5, saturday: 6,
    sundays: 0, mondays: 1, tuesdays: 2, wednesdays: 3,
    thursdays: 4, fridays: 5, saturdays: 6,
  };

  // Spanish day patterns: "Cada lunes", "Todos los martes"
  const esDayMap: Record<string, number> = {
    domingo: 0, domingos: 0,
    lunes: 1,
    martes: 2,
    "miércoles": 3, miercoles: 3,
    jueves: 4,
    viernes: 5,
    "sábado": 6, sabado: 6, "sábados": 6, sabados: 6,
  };

  // Check "Every [day]" / "All [days]" / "Weekly on [day]"
  const enPatterns = [
    /every\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)s?/i,
    /all\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)s?/i,
    /weekly\s+(?:on\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)s?/i,
  ];

  for (const pattern of enPatterns) {
    const match = text.match(pattern);
    if (match) {
      const dayName = match[1].toLowerCase();
      const day = enDayMap[dayName];
      if (day !== undefined) {
        return { isRecurring: true, recurrenceDay: day, recurrenceTime: extractTimeFromHTML(text) };
      }
    }
  }

  // Check "Cada [dia]" / "Todos los [dias]"
  const esPatterns = [
    /cada\s+(domingo|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado)s?/i,
    /todos\s+los\s+(domingo|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado)s?/i,
  ];

  for (const pattern of esPatterns) {
    const match = text.match(pattern);
    if (match) {
      const dayName = match[1].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const day = esDayMap[dayName];
      if (day !== undefined) {
        return { isRecurring: true, recurrenceDay: day, recurrenceTime: extractTimeFromHTML(text) };
      }
    }
  }

  // Generic recurring signals (no specific day)
  const genericRecurring = [
    /\bweekly\b/i,
    /\bsemanal\b/i,
    /\bdaily\b/i,
    /\bdiario\b/i,
    /\bevery week\b/i,
    /\bcada semana\b/i,
  ];

  for (const pattern of genericRecurring) {
    if (pattern.test(text)) {
      return { isRecurring: true, recurrenceDay: null, recurrenceTime: extractTimeFromHTML(text) };
    }
  }

  return { isRecurring: false, recurrenceDay: null, recurrenceTime: null };
}

/**
 * Detect if an event is a workshop/class based on category or text signals.
 */
export function detectWorkshop(title: string, category?: string, description?: string): boolean {
  const text = `${title} ${category || ""} ${description || ""}`.toLowerCase();

  const workshopSignals = [
    /\bworkshop\b/i,
    /\btaller\b/i,
    /\bclase\b/i,
    /\bclass\b/i,
    /\bcurso\b/i,
    /\bcourse\b/i,
    /\blesson\b/i,
    /\bleccion\b/i,
    /\bseminar\b/i,
    /\bseminario\b/i,
    /\btraining\b/i,
    /\bcapacitacion\b/i,
    /workshops\s*\/?\s*classes/i,
  ];

  return workshopSignals.some((p) => p.test(text));
}

/**
 * Extract price from text.
 * Matches patterns like "$100", "Cover: $200", "Free", "Gratis", "$500 MXN", "$50 USD"
 */
export function extractPrice(text: string): string | null {
  if (!text) return null;

  const lower = text.toLowerCase();

  // Check for free
  if (/\bfree\b|\bgratis\b|\bgratuito\b|\bsin costo\b|\bno cover\b|\bentrada libre\b/i.test(lower)) {
    return "Gratis";
  }

  // Match price patterns: $100, $100 MXN, $50 USD, Cover: $200, Entrada: $150
  const pricePatterns = [
    /(?:cover|entrada|costo|precio|price|fee|cost)[\s:]*\$?\s*(\d[\d,]*(?:\.\d{2})?)\s*(mxn|usd|pesos|dollars)?/i,
    /\$\s*(\d[\d,]*(?:\.\d{2})?)\s*(mxn|usd|pesos|dollars)?/i,
    /(\d[\d,]*(?:\.\d{2})?)\s*(mxn|usd|pesos|dollars)/i,
  ];

  for (const pattern of pricePatterns) {
    const match = text.match(pattern);
    if (match) {
      const amount = match[1];
      const currency = match[2] ? ` ${match[2].toUpperCase()}` : "";
      return `$${amount}${currency}`;
    }
  }

  return null;
}

/**
 * Extract duration from text.
 * Matches patterns like "2 hours", "2 horas", "3 dias", "90 minutes"
 */
export function extractDuration(text: string): string | null {
  if (!text) return null;

  const durationPatterns = [
    /(\d+(?:\.\d+)?)\s*(hours?|horas?|hrs?)/i,
    /(\d+(?:\.\d+)?)\s*(minutes?|minutos?|mins?)/i,
    /(\d+)\s*(days?|d[ií]as?)/i,
    /(\d+)\s*(weeks?|semanas?)/i,
    /(\d+)\s*(months?|meses?)/i,
  ];

  for (const pattern of durationPatterns) {
    const match = text.match(pattern);
    if (match) {
      return `${match[1]} ${match[2]}`;
    }
  }

  return null;
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

  // Detect recurrence from title and description
  const recurrence = detectRecurrence(raw.title, raw.description);
  const isWorkshop = detectWorkshop(raw.title, raw.category, raw.description);

  // Extract price and duration from description
  const fullText = `${raw.title} ${raw.description || ""}`;
  const price = extractPrice(fullText);
  const duration = extractDuration(fullText);

  // Determine content_type
  let contentType: string;
  if (recurrence.isRecurring && recurrence.recurrenceDay !== null) {
    contentType = "recurring";
  } else if (isWorkshop) {
    contentType = "workshop";
  } else if (eventDate) {
    contentType = "event";
  } else if (recurrence.isRecurring) {
    contentType = "recurring";
  } else {
    contentType = "activity";
  }

  // For recurring events, set a long expiry (6 months) or use recurrence_end_date
  // For workshops, expiry is workshop_end_date
  // For regular events, expire at end of day
  let expiresAt: Date | null = null;
  if (contentType === "event" && eventDate) {
    expiresAt = new Date(eventDate.getTime() + 24 * 60 * 60 * 1000 - 1);
  } else if (contentType === "recurring") {
    // Recurring events expire in 6 months by default
    expiresAt = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000);
  }

  // For recurring events without a specific date, generate a stable dedup hash
  if (!dedupHash && contentType === "recurring" && raw.venue) {
    dedupHash = eventDeduplicationHash(
      raw.venue,
      `recurring-${recurrence.recurrenceDay ?? "any"}`,
      city
    );
  }

  // For workshops without dedup, use title-based hash
  if (!dedupHash && contentType === "workshop" && raw.title) {
    dedupHash = eventDeduplicationHash(
      raw.title,
      "workshop",
      city
    );
  }

  return {
    title: raw.title,
    venueName: raw.venue || null,
    neighborhood: null,
    city,
    eventDate,
    category: (raw.category as any) || "other",
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
    description: raw.description || null,
    sourceUrl: raw.url || sourceUrl,
    sourceType: "website",
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
