import { getLLMClient } from "./client.js";
import { RESPONDER_SYSTEM, RESPONDER_SYSTEM_EN } from "./prompts.js";
import { getLogger } from "../utils/logger.js";
import { getLocalKnowledge } from "../knowledge/index.js";
import { getGoogleMapsUrl } from "../utils/maps.js";
import { sendImageMessage, sendTextMessage } from "../whatsapp/sender.js";
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

  // 1. TITLE
  lines.push(`*${e.title}*`);

  // 2. DESCRIPTION (clean, no duplicate of title)
  if (e.description) {
    let desc = e.description;
    const title = (e.title || "").toLowerCase();
    if (desc.toLowerCase().startsWith(title)) {
      desc = desc.substring(title.length).replace(/^[.,\-:\s]+/, "").trim();
    }
    if (desc.length > 0) {
      lines.push(desc.substring(0, 180) + (desc.length > 180 ? "..." : ""));
    }
  }

  lines.push(""); // spacing

  // 3. DATE AND TIME
  const eventDate = e.eventDate || e.event_date;
  if (eventDate) {
    const d = new Date(eventDate);
    const smaDate = new Date(d.getTime() + SMA_TZ_OFFSET * 3600000);
    const dateStr = smaDate.toLocaleDateString(isEn ? "en-US" : "es-MX", {
      weekday: "long", day: "numeric", month: "long", timeZone: "UTC",
    });
    const hasTime = d.getUTCHours() !== 0 || d.getUTCMinutes() !== 0;
    if (hasTime) {
      const timeStr = smaDate.toLocaleTimeString(isEn ? "en-US" : "es-MX", {
        hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "UTC",
      });
      lines.push(`Fecha: ${dateStr}`);
      lines.push(`Hora: ${timeStr}`);
    } else {
      lines.push(`Fecha: ${dateStr}`);
    }
  }

  // Recurring
  const contentType = e.contentType || e.content_type;
  const recurrenceDay = e.recurrenceDay ?? e.recurrence_day;
  const recurrenceTime = e.recurrenceTime || e.recurrence_time;
  if (contentType === "recurring" && recurrenceDay !== null && recurrenceDay !== undefined) {
    const days = isEn
      ? ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
      : ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
    const label = isEn ? "Every" : "Cada";
    lines.push(`${label} ${days[recurrenceDay] || ""}${recurrenceTime ? ` - ${recurrenceTime}` : ""}`);
  }

  // 4. PRICE
  const price = e.price;
  if (price) {
    lines.push(`Precio: ${price}`);
  }

  // 5. VENUE
  const venue = e.venueName || e.venue_name;
  const addr = e.venueAddress || e.venue_address;
  if (venue) {
    lines.push(`Lugar: ${venue}${addr ? `, ${addr}` : ""}`);
  }

  // 6. LINKS (separated by spacing)
  const sourceUrl = e.sourceUrl || e.source_url;
  if (sourceUrl || venue) {
    lines.push(""); // spacing before links
    if (sourceUrl) {
      lines.push(sourceUrl);
    }
    if (venue) {
      lines.push(getGoogleMapsUrl(venue, addr));
    }
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

/**
 * Main response generator.
 *
 * NEW FLOW:
 * 1. When we have events → send structured cards directly (no LLM)
 * 2. When NO events → use LLM with knowledge base for suggestions
 *
 * Returns the first message text. Additional messages (images, subsequent
 * cards) are sent directly via the sender.
 */
export async function generateResponse(
  userMessage: string,
  events: Event[],
  city: string,
  conversationHistory: ConversationMessage[] = [],
  language: "es" | "en" = "es",
  userPhone?: string,
  budget?: "free" | "low" | "high" | null
): Promise<string> {
  const logger = getLogger();
  const isEnglish = language === "en";

  // Deduplicate events by title
  const uniqueEvents = deduplicateByTitle(events);

  if (uniqueEvents.length > 0) {
    return sendStructuredEventCards(uniqueEvents, city, language, userPhone, budget);
  }

  // No events: use LLM with knowledge base
  return generateLLMFallback(userMessage, city, conversationHistory, language, budget);
}

/**
 * Send clean, structured event cards — NO LLM formatting.
 * Each event gets its own image (if available) + text card.
 * A summary message is sent at the end.
 */
async function sendStructuredEventCards(
  events: Event[],
  city: string,
  language: "es" | "en",
  userPhone?: string,
  budget?: "free" | "low" | "high" | null
): Promise<string> {
  const logger = getLogger();
  const isEn = language === "en";

  // Sort events by date ASC (earliest first)
  const sorted = [...events].sort((a, b) => {
    const dateA = (a as any).eventDate || (a as any).event_date;
    const dateB = (b as any).eventDate || (b as any).event_date;
    if (!dateA && !dateB) return 0;
    if (!dateA) return 1;
    if (!dateB) return -1;
    return new Date(dateA).getTime() - new Date(dateB).getTime();
  });

  // Limit to reasonable number for WhatsApp
  const maxEvents = 8;
  const eventsToShow = sorted.slice(0, maxEvents);

  // Build all card messages
  const cardMessages: Array<{ imageUrl?: string; imageCaption?: string; text: string }> = [];

  for (const event of eventsToShow) {
    const imgUrl = (event as any).imageUrl || (event as any).image_url;
    const card = formatEventCard(event, language);

    cardMessages.push({
      imageUrl: imgUrl && imgUrl.startsWith("http") ? imgUrl : undefined,
      imageCaption: (event as any).title,
      text: card,
    });
  }

  if (cardMessages.length === 0) {
    return isEn ? "No events found." : "No hay eventos.";
  }

  // Send each event as image + card to the user
  if (userPhone) {
    for (let i = 0; i < cardMessages.length; i++) {
      const card = cardMessages[i];

      // Send image first (if available) with caption = title
      if (card.imageUrl) {
        try {
          await sendImageMessage(userPhone, card.imageUrl, card.imageCaption || "");
        } catch {
          // Skip failed images silently
        }
      }

      // Send the text card
      try {
        // First card is returned as the response; additional cards are sent directly
        if (i > 0) {
          await sendTextMessage(userPhone, card.text);
        }
      } catch {
        logger.warn("Failed to send event card message");
      }
    }

    // Send summary message at the end
    const summaryCount = eventsToShow.length;
    const remaining = events.length - maxEvents;

    let budgetHint = "";
    if (budget === "free") {
      budgetHint = isEn ? " (free options)" : " (opciones gratis)";
    } else if (budget === "low") {
      budgetHint = isEn ? " (budget-friendly)" : " (opciones economicas)";
    } else if (budget === "high") {
      budgetHint = isEn ? " (premium)" : " (premium)";
    }

    let summary: string;
    if (isEn) {
      summary = `Those are ${summaryCount} event${summaryCount !== 1 ? "s" : ""}${budgetHint}.`;
      if (remaining > 0) {
        summary += ` There are ${remaining} more — ask me to see them!`;
      }
      summary += ` Want more details on any?`;
    } else {
      summary = `Esos son ${summaryCount} evento${summaryCount !== 1 ? "s" : ""}${budgetHint}.`;
      if (remaining > 0) {
        summary += ` Hay ${remaining} mas — pideme verlos!`;
      }
      summary += ` Quieres mas detalles de alguno?`;
    }

    try {
      await sendTextMessage(userPhone, summary);
    } catch {
      logger.warn("Failed to send summary message");
    }
  }

  // Return the first card as the "response" (for conversation history)
  return cardMessages[0].text;
}

/**
 * LLM-based fallback when no events are found.
 * Uses knowledge base + conversation history to suggest alternatives.
 */
async function generateLLMFallback(
  userMessage: string,
  city: string,
  conversationHistory: ConversationMessage[],
  language: "es" | "en",
  budget?: "free" | "low" | "high" | null
): Promise<string> {
  const logger = getLogger();
  const isEnglish = language === "en";
  const client = getLLMClient();
  const knowledge = getLocalKnowledge();
  const baseSystem = isEnglish ? RESPONDER_SYSTEM_EN : RESPONDER_SYSTEM;

  // Add budget context to system prompt if specified
  let budgetContext = "";
  if (budget) {
    const budgetLabels: Record<string, { es: string; en: string }> = {
      free: { es: "El usuario busca opciones GRATIS / sin costo.", en: "The user is looking for FREE options." },
      low: { es: "El usuario busca opciones ECONOMICAS / baratas.", en: "The user is looking for BUDGET / cheap options." },
      high: { es: "El usuario busca opciones PREMIUM / exclusivas / de lujo.", en: "The user is looking for PREMIUM / upscale options." },
    };
    budgetContext = `\n\nPRESUPUESTO: ${budgetLabels[budget][isEnglish ? "en" : "es"]} Menciona precios cuando los sepas.`;
  }

  const systemWithKnowledge = `${baseSystem}${budgetContext}\n\nCONOCIMIENTO LOCAL:\n${knowledge.substring(0, 3000)}`;

  const messages: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const msg of conversationHistory) {
    messages.push({ role: msg.role, content: msg.content });
  }
  messages.push({
    role: "user",
    content: isEnglish
      ? `City: ${city}\nNo events found for this specific date.\nUser: "${userMessage}"\n\nIMPORTANT: Tell the user you don't have events for that date but ask them which date they're interested in (today, tomorrow, this weekend, this week). Also suggest trying a different category. Be brief.`
      : `Ciudad: ${city}\nNo hay eventos para esta fecha específica.\nUsuario: "${userMessage}"\n\nIMPORTANTE: Dile al usuario que no tienes eventos para esa fecha pero pregúntale qué fecha le interesa (hoy, mañana, este fin de semana, esta semana). También sugiere probar otra categoría. Se breve.`,
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
    return isEnglish
      ? "We're experiencing issues. Try again."
      : "Estamos experimentando problemas. Intenta de nuevo.";
  }
}

/**
 * Generate a share-ready formatted message for an event that users can forward.
 */
export function formatShareMessage(event: any, language: "es" | "en" = "es"): string {
  const isEn = language === "en";
  const lines: string[] = [];

  const emoji = getCategoryEmoji(event.category);
  const title = event.title || event.name || "Evento";
  const venue = event.venueName || event.venue_name || "";

  if (isEn) {
    lines.push(`Check out what I found in SMA 👇`);
  } else {
    lines.push(`Mira lo que encontre en SMA 👇`);
  }
  lines.push("");
  lines.push(`${emoji} *${title}*`);

  if (venue) {
    const addr = event.venueAddress || event.venue_address;
    lines.push(`📍 ${venue}${addr ? ` — ${addr}` : ", San Miguel de Allende"}`);
  }

  const eventDate = event.eventDate || event.event_date;
  if (eventDate) {
    const d = new Date(eventDate);
    const smaDate = new Date(d.getTime() + SMA_TZ_OFFSET * 3600000);
    const dateStr = smaDate.toLocaleDateString(isEn ? "en-US" : "es-MX", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "UTC",
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

  if (event.description) {
    lines.push(event.description.substring(0, 120) + (event.description.length > 120 ? "..." : ""));
  }

  const sourceUrl = event.sourceUrl || event.source_url;
  if (sourceUrl) {
    lines.push(`🔗 ${sourceUrl}`);
  }

  lines.push("");

  if (isEn) {
    lines.push(`— Sent by WhatsApp Local Bot`);
    lines.push(`Chat with me: wa.me/12058920417?text=Hola`);
  } else {
    lines.push(`— Enviado por WhatsApp Local Bot`);
    lines.push(`Chatea conmigo: wa.me/12058920417?text=Hola`);
  }

  return lines.join("\n");
}
