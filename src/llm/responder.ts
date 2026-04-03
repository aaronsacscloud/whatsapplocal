import { getLLMClient } from "./client.js";
import { RESPONDER_SYSTEM } from "./prompts.js";
import { getLogger } from "../utils/logger.js";
import type { Event } from "../db/schema.js";

export async function generateResponse(
  userMessage: string,
  events: Event[],
  city: string
): Promise<string> {
  const logger = getLogger();
  const client = getLLMClient();

  const eventsContext =
    events.length > 0
      ? events
          .map(
            (e) =>
              `- ${e.title}${e.venueName ? ` en ${e.venueName}` : ""}${e.eventDate ? ` | ${new Date(e.eventDate).toLocaleDateString("es", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}${e.description ? `\n  ${e.description}` : ""}`
          )
          .join("\n")
      : "No hay eventos disponibles para esta busqueda.";

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 500,
      system: RESPONDER_SYSTEM,
      messages: [
        {
          role: "user",
          content: `Ciudad: ${city}\n\nEventos encontrados:\n${eventsContext}\n\nMensaje del usuario: "${userMessage}"\n\nResponde al usuario de forma natural y conversacional.`,
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
