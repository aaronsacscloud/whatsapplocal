import { getLLMClient } from "../llm/client.js";
import { sendTextMessage } from "../whatsapp/sender.js";
import { getLogger } from "../utils/logger.js";
import { getLocalKnowledge } from "../knowledge/index.js";
import { getWeatherContext } from "../knowledge/weather.js";
import { searchKnowledge, learnFromWeb } from "../knowledge/learner.js";
import { getConfig } from "../config.js";
import type { ConversationMessage } from "../llm/responder.js";

const LOCAL_INFO_SYSTEM = `Eres un experto local de San Miguel de Allende, Mexico. Conoces la ciudad como la palma de tu mano.
Responde siempre en español informal pero respetuoso. Se conciso y directo.
Usa tu conocimiento local para dar respuestas precisas, con nombres específicos, direcciones, precios cuando los sepas.
Si te preguntan algo que no sabes con certeza, dilo honestamente pero sugiere alternativas.
Maximo 500 caracteres por respuesta (es WhatsApp, no un blog).
Usa emojis con moderación (1-2 max).
Termina con una pregunta de seguimiento o sugerencia relacionada.`;

const LOCAL_INFO_SYSTEM_EN = `You are a local expert on San Miguel de Allende, Mexico. You know the city like the back of your hand.
Always respond in casual but respectful English. Be concise and direct.
Use your local knowledge to give precise answers with specific names, addresses, prices when you know them.
If you're asked something you're not sure about, say so honestly but suggest alternatives.
Maximum 500 characters per response (it's WhatsApp, not a blog).
Use emojis sparingly (1-2 max).
End with a follow-up question or related suggestion.`;

export async function handleLocalInfo(
  from: string,
  body: string,
  conversationHistory: ConversationMessage[] = [],
  language: "es" | "en" = "es"
): Promise<string> {
  const logger = getLogger();
  const client = getLLMClient();
  const knowledge = getLocalKnowledge();

  const isEnglish = language === "en";

  // Fetch weather if the question might be about climate/weather/what to wear
  let weatherContext = "";
  const lowerBody = body.toLowerCase();
  if (
    lowerBody.includes("clima") ||
    lowerBody.includes("lluv") ||
    lowerBody.includes("frio") ||
    lowerBody.includes("calor") ||
    lowerBody.includes("temperatura") ||
    lowerBody.includes("que llevo") ||
    lowerBody.includes("ropa") ||
    lowerBody.includes("weather") ||
    lowerBody.includes("rain") ||
    lowerBody.includes("cold") ||
    lowerBody.includes("hot") ||
    lowerBody.includes("temperature") ||
    lowerBody.includes("what to wear") ||
    lowerBody.includes("pack")
  ) {
    weatherContext = await getWeatherContext();
  }

  const systemPrompt = isEnglish ? LOCAL_INFO_SYSTEM_EN : LOCAL_INFO_SYSTEM;
  const config = getConfig();

  // Check if we have cached knowledge for this query
  const cached = await searchKnowledge(body, config.DEFAULT_CITY);
  if (cached) {
    logger.info({ query: body.substring(0, 50) }, "Local info from knowledge cache");
    await sendTextMessage(from, cached);
    return cached;
  }

  try {
    const contextParts = [knowledge];
    if (weatherContext) contextParts.push(weatherContext);

    // Try to learn from web to enrich future responses (async, non-blocking)
    learnFromWeb(body, config.DEFAULT_CITY, language).catch(() => {});

    // Build messages array: history + current message
    const messages: Array<{ role: "user" | "assistant"; content: string }> = [];

    // Add conversation history
    for (const msg of conversationHistory) {
      messages.push({
        role: msg.role,
        content: msg.content,
      });
    }

    const contextLabel = isEnglish
      ? "LOCAL CONTEXT (use this to answer accurately — data is in Spanish, respond in English):"
      : "CONTEXTO LOCAL (usa esto para responder con precisión):";

    const questionLabel = isEnglish ? "USER QUESTION" : "PREGUNTA DEL USUARIO";

    // Add current message with context
    messages.push({
      role: "user",
      content: `${contextLabel}\n${contextParts.join("\n\n")}\n\n---\n${questionLabel}: "${body}"`,
    });

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 600,
      system: systemPrompt,
      messages,
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";

    const fallback = isEnglish
      ? "I don't have info on that right now. Try asking a different way."
      : "No tengo info sobre eso ahora. Intenta preguntar de otra forma.";

    const responseText = text || fallback;

    await sendTextMessage(from, responseText);

    return responseText;
  } catch (error) {
    logger.error({ error }, "Local info handler failed");
    const errorText = isEnglish
      ? "We're experiencing issues. Please try again in a few minutes."
      : "Estamos experimentando problemas. Intenta de nuevo en unos minutos.";
    await sendTextMessage(from, errorText);
    return errorText;
  }
}
