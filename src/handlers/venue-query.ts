import { searchFromClassification } from "../events/search.js";
import { generateResponse, type ConversationMessage } from "../llm/responder.js";
import { sendTextMessage, sendImageMessage } from "../whatsapp/sender.js";
import { incrementQueryCount } from "../users/repository.js";
import { hashPhone } from "../utils/hash.js";
import { getConfig } from "../config.js";
import { getLogger } from "../utils/logger.js";
import type { ClassificationResult } from "../llm/classifier.js";
import { searchKnowledge, learnFromWeb, getLastRichResult } from "../knowledge/learner.js";

export async function handleVenueQuery(
  from: string,
  body: string,
  classification: ClassificationResult,
  conversationHistory: ConversationMessage[] = [],
  language: "es" | "en" = "es"
): Promise<string> {
  const config = getConfig();
  const logger = getLogger();
  const city = classification.city ?? config.DEFAULT_CITY;

  // First check knowledge cache
  const cached = await searchKnowledge(body, city);
  if (cached) {
    await sendTextMessage(from, cached);
    await incrementQueryCount(hashPhone(from));
    return cached;
  }

  const events = await searchFromClassification(classification);

  // If no events for this venue, search the web for info
  if (events.length === 0) {
    try {
      const learned = await learnFromWeb(body, city, language);
      if (learned) {
        logger.info({ query: body.substring(0, 50) }, "Venue info from web search");

        // Get rich result with media
        const rich = getLastRichResult();

        // Send image first if found
        if (rich?.imageUrl) {
          await sendImageMessage(from, rich.imageUrl, "");
        }

        // Send the text
        await sendTextMessage(from, learned);

        // Send video links if found
        if (rich?.videoLinks && rich.videoLinks.length > 0) {
          const isEn = language === "en";
          const videoMsg = rich.videoLinks
            .map((v) => v)
            .join("\n");
          await sendTextMessage(from, isEn
            ? `Videos and photos:\n${videoMsg}`
            : `Videos y fotos:\n${videoMsg}`);
        }

        await incrementQueryCount(hashPhone(from));
        return learned;
      }
    } catch {}
  }

  const response = await generateResponse(body, events, city, conversationHistory, language, from, classification.budget);

  if (events.length === 0 && response) {
    await sendTextMessage(from, response);
  }

  await incrementQueryCount(hashPhone(from));
  return response;
}
