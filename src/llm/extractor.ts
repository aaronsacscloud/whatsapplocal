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

/**
 * Parse a raw LLM response into an ExtractionResult.
 */
function parseExtractionResponse(rawText: string): ExtractionResult {
  // Strip markdown code blocks if present
  const responseText = rawText
    .replace(/^```(?:json)?\s*\n?/m, "")
    .replace(/\n?```\s*$/m, "")
    .trim();

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
}

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

    const rawText =
      response.content[0].type === "text" ? response.content[0].text : "";

    return parseExtractionResponse(rawText);
  } catch (error) {
    logger.error({ error }, "Event extraction failed");
    return EMPTY_RESULT;
  }
}

/**
 * Extract event information from an image using Claude Vision.
 * Uses Sonnet for vision capabilities.
 */
export async function extractEventFromImage(
  imageBase64: string,
  mimeType: string
): Promise<ExtractionResult> {
  const logger = getLogger();
  const client = getLLMClient();

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      system: EXTRACTOR_SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mimeType as
                  | "image/jpeg"
                  | "image/png"
                  | "image/gif"
                  | "image/webp",
                data: imageBase64,
              },
            },
            {
              type: "text",
              text: "Extrae la información del evento de esta imagen/flyer. Responde con el JSON indicado en las instrucciones.",
            },
          ],
        },
      ],
    });

    const rawText =
      response.content[0].type === "text" ? response.content[0].text : "";

    return parseExtractionResponse(rawText);
  } catch (error) {
    logger.error({ error }, "Image event extraction failed");
    return EMPTY_RESULT;
  }
}
