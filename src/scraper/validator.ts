import type { NewEvent } from "../db/schema.js";
import { getLogger } from "../utils/logger.js";

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

// ─── Emoji regex: matches most common emoji ranges ───────────────────────
const EMOJI_REGEX =
  /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{20E3}]/gu;

// HTML entity patterns
const HTML_ENTITY_REGEX = /&(?:#\d+|#x[\da-fA-F]+|[a-zA-Z]+);/g;

// Common HTML entities map
const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
  "&ndash;": "-",
  "&mdash;": "--",
  "&hellip;": "...",
  "&iexcl;": "!",
  "&iquest;": "?",
  "&ntilde;": "n",
  "&Ntilde;": "N",
  "&aacute;": "a",
  "&eacute;": "e",
  "&iacute;": "i",
  "&oacute;": "o",
  "&uacute;": "u",
  "&Aacute;": "A",
  "&Eacute;": "E",
  "&Iacute;": "I",
  "&Oacute;": "O",
  "&Uacute;": "U",
  "&uuml;": "u",
  "&Uuml;": "U",
};

// Redundant venue prefixes (Spanish + English)
const VENUE_PREFIX_REGEX =
  /^(Restaurante|Restaurant|Bar|Cafe|Café|Cantina|Galería|Galeria|Gallery|Hotel|Hostal|Tienda|Shop|Boutique|Centro|Center|Salón|Salon|Jardín|Jardin)\s+/i;

/**
 * Validate an event before inserting into the database.
 * Returns { valid: true } if the event passes all checks,
 * or { valid: false, reason: "..." } explaining the rejection.
 */
export function isValidEvent(event: NewEvent): ValidationResult {
  // 1. Title must exist and not be empty
  if (!event.title || event.title.trim().length === 0) {
    return { valid: false, reason: "Missing title" };
  }

  // 2. Title is not just emojis
  const titleWithoutEmojis = event.title.replace(EMOJI_REGEX, "").trim();
  if (titleWithoutEmojis.length === 0) {
    return { valid: false, reason: "Title contains only emojis" };
  }

  // 3. Title not too long
  if (event.title.length > 200) {
    return { valid: false, reason: "Title too long (>200 chars)" };
  }

  // 4. If has event_date, it must be a valid date
  if (event.eventDate) {
    const d = new Date(event.eventDate);
    if (isNaN(d.getTime())) {
      return { valid: false, reason: "Invalid event date" };
    }

    // Not in the past (allow 1 day buffer for timezone differences)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (d < yesterday && event.contentType === "event") {
      return { valid: false, reason: "Event date is in the past" };
    }

    // Not more than 6 months ahead
    const sixMonthsAhead = new Date();
    sixMonthsAhead.setMonth(sixMonthsAhead.getMonth() + 6);
    if (d > sixMonthsAhead) {
      return { valid: false, reason: "Event date is more than 6 months ahead" };
    }
  }

  // 5. City should be San Miguel de Allende (flexible matching)
  if (event.city) {
    const cityLower = event.city.toLowerCase();
    const validCities = [
      "san miguel de allende",
      "san miguel",
      "sma",
    ];
    if (!validCities.some((c) => cityLower.includes(c))) {
      return { valid: false, reason: `Invalid city: ${event.city}` };
    }
  }

  // 6. If has price, it should be reasonable
  if (event.price) {
    const priceNum = parseNumericPrice(event.price);
    if (priceNum !== null) {
      if (priceNum < 0) {
        return { valid: false, reason: "Negative price" };
      }
      if (priceNum > 50000) {
        return { valid: false, reason: "Price exceeds $50,000" };
      }
    }
  }

  // 7. Confidence must be >= 0.4
  if (event.confidence !== undefined && event.confidence !== null && event.confidence < 0.4) {
    return { valid: false, reason: `Confidence too low: ${event.confidence}` };
  }

  // 8. Not spam: title doesn't contain only hashtags, @mentions, or URLs
  const spamPatterns = [
    /^[#@\s]+$/,                         // Only hashtags/mentions
    /^https?:\/\/[^\s]+$/,               // Only a URL
    /^(#\w+\s*){3,}$/,                   // Only multiple hashtags
    /^(@\w+\s*){3,}$/,                   // Only multiple mentions
  ];
  for (const pattern of spamPatterns) {
    if (pattern.test(event.title.trim())) {
      return { valid: false, reason: "Title looks like spam" };
    }
  }

  return { valid: true };
}

/**
 * Extract numeric value from a price string.
 * Handles "$100", "100 MXN", "$500 USD", "Gratis", etc.
 */
function parseNumericPrice(price: string): number | null {
  const cleaned = price
    .replace(/[,$]/g, "")
    .replace(/\s*(MXN|USD|pesos|dlls?|dollars?)\s*/gi, "")
    .trim();

  if (/gratis|free|libre/i.test(cleaned)) return 0;

  const match = cleaned.match(/[\d.]+/);
  if (match) return parseFloat(match[0]);

  return null;
}

/**
 * Clean up and normalize event data.
 * Returns a sanitized copy of the event.
 */
export function sanitizeEvent(event: NewEvent): NewEvent {
  const sanitized = { ...event };

  // 1. Remove excessive emojis from title (keep max 2)
  if (sanitized.title) {
    sanitized.title = limitEmojis(sanitized.title, 2);
  }

  // 2. Trim whitespace
  if (sanitized.title) {
    sanitized.title = sanitized.title.replace(/\s+/g, " ").trim();
  }
  if (sanitized.description) {
    sanitized.description = sanitized.description.trim();
  }
  if (sanitized.venueName) {
    sanitized.venueName = sanitized.venueName.trim();
  }
  if (sanitized.venueAddress) {
    sanitized.venueAddress = sanitized.venueAddress.trim();
  }

  // 3. Capitalize title properly (Title Case, but keep short words lowercase)
  if (sanitized.title) {
    sanitized.title = toTitleCase(sanitized.title);
  }

  // 4. Clean HTML entities from description
  if (sanitized.description) {
    sanitized.description = decodeHTMLEntities(sanitized.description);
  }

  // 5. Normalize venue names (strip redundant prefixes)
  if (sanitized.venueName) {
    sanitized.venueName = normalizeVenueDisplayName(sanitized.venueName);
  }

  // 6. Ensure image_url is a valid full URL
  if (sanitized.imageUrl) {
    if (!/^https?:\/\//i.test(sanitized.imageUrl)) {
      sanitized.imageUrl = null;
    }
  }

  return sanitized;
}

/**
 * Limit the number of emojis in a string.
 */
function limitEmojis(text: string, maxEmojis: number): string {
  let emojiCount = 0;
  return text.replace(EMOJI_REGEX, (match) => {
    emojiCount++;
    return emojiCount <= maxEmojis ? match : "";
  });
}

/**
 * Convert text to Title Case, keeping small words lowercase.
 */
function toTitleCase(text: string): string {
  const smallWords = new Set([
    "a", "al", "con", "de", "del", "el", "en", "la", "las", "lo", "los",
    "por", "un", "una", "y", "e", "o", "u",
    "an", "and", "at", "by", "for", "in", "of", "on", "or", "the", "to",
  ]);

  return text
    .split(" ")
    .map((word, index) => {
      // If the word is ALL CAPS and short (acronym), keep it
      if (word.length <= 4 && word === word.toUpperCase() && /^[A-Z]+$/.test(word)) {
        return word;
      }
      // First word is always capitalized
      if (index === 0) {
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      }
      // Small words stay lowercase (unless they follow a colon/dash)
      if (smallWords.has(word.toLowerCase())) {
        return word.toLowerCase();
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

/**
 * Decode HTML entities in a string.
 */
function decodeHTMLEntities(text: string): string {
  return text.replace(HTML_ENTITY_REGEX, (entity) => {
    // Check known entities
    if (HTML_ENTITIES[entity]) return HTML_ENTITIES[entity];

    // Numeric entities: &#123; or &#x1F;
    const numMatch = entity.match(/^&#(\d+);$/);
    if (numMatch) {
      return String.fromCodePoint(parseInt(numMatch[1], 10));
    }

    const hexMatch = entity.match(/^&#x([\da-fA-F]+);$/);
    if (hexMatch) {
      return String.fromCodePoint(parseInt(hexMatch[1], 16));
    }

    return entity; // Unknown, keep as-is
  });
}

/**
 * Normalize venue display name by removing redundant prefixes.
 */
function normalizeVenueDisplayName(name: string): string {
  return name.replace(VENUE_PREFIX_REGEX, "").trim();
}

/**
 * Validate and sanitize an array of events.
 * Returns only valid, sanitized events plus counts.
 */
export function validateAndSanitize(events: NewEvent[]): {
  valid: NewEvent[];
  rejected: number;
  reasons: Record<string, number>;
} {
  const logger = getLogger();
  const valid: NewEvent[] = [];
  let rejected = 0;
  const reasons: Record<string, number> = {};

  for (const event of events) {
    const result = isValidEvent(event);
    if (!result.valid) {
      rejected++;
      const reason = result.reason || "unknown";
      reasons[reason] = (reasons[reason] || 0) + 1;
      logger.debug(
        { title: event.title?.substring(0, 50), reason: result.reason },
        "Event rejected by validator"
      );
      continue;
    }

    valid.push(sanitizeEvent(event));
  }

  if (rejected > 0) {
    logger.info(
      { rejected, reasons, total: events.length },
      "Event validation complete"
    );
  }

  return { valid, rejected, reasons };
}
