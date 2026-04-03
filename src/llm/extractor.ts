import { getLLMClient } from "./client.js";
import { EXTRACTOR_SYSTEM } from "./prompts.js";
import { getLogger } from "../utils/logger.js";

export interface ExtractionResult {
  isEvent: boolean;
  confidence: number;
  title: string | null;
  venueName: string | null;
  venueAddress: string | null;
  neighborhood: string | null;
  eventDate: string | null;
  category: string | null;
  description: string | null;
}

const EMPTY_RESULT: ExtractionResult = {
  isEvent: false,
  confidence: 0,
  title: null,
  venueName: null,
  venueAddress: null,
  neighborhood: null,
  eventDate: null,
  category: null,
  description: null,
};

export async function extractEvent(
  text: string
): Promise<ExtractionResult> {
  const logger = getLogger();
  const client = getLLMClient();

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      system: EXTRACTOR_SYSTEM,
      messages: [{ role: "user", content: text }],
    });

    const responseText =
      response.content[0].type === "text" ? response.content[0].text : "";

    const parsed = JSON.parse(responseText);

    return {
      isEvent: parsed.isEvent ?? false,
      confidence: parsed.confidence ?? 0,
      title: parsed.title ?? null,
      venueName: parsed.venueName ?? null,
      venueAddress: parsed.venueAddress ?? null,
      neighborhood: parsed.neighborhood ?? null,
      eventDate: parsed.eventDate ?? null,
      category: parsed.category ?? null,
      description: parsed.description ?? null,
    };
  } catch (error) {
    logger.error({ error }, "Event extraction failed");
    return EMPTY_RESULT;
  }
}
