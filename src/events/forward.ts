import { extractEvent } from "../llm/extractor.js";
import { isContentAcceptable } from "../utils/moderation.js";
import { eventDeduplicationHash } from "../utils/hash.js";
import { upsertEvent, findByDedupHash } from "./repository.js";
import { getConfig } from "../config.js";
import { getLogger } from "../utils/logger.js";
import type { Event } from "../db/schema.js";

export interface ForwardResult {
  success: boolean;
  event?: Event;
  reason?: "extracted" | "duplicate" | "low_confidence" | "not_event" | "error";
}

export async function processForwardedContent(
  text: string
): Promise<ForwardResult> {
  const logger = getLogger();
  const config = getConfig();

  try {
    const extraction = await extractEvent(text);

    if (!extraction.isEvent) {
      return { success: false, reason: "not_event" };
    }

    if (!isContentAcceptable(extraction.confidence)) {
      logger.info(
        { confidence: extraction.confidence },
        "Forwarded content below confidence threshold"
      );
      return { success: false, reason: "low_confidence" };
    }

    // Check for duplicates
    let dedupHash: string | undefined;
    if (extraction.venueName && extraction.eventDate) {
      dedupHash = eventDeduplicationHash(
        extraction.venueName,
        extraction.eventDate,
        config.DEFAULT_CITY
      );
      const existing = await findByDedupHash(dedupHash);
      if (existing) {
        return { success: false, reason: "duplicate", event: existing };
      }
    }

    const event = await upsertEvent({
      title: extraction.title ?? "Evento compartido",
      venueName: extraction.venueName,
      venueAddress: extraction.venueAddress,
      neighborhood: extraction.neighborhood,
      city: config.DEFAULT_CITY,
      eventDate: extraction.eventDate
        ? new Date(extraction.eventDate)
        : null,
      category: (extraction.category as any) ?? "other",
      description: extraction.description,
      sourceType: "user_forwarded",
      confidence: extraction.confidence,
      rawContent: text,
      dedupHash,
      expiresAt: extraction.eventDate
        ? new Date(
            new Date(extraction.eventDate).getTime() + 6 * 60 * 60 * 1000
          )
        : null,
    });

    return { success: true, event, reason: "extracted" };
  } catch (error) {
    logger.error({ error }, "Failed to process forwarded content");
    return { success: false, reason: "error" };
  }
}
