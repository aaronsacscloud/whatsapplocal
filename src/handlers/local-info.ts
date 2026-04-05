import { getLLMClient } from "../llm/client.js";
import { sendTextMessage } from "../whatsapp/sender.js";
import { getLogger } from "../utils/logger.js";
import { getLocalKnowledge } from "../knowledge/index.js";
import { getWeatherContext } from "../knowledge/weather.js";
import { searchKnowledge, learnFromWeb } from "../knowledge/learner.js";
import { getConfig } from "../config.js";
import type { ConversationMessage } from "../llm/responder.js";

const LOCAL_INFO_SYSTEM = `Eres un guia local amigable de San Miguel de Allende. Hablas como un amigo que conoce cada rincon de la ciudad.
Responde de forma natural y conversacional, como si estuvieras platicando por WhatsApp con un cuate.
Da nombres especificos de lugares, direcciones con referencias ("a dos cuadras del Jardin"), precios reales, horarios.
Si no sabes algo con certeza, dilo honesto pero sugiere algo util.
NUNCA digas "buscalo en Google" o "no tengo esa info" — si no sabes, da una alternativa o sugerencia.
Maximo 600 caracteres. Sin bullet points, sin encabezados. Maximo 2 emojis.
Termina con un tip de local o sugerencia practica.`;

const LOCAL_INFO_SYSTEM_EN = `You are a friendly local guide for San Miguel de Allende. Talk like a friend who knows every corner of the city.
Be natural and conversational, like texting a friend on WhatsApp.
Give specific place names, addresses with landmarks ("two blocks from the Jardin"), real prices, hours.
If unsure about something, say so honestly but suggest something useful.
NEVER say "search Google" or "I don't have that info" — if you don't know, give an alternative or suggestion.
Maximum 600 characters. No bullet points, no headers. Max 2 emojis.
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

  // Search web for specific info BEFORE responding (makes the bot actually useful)
  let webKnowledge = "";
  try {
    const learned = await learnFromWeb(body, config.DEFAULT_CITY, language);
    if (learned) {
      logger.info({ query: body.substring(0, 50) }, "Learned from web, using in response");
      webKnowledge = learned;
    }
  } catch {
    // Web search failed, continue with knowledge base only
  }

  // If we got good web results, send those directly
  if (webKnowledge.length > 50) {
    await sendTextMessage(from, webKnowledge);
    return webKnowledge;
  }

  try {
    const contextParts = [knowledge];
    if (weatherContext) contextParts.push(weatherContext);

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
