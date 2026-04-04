import { getLLMClient } from "./client.js";
import { RESPONDER_SYSTEM } from "./prompts.js";
import { getLogger } from "../utils/logger.js";
import { getLocalKnowledge } from "../knowledge/index.js";
import type { Event } from "../db/schema.js";

export async function generateResponse(
  userMessage: string,
  events: Event[],
  city: string
): Promise<string> {
  const logger = getLogger();
  const client = getLLMClient();
  const knowledge = getLocalKnowledge();

  const eventsContext =
    events.length > 0
      ? events
          .map(
            (e) =>
              `- ${e.title}${e.venueName ? ` en ${e.venueName}` : ""}${e.eventDate ? ` | ${new Date(e.eventDate).toLocaleDateString("es", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}${e.description ? `\n  ${e.description}` : ""}`
          )
          .join("\n")
      : "No hay eventos disponibles para esta busqueda.";

  // Include local knowledge as context so the bot always knows about the city
  const systemWithKnowledge = `${RESPONDER_SYSTEM}

CONOCIMIENTO LOCAL (usa esto para complementar tus respuestas con info real de la ciudad):
${knowledge.substring(0, 3000)}`;

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 500,
      system: systemWithKnowledge,
      messages: [
        {
          role: "user",
          content: `Ciudad: ${city}\n\nEventos encontrados:\n${eventsContext}\n\nMensaje del usuario: "${userMessage}"\n\nResponde al usuario de forma natural y conversacional. Si no hay eventos, usa tu conocimiento local para sugerir alternativas reales y específicas.`,
        },
      ],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";

    return text || "Lo siento, no pude generar una respuesta. Intenta de nuevo.";
  } catch (error) {
    logger.error({ error }, "Response generation failed");
    return "Estamos experimentando problemas. Intenta de nuevo en unos minutos.";
  }
}
