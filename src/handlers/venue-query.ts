import { searchFromClassification } from "../events/search.js";
import { generateResponse, type ConversationMessage } from "../llm/responder.js";
import { sendTextMessage } from "../whatsapp/sender.js";
import { incrementQueryCount } from "../users/repository.js";
import { hashPhone } from "../utils/hash.js";
import { getConfig } from "../config.js";
import type { ClassificationResult } from "../llm/classifier.js";

export async function handleVenueQuery(
  from: string,
  body: string,
  classification: ClassificationResult,
  conversationHistory: ConversationMessage[] = [],
  language: "es" | "en" = "es"
): Promise<string> {
  const config = getConfig();
  const city = classification.city ?? config.DEFAULT_CITY;

  const events = await searchFromClassification(classification);
  const response = await generateResponse(body, events, city, conversationHistory, language);

  await sendTextMessage(from, response);
  await incrementQueryCount(hashPhone(from));

  return response;
}
