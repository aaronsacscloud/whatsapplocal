import { getLLMClient } from "./client.js";
import { RESPONDER_SYSTEM, RESPONDER_SYSTEM_EN } from "./prompts.js";
import { getLogger } from "../utils/logger.js";
import { getLocalKnowledge } from "../knowledge/index.js";
import { getGoogleMapsUrl } from "../utils/maps.js";
import { sendImageMessage } from "../whatsapp/sender.js";
import type { Event } from "../db/schema.js";

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

// SMA timezone offset: UTC-6 (CST)
const SMA_TZ_OFFSET = -6;

function getSMANow(): Date {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utcMs + SMA_TZ_OFFSET * 3600000);
}

function getSMAToday(): Date {
  const sma = getSMANow();
  return new Date(sma.getFullYear(), sma.getMonth(), sma.getDate());
}

function formatEventCard(e: any, language: "es" | "en"): string {
  const isEn = language === "en";
  const lines: string[] = [];

  const emoji = getCategoryEmoji(e.category);
  lines.push(`${emoji} *${e.title}*`);

  // Venue + address
  const venue = e.venueName || e.venue_name;
  const addr = e.venueAddress || e.venue_address;
  if (venue) {
    lines.push(`📍 ${venue}${addr ? ` — ${addr}` : ", San Miguel de Allende"}`);
  }

  // Date and time in SMA timezone
  const eventDate = e.eventDate || e.event_date;
  if (eventDate) {
    const d = new Date(eventDate);
    // Adjust to SMA timezone for display
    const smaDate = new Date(d.getTime() + SMA_TZ_OFFSET * 3600000);
    const dateStr = smaDate.toLocaleDateString(isEn ? "en-US" : "es-MX", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "UTC", // We already adjusted
    });
    const hasTime = d.getUTCHours() !== 0 || d.getUTCMinutes() !== 0;
    if (hasTime) {
      const timeStr = smaDate.toLocaleTimeString(isEn ? "en-US" : "es-MX", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
        timeZone: "UTC",
      });
      lines.push(`📅 ${dateStr} — ${timeStr}`);
    } else {
      lines.push(`📅 ${dateStr}`);
    }
  }

  // Description
  if (e.description) {
    const desc = e.description.substring(0, 150);
    lines.push(desc + (e.description.length > 150 ? "..." : ""));
  }

  // Source URL (always show if available)
  const sourceUrl = e.sourceUrl || e.source_url;
  if (sourceUrl) {
    lines.push(`🔗 ${sourceUrl}`);
  }

  // Google Maps
  if (venue) {
    const mapsUrl = getGoogleMapsUrl(venue, addr);
    lines.push(`📌 ${mapsUrl}`);
  }

  return lines.join("\n");
}

function getCategoryEmoji(category: string | null): string {
  const emojis: Record<string, string> = {
    music: "🎵", food: "🍽️", nightlife: "🌙", culture: "🎨",
    sports: "⚽", popup: "🎪", wellness: "🧘", tour: "🚶",
    class: "📚", adventure: "🎈", wine: "🍷",
  };
  return emojis[category || ""] || "📌";
}

/**
 * Deduplicate events by title similarity
 */
function deduplicateByTitle(events: Event[]): Event[] {
  const seen = new Set<string>();
  return events.filter((e) => {
    const key = ((e as any).title || "").toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function generateResponse(
  userMessage: string,
  events: Event[],
  city: string,
  conversationHistory: ConversationMessage[] = [],
  language: "es" | "en" = "es",
  userPhone?: string
): Promise<string> {
  const logger = getLogger();
  const isEnglish = language === "en";

  // Deduplicate events by title
  const uniqueEvents = deduplicateByTitle(events);

  if (uniqueEvents.length > 0) {
    return formatRichResponse(uniqueEvents, userMessage, city, language, userPhone);
  }

  // No events: use LLM
  const client = getLLMClient();
  const knowledge = getLocalKnowledge();
  const baseSystem = isEnglish ? RESPONDER_SYSTEM_EN : RESPONDER_SYSTEM;
  const systemWithKnowledge = `${baseSystem}\n\nCONOCIMIENTO LOCAL:\n${knowledge.substring(0, 3000)}`;

  const messages: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const msg of conversationHistory) {
    messages.push({ role: msg.role, content: msg.content });
  }
  messages.push({
    role: "user",
    content: isEnglish
      ? `City: ${city}\nNo events found.\nUser: "${userMessage}"\nSuggest specific alternatives.`
      : `Ciudad: ${city}\nNo hay eventos.\nUsuario: "${userMessage}"\nSugiere alternativas específicas.`,
  });

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 500,
      system: systemWithKnowledge,
      messages,
    });
    return response.content[0].type === "text"
      ? response.content[0].text
      : "Lo siento, intenta de nuevo.";
  } catch (error) {
    logger.error({ error }, "Response generation failed");
    return "Estamos experimentando problemas. Intenta de nuevo.";
  }
}

async function formatRichResponse(
  events: Event[],
  userMessage: string,
  city: string,
  language: "es" | "en",
  userPhone?: string
): Promise<string> {
  const logger = getLogger();
  const isEn = language === "en";
  const maxEvents = 4;
  const shownEvents = events.slice(0, maxEvents);

  // Date label using SMA timezone
  const dateLabel = getDateLabel(shownEvents, language);

  const header = isEn
    ? `Here's what's happening ${dateLabel} in ${city}:`
    : `Esto es lo que hay ${dateLabel} en ${city}:`;

  const cards = shownEvents.map((e) => formatEventCard(e, language)).join("\n\n---\n\n");

  const moreCount = events.length - maxEvents;
  let footer = "";
  if (moreCount > 0) {
    footer = isEn
      ? `\n\n_+${moreCount} more events. Ask for a specific category!_`
      : `\n\n_+${moreCount} eventos más. Pregunta por una categoría específica!_`;
  }

  const suggestion = isEn
    ? "\n\nWant more details? Ask about a specific type 🎶"
    : "\n\n¿Quieres más detalles de alguno? 🎶";

  const fullText = `${header}\n\n${cards}${footer}${suggestion}`;

  // Send poster images (up to 2)
  if (userPhone) {
    for (const e of shownEvents.slice(0, 2)) {
      const imgUrl = (e as any).imageUrl || (e as any).image_url;
      if (imgUrl && imgUrl.startsWith("http")) {
        try {
          await sendImageMessage(userPhone, imgUrl, `${(e as any).title}`);
        } catch {
          logger.debug("Image send skipped");
        }
      }
    }
  }

  return fullText;
}

function getDateLabel(events: Event[], language: "es" | "en"): string {
  const isEn = language === "en";
  const smaToday = getSMAToday();
  const smaTomorrow = new Date(smaToday);
  smaTomorrow.setDate(smaTomorrow.getDate() + 1);

  const dates = events
    .map((e) => {
      const d = (e as any).eventDate || (e as any).event_date;
      return d ? new Date(d) : null;
    })
    .filter((d): d is Date => d !== null);

  if (dates.length === 0) return "";

  const earliest = new Date(Math.min(...dates.map((d) => d.getTime())));
  // Convert to SMA date for comparison
  const earliestSMA = new Date(earliest.getTime() + SMA_TZ_OFFSET * 3600000);
  const earliestDay = new Date(earliestSMA.getFullYear(), earliestSMA.getMonth(), earliestSMA.getDate());

  if (earliestDay.getTime() === smaToday.getTime()) {
    return isEn ? "today" : "hoy";
  }

  if (earliestDay.getTime() === smaTomorrow.getTime()) {
    return isEn ? "tomorrow" : "mañana";
  }

  const dayName = earliestSMA.toLocaleDateString(isEn ? "en-US" : "es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return isEn ? `on ${dayName}` : `el ${dayName}`;
}
