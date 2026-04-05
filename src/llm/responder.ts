import { getLLMClient } from "./client.js";
import { RESPONDER_SYSTEM, RESPONDER_SYSTEM_EN } from "./prompts.js";
import { getLogger } from "../utils/logger.js";
import { getLocalKnowledge } from "../knowledge/index.js";
import { getGoogleMapsUrl } from "../utils/maps.js";
import { generateGoogleCalendarUrl } from "../utils/calendar-links.js";

import { sendImageMessage, sendTextMessage } from "../whatsapp/sender.js";
import { storeRecentEvents, markEventsShown, getNextEvents, getRemainingCount } from "../handlers/event-context.js";
import type { Event } from "../db/schema.js";

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

// SMA timezone offset: UTC-6 (CST)
const SMA_TZ_OFFSET = -6;

function getSMANow(): Date {
  const nowUtc = new Date();
  return new Date(nowUtc.getTime() - 6 * 3600000);
}

function getSMAToday(): Date {
  const sma = getSMANow();
  return new Date(sma.getFullYear(), sma.getMonth(), sma.getDate());
}

async function formatEventCard(e: any, language: "es" | "en"): Promise<string> {
  const isEn = language === "en";
  const lines: string[] = [];
  const rawContent = e.rawContent || e.raw_content || "";

  // 1. TITLE
  lines.push(`*${e.title}*`);

  // 2. DESCRIPTION (right below title for context)
  if (e.description) {
    let desc = e.description;
    // Remove duplicate title from start
    const title = (e.title || "").toLowerCase();
    if (desc.toLowerCase().startsWith(title)) {
      desc = desc.substring(title.length).replace(/^[.,\-:\s]+/, "").trim();
    }
    // Remove emojis from description to keep it clean
    desc = desc.replace(/[\u{1F600}-\u{1F9FF}]/gu, "").trim();
    if (desc.length > 0) {
      lines.push(desc.substring(0, 200) + (desc.length > 200 ? "..." : ""));
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

  // Recurring info
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

  // 6. EXTRAS (duration, performers, category, anything else relevant)
  const extras: string[] = [];
  const duration = e.duration;
  if (duration) extras.push(`Duración: ${duration}`);

  const category = e.category;
  if (category && category !== "other") {
    const catLabels: Record<string, { es: string; en: string }> = {
      music: { es: "Música en vivo", en: "Live music" },
      food: { es: "Gastronomía", en: "Food & dining" },
      nightlife: { es: "Vida nocturna", en: "Nightlife" },
      culture: { es: "Arte y cultura", en: "Art & culture" },
      sports: { es: "Deportes", en: "Sports" },
      wellness: { es: "Bienestar", en: "Wellness" },
      tour: { es: "Tour / Recorrido", en: "Tour" },
      class: { es: "Clase / Taller", en: "Class / Workshop" },
      adventure: { es: "Aventura", en: "Adventure" },
      wine: { es: "Vino y mezcal", en: "Wine & mezcal" },
      popup: { es: "Pop-up / Festival", en: "Pop-up / Festival" },
    };
    const label = catLabels[category];
    if (label) extras.push(`Tipo: ${isEn ? label.en : label.es}`);
  }

  // Extract performers/artists from description or raw content
  const performers = extractPerformers(e.description || rawContent);
  if (performers) extras.push(`Artistas: ${performers}`);

  // Extract reservation info
  const reservationInfo = extractReservationInfo(rawContent);
  if (reservationInfo) extras.push(`Reservaciones: ${reservationInfo}`);

  if (extras.length > 0) {
    lines.push("");
    lines.push(extras.join("\n"));
  }

  // 7. LINKS with labels
  const sourceUrl = e.sourceUrl || e.source_url;
  lines.push("");
  if (sourceUrl) {
    lines.push(isEn ? `More info: ${sourceUrl}` : `Mas info: ${sourceUrl}`);
  }
  if (venue) {
    const mapsUrl = await getGoogleMapsUrl(venue, addr);
    lines.push(isEn ? `Location: ${mapsUrl}` : `Ubicacion: ${mapsUrl}`);
  }

  // 8. CALENDAR LINK
  const gcalUrl = await generateGoogleCalendarUrl(e);
  lines.push(isEn
    ? `Add to calendar: ${gcalUrl}`
    : `Agregar al calendario: ${gcalUrl}`
  );

  return lines.join("\n");
}

/** Extract performer/artist names from text */
function extractPerformers(text: string): string | null {
  if (!text) return null;
  // Look for "Artistas: X" or "Performers: X" already in text
  const match = text.match(/(?:artistas?|performers?|featuring|feat\.?|ft\.?|con|with)[:.]?\s*([^.|\n]{3,60})/i);
  if (match) return match[1].trim();
  return null;
}

/** Extract reservation contact info from text */
function extractReservationInfo(text: string): string | null {
  if (!text) return null;
  // Look for phone numbers or WhatsApp
  const phoneMatch = text.match(/(?:reserv|whatsapp|tel|call|llama)[^:]*[:.]?\s*(\+?\d[\d\s\-()]{7,20})/i);
  if (phoneMatch) return phoneMatch[1].trim();
  // Look for email
  const emailMatch = text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  if (emailMatch) return emailMatch[1];
  return null;
}

/**
 * Translate event titles and descriptions to the user's language.
 * Uses Haiku for speed and cost efficiency.
 * Only translates if the content appears to be in a different language.
 */
async function translateEventsIfNeeded(
  events: Event[],
  targetLanguage: "es" | "en"
): Promise<Event[]> {
  const logger = getLogger();

  // Collect texts that need translation
  const textsToTranslate: Array<{ index: number; field: "title" | "description"; text: string }> = [];

  for (let i = 0; i < events.length; i++) {
    const e = events[i] as any;
    const title = e.title || "";
    const desc = e.description || "";

    if (targetLanguage === "es") {
      // User wants Spanish — check if content is in English
      if (isLikelyEnglish(title)) textsToTranslate.push({ index: i, field: "title", text: title });
      if (desc && isLikelyEnglish(desc)) textsToTranslate.push({ index: i, field: "description", text: desc });
    } else {
      // User wants English — check if content is in Spanish
      if (isLikelySpanish(title)) textsToTranslate.push({ index: i, field: "title", text: title });
      if (desc && isLikelySpanish(desc)) textsToTranslate.push({ index: i, field: "description", text: desc });
    }
  }

  if (textsToTranslate.length === 0) return events;

  // Batch translate with Haiku (single call for all texts)
  try {
    const client = getLLMClient();
    const targetLabel = targetLanguage === "es" ? "español" : "English";

    const prompt = textsToTranslate
      .map((t, i) => `[${i}] ${t.text}`)
      .join("\n");

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1000,
      system: `Translate each numbered line to ${targetLabel}. Keep the [N] numbering. Only translate, don't add or remove content. Keep proper nouns (venue names, artist names) as-is.`,
      messages: [{ role: "user", content: prompt }],
    });

    const resultText = response.content[0].type === "text" ? response.content[0].text : "";

    // Parse translations back
    const translated = [...events] as any[];
    for (const line of resultText.split("\n")) {
      const match = line.match(/^\[(\d+)\]\s*(.+)/);
      if (match) {
        const idx = parseInt(match[1], 10);
        const translatedText = match[2].trim();
        if (idx >= 0 && idx < textsToTranslate.length) {
          const { index, field } = textsToTranslate[idx];
          translated[index] = { ...translated[index], [field]: translatedText };
        }
      }
    }

    return translated;
  } catch (error) {
    logger.debug({ error }, "Translation failed, using original text");
    return events;
  }
}

function isLikelyEnglish(text: string): boolean {
  const englishWords = /\b(the|and|with|for|this|that|live|night|show|every|free|cover|music|at|from|join|us)\b/i;
  const spanishWords = /\b(los|las|del|que|con|para|esta|cada|gratis|noche|vivo|desde)\b/i;
  const enCount = (text.match(englishWords) || []).length;
  const esCount = (text.match(spanishWords) || []).length;
  return enCount > esCount && enCount >= 2;
}

function isLikelySpanish(text: string): boolean {
  const spanishWords = /\b(los|las|del|que|con|para|esta|cada|gratis|noche|vivo|desde|evento|clase|taller)\b/i;
  const englishWords = /\b(the|and|with|for|this|that|live|night|show|every|free|cover|music)\b/i;
  const esCount = (text.match(spanishWords) || []).length;
  const enCount = (text.match(englishWords) || []).length;
  return esCount > enCount && esCount >= 2;
}

/**
 * Enrich events that have poor/missing descriptions.
 * Uses Haiku to generate a brief, useful description based on title + venue + genre.
 */
async function enrichDescriptions(events: Event[], language: "es" | "en"): Promise<Event[]> {
  const logger = getLogger();
  const isEn = language === "en";

  // Find events with poor descriptions
  const needsEnrichment: Array<{ index: number; title: string; venue: string; desc: string }> = [];

  for (let i = 0; i < events.length; i++) {
    const e = events[i] as any;
    const desc = e.description || "";
    const title = e.title || "";
    const venue = e.venueName || e.venue_name || "";

    // Description is poor if: empty, only genre info, just repeats title, or very short
    const isPoor =
      desc.length < 20 ||
      desc.startsWith("Genero:") ||
      desc.startsWith("Concierto de ") ||
      desc.toLowerCase() === title.toLowerCase();

    if (isPoor) {
      needsEnrichment.push({ index: i, title, venue, desc });
    }
  }

  if (needsEnrichment.length === 0) return events;

  try {
    const client = getLLMClient();
    const langLabel = isEn ? "English" : "Spanish";

    const prompt = needsEnrichment
      .map((e, i) => `[${i}] Title: "${e.title}" | Venue: "${e.venue}" | Info: "${e.desc}"`)
      .join("\n");

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 800,
      system: `Write a brief, appealing 1-2 sentence description for each event in ${langLabel}. Make it sound interesting and give context about what to expect. Keep the [N] numbering. Be concise (max 100 chars each). Don't invent details, just make the existing info sound good.`,
      messages: [{ role: "user", content: prompt }],
    });

    const resultText = response.content[0].type === "text" ? response.content[0].text : "";

    const enriched = [...events] as any[];
    for (const line of resultText.split("\n")) {
      const match = line.match(/^\[(\d+)\]\s*(.+)/);
      if (match) {
        const idx = parseInt(match[1], 10);
        if (idx >= 0 && idx < needsEnrichment.length) {
          const { index } = needsEnrichment[idx];
          enriched[index] = { ...enriched[index], description: match[2].trim() };
        }
      }
    }

    return enriched;
  } catch (error) {
    logger.debug({ error }, "Description enrichment failed, using originals");
    return events;
  }
}

function isAskingForMore(message: string): boolean {
  const lower = message.toLowerCase().trim();
  const morePatterns = [
    /dame.*m[aá]s/i, /los otros/i, /los dem[aá]s/i, /show me more/i,
    /more events/i, /ver m[aá]s/i, /siguiente/i, /next/i, /continua/i,
    /continue/i, /m[aá]s eventos/i, /otros eventos/i, /the rest/i,
    /dame los/i, /muestrame/i, /muéstrame/i, /pideme/i, /pídeme/i,
  ];
  return morePatterns.some((p) => p.test(lower));
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

  if (uniqueEvents.length > 0 && userPhone) {
    // Store ALL events for pagination
    storeRecentEvents(userPhone, uniqueEvents);
    return sendStructuredEventCards(uniqueEvents, city, language, userPhone, budget);
  }

  // Check if user is asking for "more" events from a previous query
  if (userPhone) {
    const remaining = getRemainingCount(userPhone);
    if (remaining > 0 && isAskingForMore(userMessage)) {
      const nextBatch = getNextEvents(userPhone, 8);
      if (nextBatch.length > 0) {
        return sendStructuredEventCards(nextBatch, city, language, userPhone, budget, true);
      }
    }
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
  budget?: "free" | "low" | "high" | null,
  isNextBatch: boolean = false
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

  // Enrich poor descriptions and translate to user's language
  const enrichedEvents = await enrichDescriptions(eventsToShow, language);
  const translatedEvents = await translateEventsIfNeeded(enrichedEvents, language);

  // Build all card messages
  const cardMessages: Array<{ imageUrl?: string; imageCaption?: string; text: string }> = [];

  for (const event of translatedEvents) {
    let imgUrl = (event as any).imageUrl || (event as any).image_url || "";
    // Validate image URL: must be full URL and at least 5 chars
    if (imgUrl.length < 10 || !imgUrl.startsWith("http")) {
      imgUrl = "";
    }
    const card = await formatEventCard(event, language);

    cardMessages.push({
      imageUrl: imgUrl || undefined,
      imageCaption: (event as any).title,
      text: card,
    });
  }

  if (cardMessages.length === 0) {
    return isEn ? "No events found." : "No hay eventos.";
  }

  logger.info({
    totalCards: cardMessages.length,
    withImages: cardMessages.filter(c => c.imageUrl).length,
    userPhone: userPhone?.slice(-4),
  }, "Sending event cards");

  // Send each event as image + card to the user
  if (userPhone) {
    for (let i = 0; i < cardMessages.length; i++) {
      const card = cardMessages[i];

      // Send image first (if available) with caption = title
      if (card.imageUrl) {
        try {
          logger.info({ imageUrl: card.imageUrl.substring(0, 60), to: userPhone.slice(-4) }, "Sending event image");
          await sendImageMessage(userPhone, card.imageUrl, card.imageCaption || "");
        } catch (imgError: any) {
          logger.error({ error: imgError?.message?.substring(0, 80), imageUrl: card.imageUrl.substring(0, 60) }, "Image send failed");
        }
      } else {
        logger.debug({ title: card.imageCaption }, "No image URL for event");
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

    // Track shown events for pagination
    if (userPhone && !isNextBatch) {
      markEventsShown(userPhone, eventsToShow.length);
    } else if (userPhone && isNextBatch) {
      // getNextEvents already updated the counter
    }

    // Send summary message at the end
    const summaryCount = eventsToShow.length;
    const remaining = userPhone ? getRemainingCount(userPhone) : Math.max(0, events.length - maxEvents);

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
