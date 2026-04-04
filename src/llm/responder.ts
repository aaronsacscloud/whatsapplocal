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
  userPhone?: string,
  budget?: "free" | "low" | "high" | null
): Promise<string> {
  const logger = getLogger();
  const isEnglish = language === "en";

  // Deduplicate events by title
  const uniqueEvents = deduplicateByTitle(events);

  if (uniqueEvents.length > 0) {
    return formatRichResponse(uniqueEvents, userMessage, city, language, userPhone, budget);
  }

  // No events: use LLM
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
  userPhone?: string,
  budget?: "free" | "low" | "high" | null
): Promise<string> {
  const logger = getLogger();
  const isEn = language === "en";
  const eventsPerMessage = 4;

  // Group events by day for multi-day queries
  const dayGroups = groupEventsByDay(events, language);

  // Build all messages
  const allMessages: string[] = [];

  for (const group of dayGroups) {
    const header = isEn
      ? `📋 *${group.label}* in ${city}:`
      : `📋 *${group.label}* en ${city}:`;

    // Split into chunks of eventsPerMessage
    for (let i = 0; i < group.events.length; i += eventsPerMessage) {
      const chunk = group.events.slice(i, i + eventsPerMessage);
      const cards = chunk.map((e) => formatEventCard(e, language)).join("\n\n---\n\n");

      const isFirst = i === 0;
      const msgParts: string[] = [];

      if (isFirst) {
        msgParts.push(header);
      }

      msgParts.push(cards);

      // Show remaining count on last chunk
      const remaining = group.events.length - (i + eventsPerMessage);
      if (remaining > 0) {
        // More chunks coming for this day
      }

      allMessages.push(msgParts.join("\n\n"));
    }
  }

  // Add budget hint if applicable
  let budgetHint = "";
  if (budget === "free") {
    budgetHint = isEn ? "\n💚 Showing free/no-cost options" : "\n💚 Mostrando opciones gratis";
  } else if (budget === "low") {
    budgetHint = isEn ? "\n💰 Showing budget-friendly options" : "\n💰 Mostrando opciones economicas";
  } else if (budget === "high") {
    budgetHint = isEn ? "\n✨ Showing premium options" : "\n✨ Mostrando opciones premium";
  }

  // Add final suggestion to the last message
  const suggestion = isEn
    ? `${budgetHint}\n\nWant more details on any? 🎶`
    : `${budgetHint}\n\nQuieres mas detalles de alguno? 🎶`;

  if (allMessages.length > 0) {
    allMessages[allMessages.length - 1] += suggestion;
  }

  // Send poster images for first few events
  if (userPhone) {
    let imagesSent = 0;
    for (const group of dayGroups) {
      for (const e of group.events) {
        if (imagesSent >= 3) break;
        const imgUrl = (e as any).imageUrl || (e as any).image_url;
        if (imgUrl && imgUrl.startsWith("http")) {
          try {
            await sendImageMessage(userPhone, imgUrl, `${(e as any).title}`);
            imagesSent++;
          } catch {
            // Skip failed images
          }
        }
      }
    }
  }

  // Send additional messages if there are multiple
  if (userPhone && allMessages.length > 1) {
    const { sendTextMessage } = await import("../whatsapp/sender.js");
    // Return first message, send the rest as separate messages
    for (let i = 1; i < allMessages.length; i++) {
      try {
        await sendTextMessage(userPhone, allMessages[i]);
      } catch {
        logger.warn("Failed to send additional event message");
      }
    }
  }

  return allMessages[0] || (isEn ? "No events found." : "No hay eventos.");
}

interface DayGroup {
  label: string;
  events: Event[];
}

function groupEventsByDay(events: Event[], language: "es" | "en"): DayGroup[] {
  const isEn = language === "en";
  const smaToday = getSMAToday();
  const smaTomorrow = new Date(smaToday);
  smaTomorrow.setDate(smaTomorrow.getDate() + 1);

  const groups = new Map<string, { label: string; events: Event[] }>();

  for (const e of events) {
    const eventDate = (e as any).eventDate || (e as any).event_date;
    let dayKey: string;
    let dayLabel: string;

    if (!eventDate) {
      dayKey = "ongoing";
      dayLabel = isEn ? "Ongoing" : "Sin fecha específica";
    } else {
      const d = new Date(eventDate);
      const smaDt = new Date(d.getTime() + SMA_TZ_OFFSET * 3600000);
      const smaDay = new Date(smaDt.getFullYear(), smaDt.getMonth(), smaDt.getDate());

      dayKey = smaDay.toISOString().split("T")[0];

      if (smaDay.getTime() === smaToday.getTime()) {
        dayLabel = isEn ? "Today" : "Hoy";
      } else if (smaDay.getTime() === smaTomorrow.getTime()) {
        dayLabel = isEn ? "Tomorrow" : "Mañana";
      } else {
        dayLabel = smaDt.toLocaleDateString(isEn ? "en-US" : "es-MX", {
          weekday: "long",
          day: "numeric",
          month: "long",
        });
        // Capitalize first letter
        dayLabel = dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1);
      }
    }

    if (!groups.has(dayKey)) {
      groups.set(dayKey, { label: dayLabel, events: [] });
    }
    groups.get(dayKey)!.events.push(e);
  }

  return Array.from(groups.values());
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
