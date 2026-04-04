import { classifyIntent } from "../llm/classifier.js";
import { upsertUser } from "../users/repository.js";
import { getConfig } from "../config.js";
import { getLogger } from "../utils/logger.js";
import { withRetry } from "../utils/retry.js";
import { sendTextMessage } from "./sender.js";
import { PROCESSING_MESSAGE } from "../llm/prompts.js";
import { handleOnboarding } from "../handlers/onboarding.js";
import { handleEventQuery } from "../handlers/event-query.js";
import { handleVenueQuery } from "../handlers/venue-query.js";
import { handleForward } from "../handlers/forward.js";
import { handleFeedback } from "../handlers/feedback.js";
import { handleUnknown } from "../handlers/unknown.js";
import { handleLocalInfo } from "../handlers/local-info.js";

export interface IncomingMessage {
  from: string;
  body: string;
  messageId: string;
  isForwarded: boolean;
}

export async function routeMessage(message: IncomingMessage): Promise<void> {
  const logger = getLogger();
  const config = getConfig();

  logger.info(
    { from: message.from.slice(-4), isForwarded: message.isForwarded },
    "Processing message"
  );

  try {
    // Track user
    await upsertUser(message.from, config.DEFAULT_CITY);

    // Forwarded messages go directly to forward handler
    if (message.isForwarded) {
      await withRetry(
        () => handleForward(message.from, message.body),
        "forward-handler"
      );
      return;
    }

    // Classify intent
    const classification = await withRetry(
      () => classifyIntent(message.body),
      "classify-intent"
    );

    logger.info(
      { intent: classification.intent, messageId: message.messageId },
      "Intent classified"
    );

    switch (classification.intent) {
      case "onboarding":
        await handleOnboarding(message.from);
        break;

      case "event_query":
        await withRetry(
          () => handleEventQuery(message.from, message.body, classification),
          "event-query-handler"
        );
        break;

      case "venue_query":
        await withRetry(
          () => handleVenueQuery(message.from, message.body, classification),
          "venue-query-handler"
        );
        break;

      case "local_info":
        await withRetry(
          () => handleLocalInfo(message.from, message.body),
          "local-info-handler"
        );
        break;

      case "forward_content":
        await withRetry(
          () => handleForward(message.from, message.body),
          "forward-handler"
        );
        break;

      case "feedback":
        await handleFeedback(message.from);
        break;

      case "unknown":
      default:
        await handleUnknown(message.from);
        break;
    }
  } catch (error) {
    logger.error({ error, messageId: message.messageId }, "Message routing failed");
    try {
      await sendTextMessage(message.from, PROCESSING_MESSAGE);
    } catch {
      logger.error("Failed to send error message to user");
    }
  }
}
