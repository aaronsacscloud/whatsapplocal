import { getLLMClient } from "./client.js";
import { RESPONDER_SYSTEM, RESPONDER_SYSTEM_EN } from "./prompts.js";
import { getLogger } from "../utils/logger.js";
import { getLocalKnowledge } from "../knowledge/index.js";
import { getGoogleMapsUrl } from "../utils/maps.js";
import type { Event } from "../db/schema.js";

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

export async function generateResponse(
  userMessage: string,
  events: Event[],
  city: string,
  conversationHistory: ConversationMessage[] = [],
  language: "es" | "en" = "es"
): Promise<string> {
  const logger = getLogger();
  const client = getLLMClient();
  const knowledge = getLocalKnowledge();

  const isEnglish = language === "en";
  const baseSystem = isEnglish ? RESPONDER_SYSTEM_EN : RESPONDER_SYSTEM;

  const eventsContext =
    events.length > 0
      ? events
          .map(
            (e) =>
              `- ${e.title}${e.venueName ? ` en ${e.venueName}` : ""}${e.eventDate ? ` | ${new Date(e.eventDate).toLocaleDateString("es", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}${e.description ? `\n  ${e.description}` : ""}`
          )
          .join("\n")
      : isEnglish
        ? "No events available for this search."
        : "No hay eventos disponibles para esta busqueda.";

  // Include local knowledge as context so the bot always knows about the city
  // Knowledge stays in Spanish as it's the source data
  const knowledgeLabel = isEnglish
    ? "LOCAL KNOWLEDGE (use this to complement your responses with real city info — data is in Spanish, respond in English):"
    : "CONOCIMIENTO LOCAL (usa esto para complementar tus respuestas con info real de la ciudad):";

  const systemWithKnowledge = `${baseSystem}

${knowledgeLabel}
${knowledge.substring(0, 3000)}`;

  // Build messages array: history + current message
  const messages: Array<{ role: "user" | "assistant"; content: string }> = [];

  // Add conversation history
  for (const msg of conversationHistory) {
    messages.push({
      role: msg.role,
      content: msg.content,
    });
  }

  const userPrompt = isEnglish
    ? `City: ${city}\n\nEvents found:\n${eventsContext}\n\nUser message: "${userMessage}"\n\nRespond to the user naturally and conversationally in English. If there are no events, use your local knowledge to suggest real, specific alternatives.`
    : `Ciudad: ${city}\n\nEventos encontrados:\n${eventsContext}\n\nMensaje del usuario: "${userMessage}"\n\nResponde al usuario de forma natural y conversacional. Si no hay eventos, usa tu conocimiento local para sugerir alternativas reales y específicas.`;

  // Add current message with context
  messages.push({
    role: "user",
    content: userPrompt,
  });

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 500,
      system: systemWithKnowledge,
      messages,
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";

    const fallback = isEnglish
      ? "Sorry, I couldn't generate a response. Please try again."
      : "Lo siento, no pude generar una respuesta. Intenta de nuevo.";

    const responseText = text || fallback;

    // Append Google Maps links for mentioned venues
    const mapsLinks = buildMapsLinks(responseText, events);
    if (mapsLinks) {
      return `${responseText}\n\n${mapsLinks}`;
    }

    return responseText;
  } catch (error) {
    logger.error({ error }, "Response generation failed");
    return isEnglish
      ? "We're experiencing issues. Please try again in a few minutes."
      : "Estamos experimentando problemas. Intenta de nuevo en unos minutos.";
  }
}

/**
 * Build Google Maps deep links for venues mentioned in the response.
 * Scans the response text for venue names from the events list and
 * appends clickable Maps links at the end of the message.
 */
function buildMapsLinks(responseText: string, events: Event[]): string {
  if (events.length === 0) return "";

  // Collect unique venues mentioned in the response
  const mentionedVenues = new Map<string, { name: string; address: string | null }>();

  for (const event of events) {
    if (!event.venueName) continue;

    // Check if the venue name appears in the response text
    const venueLower = event.venueName.toLowerCase();
    const responseLower = responseText.toLowerCase();

    if (responseLower.includes(venueLower) && !mentionedVenues.has(venueLower)) {
      mentionedVenues.set(venueLower, {
        name: event.venueName,
        address: event.venueAddress,
      });
    }
  }

  if (mentionedVenues.size === 0) return "";

  const links: string[] = [];
  for (const venue of mentionedVenues.values()) {
    const url = getGoogleMapsUrl(venue.name, venue.address);
    links.push(`${venue.name}: ${url}`);
  }

  return links.join("\n");
}
