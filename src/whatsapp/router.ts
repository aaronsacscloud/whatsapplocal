import { classifyIntent } from "../llm/classifier.js";
import { upsertUser, updatePreferences, findUserByPhone } from "../users/repository.js";
import { getConfig } from "../config.js";
import { getLogger } from "../utils/logger.js";
import { withRetry } from "../utils/retry.js";
import { sendTextMessage } from "./sender.js";
import { PROCESSING_MESSAGE, PROCESSING_MESSAGE_EN } from "../llm/prompts.js";
import { handleOnboarding } from "../handlers/onboarding.js";
import { handleOnboardingResponse } from "../handlers/onboarding-response.js";
import { handleInteractiveReply } from "../handlers/interactive-reply.js";
import { handleEventQuery } from "../handlers/event-query.js";
import { handleVenueQuery } from "../handlers/venue-query.js";
import { handleForward } from "../handlers/forward.js";
import { handleFeedback } from "../handlers/feedback.js";
import { handleUnknown } from "../handlers/unknown.js";
import { handleLocalInfo } from "../handlers/local-info.js";
import { handleImage } from "../handlers/image.js";
import { handleVoice } from "../handlers/voice.js";
import { handleSetAlert } from "../handlers/alert.js";
import {
  handleSaveFavorite,
  handleListFavorites,
  handleRemoveFavorite,
} from "../handlers/favorites.js";
import { handleStopDigest } from "../handlers/digest-opt-out.js";
import { handleInvite } from "../handlers/invite.js";
import { hashPhone } from "../utils/hash.js";
import {
  saveMessage,
  getRecentMessages,
} from "../conversations/repository.js";
import { trackQuery } from "../analytics/tracker.js";

export interface IncomingMessage {
  from: string;
  body: string;
  messageId: string;
  isForwarded: boolean;
  /** Message type: text, image, audio, interactive, etc. */
  type: "text" | "image" | "audio" | "interactive" | "other";
  /** Media ID for image/audio messages */
  mediaId?: string;
  /** Button/list reply ID for interactive messages */
  interactiveReplyId?: string;
}

export async function routeMessage(message: IncomingMessage): Promise<void> {
  const logger = getLogger();
  const config = getConfig();
  const startTime = Date.now();
  const phoneHash = hashPhone(message.from);

  logger.info(
    { from: message.from.slice(-4), isForwarded: message.isForwarded, type: message.type },
    "Processing message"
  );

  try {
    // Track user
    await upsertUser(message.from, config.DEFAULT_CITY);

    // Handle image messages — route directly to image handler
    if (message.type === "image" && message.mediaId) {
      await saveMessage(phoneHash, "user", message.body || "[imagen]");

      await withRetry(
        () => handleImage(message.from, message.mediaId!),
        "image-handler"
      );

      await saveMessage(phoneHash, "assistant", "[image processed]", "image");
      trackQuery({
        phoneHash,
        intent: "image",
        responseTimeMs: Date.now() - startTime,
      });
      return;
    }

    // Handle audio/voice messages — route directly to voice handler
    if (message.type === "audio" && message.mediaId) {
      await saveMessage(phoneHash, "user", "[audio]");

      await withRetry(
        () => handleVoice(message.from, message.mediaId!),
        "voice-handler"
      );

      await saveMessage(phoneHash, "assistant", "[voice fallback sent]", "voice");
      trackQuery({
        phoneHash,
        intent: "voice",
        responseTimeMs: Date.now() - startTime,
      });
      return;
    }

    // Handle interactive message replies (button taps, list selections)
    if (message.type === "interactive" && message.interactiveReplyId) {
      await saveMessage(phoneHash, "user", `[interactive: ${message.interactiveReplyId}] ${message.body}`);

      const handled = await handleInteractiveReply(
        message.from,
        message.interactiveReplyId,
        message.body
      );

      if (handled) {
        await saveMessage(phoneHash, "assistant", "[interactive reply handled]", "interactive");
        trackQuery({
          phoneHash,
          intent: "interactive",
          responseTimeMs: Date.now() - startTime,
        });
        return;
      }
      // If not handled by interactive handler, fall through to normal routing
      // using the button title as the message body
    }

    // Fetch conversation history (last 5 messages for context)
    const history = await getRecentMessages(phoneHash, 5);

    // Save the user message to conversation history
    await saveMessage(phoneHash, "user", message.body);

    // Check if user is in the middle of an onboarding flow
    // Look at the last bot message to detect onboarding questions
    const lastBotMessage = history
      .filter((msg) => msg.role === "assistant")
      .at(-1);

    // Classify intent first so we have the detected language
    // (we need this even if we end up routing to onboarding-response)
    const classification = await withRetry(
      () => classifyIntent(message.body),
      "classify-intent"
    );

    const language = classification.language;

    // Update user language preference if detected
    await updatePreferences(phoneHash, { language });

    logger.info(
      { intent: classification.intent, language, messageId: message.messageId },
      "Intent classified"
    );

    // Try to handle as onboarding response (numbered replies to onboarding questions)
    // Only if the message looks like a short numbered reply
    const trimmedBody = message.body.trim();
    const looksLikeNumberedReply = /^[\d\s,]+$/.test(trimmedBody) && trimmedBody.length <= 20;

    if (looksLikeNumberedReply && lastBotMessage) {
      const handled = await handleOnboardingResponse(
        message.from,
        message.body,
        lastBotMessage.content,
        language
      );

      if (handled) {
        await saveMessage(phoneHash, "assistant", "[onboarding response]", "onboarding");
        trackQuery({
          phoneHash,
          intent: "onboarding",
          responseTimeMs: Date.now() - startTime,
        });
        return;
      }
    }

    // Forwarded messages go directly to forward handler
    if (message.isForwarded) {
      await withRetry(
        () => handleForward(message.from, message.body, language),
        "forward-handler"
      );

      // Save bot response and track analytics
      await saveMessage(phoneHash, "assistant", "[forwarded content processed]", "forward_content");
      trackQuery({
        phoneHash,
        intent: "forward_content",
        responseTimeMs: Date.now() - startTime,
      });
      return;
    }

    // Build conversation history for LLM-based handlers
    const conversationHistory = history.map((msg) => ({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    }));

    let botResponse: string | undefined;

    // Fetch user interests for personalization
    const user = await findUserByPhone(message.from);
    const userInterests = user?.interests ?? undefined;

    switch (classification.intent) {
      case "onboarding":
        await handleOnboarding(message.from, language);
        break;

      case "event_query":
        botResponse = await withRetry(
          () =>
            handleEventQuery(
              message.from,
              message.body,
              classification,
              conversationHistory,
              language,
              userInterests ?? undefined
            ),
          "event-query-handler"
        );
        break;

      case "venue_query":
        botResponse = await withRetry(
          () =>
            handleVenueQuery(
              message.from,
              message.body,
              classification,
              conversationHistory,
              language
            ),
          "venue-query-handler"
        );
        break;

      case "local_info":
        botResponse = await withRetry(
          () =>
            handleLocalInfo(message.from, message.body, conversationHistory, language),
          "local-info-handler"
        );
        break;

      case "forward_content":
        await withRetry(
          () => handleForward(message.from, message.body, language),
          "forward-handler"
        );
        break;

      case "feedback":
        await handleFeedback(message.from, language);
        break;

      case "invite":
        botResponse = await withRetry(
          () => handleInvite(message.from, language),
          "invite-handler"
        );
        break;

      case "set_alert":
        botResponse = await withRetry(
          () => handleSetAlert(message.from, classification, language),
          "set-alert-handler"
        );
        break;

      case "save_favorite":
        botResponse = await withRetry(
          () => handleSaveFavorite(message.from, language),
          "save-favorite-handler"
        );
        break;

      case "list_favorites":
        botResponse = await withRetry(
          () => handleListFavorites(message.from, language),
          "list-favorites-handler"
        );
        break;

      case "remove_favorite":
        botResponse = await withRetry(
          () => handleRemoveFavorite(message.from, language),
          "remove-favorite-handler"
        );
        break;

      case "stop_digest":
        botResponse = await withRetry(
          () => handleStopDigest(message.from, language),
          "stop-digest-handler"
        );
        break;

      case "unknown":
      default:
        await handleUnknown(message.from, language);
        break;
    }

    // Save the bot response to conversation history
    if (botResponse) {
      await saveMessage(phoneHash, "assistant", botResponse, classification.intent);
    }

    // Track analytics (fire-and-forget)
    trackQuery({
      phoneHash,
      intent: classification.intent,
      query: classification.query ?? message.body,
      category: classification.category ?? undefined,
      city: classification.city ?? config.DEFAULT_CITY,
      responseTimeMs: Date.now() - startTime,
    });
  } catch (error) {
    logger.error({ error, messageId: message.messageId }, "Message routing failed");
    try {
      // Try to detect language from the message for error response
      const isLikelyEnglish = /^[a-zA-Z\s.,!?'"]+$/.test(message.body.trim());
      const errorMessage = isLikelyEnglish ? PROCESSING_MESSAGE_EN : PROCESSING_MESSAGE;
      await sendTextMessage(message.from, errorMessage);
    } catch {
      logger.error("Failed to send error message to user");
    }
  }
}
