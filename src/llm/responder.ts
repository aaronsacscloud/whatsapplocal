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

/**
 * Format a single event into a rich text block for WhatsApp
 */
function formatEventCard(e: any, language: "es" | "en"): string {
  const isEn = language === "en";
  const lines: string[] = [];

  // Title with emoji based on category
  const emoji = getCategoryEmoji(e.category);
  lines.push(`${emoji} *${e.title}*`);

  // Venue + address
  if (e.venueName || e.venue_name) {
    const venue = e.venueName || e.venue_name;
    const addr = e.venueAddress || e.venue_address;
    lines.push(`📍 ${venue}${addr ? ` — ${addr}` : ""}`);
  }

  // Date and time
  const eventDate = e.eventDate || e.event_date;
  if (eventDate) {
    const d = new Date(eventDate);
    const dateStr = d.toLocaleDateString(isEn ? "en-US" : "es-MX", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    const timeStr = d.toLocaleTimeString(isEn ? "en-US" : "es-MX", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
    // Only show time if it's not midnight (which means time wasn't specified)
    const hasTime = d.getUTCHours() !== 0 || d.getUTCMinutes() !== 0;
    lines.push(`📅 ${dateStr}${hasTime ? ` — ${timeStr}` : ""}`);
  }

  // Description (truncated)
  if (e.description) {
    const desc = e.description.substring(0, 120);
    lines.push(desc + (e.description.length > 120 ? "..." : ""));
  }

  // Source URL
  const sourceUrl = e.sourceUrl || e.source_url;
  if (sourceUrl && !sourceUrl.includes("sanmiguellive") && !sourceUrl.includes("bandsintown")) {
    lines.push(`🔗 ${sourceUrl}`);
  }

  // Google Maps link
  const venueName = e.venueName || e.venue_name;
  if (venueName) {
    const mapsUrl = getGoogleMapsUrl(venueName, e.venueAddress || e.venue_address);
    lines.push(`📌 ${mapsUrl}`);
  }

  return lines.join("\n");
}

function getCategoryEmoji(category: string | null): string {
  const emojis: Record<string, string> = {
    music: "🎵",
    food: "🍽️",
    nightlife: "🌙",
    culture: "🎨",
    sports: "⚽",
    popup: "🎪",
    wellness: "🧘",
    tour: "🚶",
    class: "📚",
    adventure: "🎈",
    wine: "🍷",
  };
  return emojis[category || ""] || "📌";
}

/**
 * Generate a rich response with event cards and optional images.
 * Returns the text response and sends images separately.
 */
export async function generateResponse(
  userMessage: string,
  events: Event[],
  city: string,
  conversationHistory: ConversationMessage[] = [],
  language: "es" | "en" = "es",
  userPhone?: string
): Promise<string> {
  const logger = getLogger();
  const client = getLLMClient();
  const knowledge = getLocalKnowledge();
  const isEnglish = language === "en";

  // If we have events, build rich cards instead of relying on LLM formatting
  if (events.length > 0) {
    return formatRichResponse(events, userMessage, city, language, userPhone, conversationHistory);
  }

  // No events: use LLM to generate a helpful response
  const baseSystem = isEnglish ? RESPONDER_SYSTEM_EN : RESPONDER_SYSTEM;
  const knowledgeLabel = isEnglish
    ? "LOCAL KNOWLEDGE (respond in English):"
    : "CONOCIMIENTO LOCAL:";

  const systemWithKnowledge = `${baseSystem}\n\n${knowledgeLabel}\n${knowledge.substring(0, 3000)}`;

  const messages: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const msg of conversationHistory) {
    messages.push({ role: msg.role, content: msg.content });
  }

  const noEventsText = isEnglish
    ? "No events found for this search."
    : "No se encontraron eventos para esta busqueda.";

  messages.push({
    role: "user",
    content: isEnglish
      ? `City: ${city}\n\n${noEventsText}\n\nUser: "${userMessage}"\n\nSuggest real, specific alternatives from your local knowledge.`
      : `Ciudad: ${city}\n\n${noEventsText}\n\nUsuario: "${userMessage}"\n\nSugiere alternativas reales y específicas usando tu conocimiento local.`,
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
      : isEnglish
        ? "Sorry, I couldn't generate a response."
        : "Lo siento, no pude generar una respuesta.";
  } catch (error) {
    logger.error({ error }, "Response generation failed");
    return isEnglish
      ? "We're experiencing issues. Please try again."
      : "Estamos experimentando problemas. Intenta de nuevo.";
  }
}

/**
 * Build a rich formatted response with event cards, images, and maps
 */
async function formatRichResponse(
  events: Event[],
  userMessage: string,
  city: string,
  language: "es" | "en",
  userPhone?: string,
  conversationHistory: ConversationMessage[] = []
): Promise<string> {
  const logger = getLogger();
  const isEn = language === "en";
  const maxEvents = 4;
  const shownEvents = events.slice(0, maxEvents);

  // Determine what date we're showing
  const dateLabel = getDateLabel(shownEvents, language);

  // Header
  const header = isEn
    ? `Here's what's happening ${dateLabel} in ${city}:`
    : `Esto es lo que hay ${dateLabel} en ${city}:`;

  // Event cards
  const cards = shownEvents.map((e) => formatEventCard(e, language)).join("\n\n");

  // Footer
  const moreCount = events.length - maxEvents;
  let footer = "";
  if (moreCount > 0) {
    footer = isEn
      ? `\n\n_+${moreCount} more events. Ask me for a specific category or date!_`
      : `\n\n_+${moreCount} eventos más. Pregúntame por una categoría o fecha específica!_`;
  }

  const suggestion = isEn
    ? "\n\nWant more details on any of these? Or ask me about a specific type of event 🎶"
    : "\n\n¿Quieres más detalles de alguno? También puedes preguntarme por un tipo específico de evento 🎶";

  const fullText = `${header}\n\n${cards}${footer}${suggestion}`;

  // Send images for events that have them (async, don't block)
  if (userPhone) {
    for (const e of shownEvents.slice(0, 2)) {
      const imgUrl = (e as any).imageUrl || (e as any).image_url;
      if (imgUrl && imgUrl.startsWith("http")) {
        try {
          await sendImageMessage(
            userPhone,
            imgUrl,
            `${(e as any).title}`
          );
        } catch {
          // Don't fail if image send fails
        }
      }
    }
  }

  return fullText;
}

/**
 * Figure out what date range we're showing and return a label
 */
function getDateLabel(events: Event[], language: "es" | "en"): string {
  const isEn = language === "en";
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const tomorrow = new Date(today);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

  const dates = events
    .map((e) => {
      const d = (e as any).eventDate || (e as any).event_date;
      return d ? new Date(d) : null;
    })
    .filter((d): d is Date => d !== null);

  if (dates.length === 0) return isEn ? "" : "";

  const earliest = new Date(Math.min(...dates.map((d) => d.getTime())));

  if (earliest >= today && earliest < tomorrow) {
    return isEn ? "tonight" : "esta noche";
  }

  const dayAfterTomorrow = new Date(tomorrow);
  dayAfterTomorrow.setUTCDate(dayAfterTomorrow.getUTCDate() + 1);
  if (earliest >= tomorrow && earliest < dayAfterTomorrow) {
    return isEn ? "tomorrow" : "mañana";
  }

  const dayName = earliest.toLocaleDateString(isEn ? "en-US" : "es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return isEn ? `on ${dayName}` : `el ${dayName}`;
}
