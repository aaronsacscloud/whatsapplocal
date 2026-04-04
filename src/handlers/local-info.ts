import { getLLMClient } from "../llm/client.js";
import { sendTextMessage } from "../whatsapp/sender.js";
import { getLogger } from "../utils/logger.js";
import { getLocalKnowledge } from "../knowledge/index.js";

const LOCAL_INFO_SYSTEM = `Eres un experto local de San Miguel de Allende, Mexico. Conoces la ciudad como la palma de tu mano.
Responde siempre en español informal pero respetuoso. Se conciso y directo.
Usa tu conocimiento local para dar respuestas precisas, con nombres específicos, direcciones, precios cuando los sepas.
Si te preguntan algo que no sabes con certeza, dilo honestamente pero sugiere alternativas.
Maximo 500 caracteres por respuesta (es WhatsApp, no un blog).
Usa emojis con moderación (1-2 max).
Termina con una pregunta de seguimiento o sugerencia relacionada.`;

export async function handleLocalInfo(
  from: string,
  body: string
): Promise<void> {
  const logger = getLogger();
  const client = getLLMClient();
  const knowledge = getLocalKnowledge();

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 600,
      system: LOCAL_INFO_SYSTEM,
      messages: [
        {
          role: "user",
          content: `CONTEXTO LOCAL (usa esto para responder con precisión):\n${knowledge}\n\n---\nPREGUNTA DEL USUARIO: "${body}"`,
        },
      ],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";

    await sendTextMessage(
      from,
      text || "No tengo info sobre eso ahora. Intenta preguntar de otra forma."
    );
  } catch (error) {
    logger.error({ error }, "Local info handler failed");
    await sendTextMessage(
      from,
      "Estamos experimentando problemas. Intenta de nuevo en unos minutos."
    );
  }
}
