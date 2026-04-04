import { sendTextMessage, sendInteractiveButtons } from "../whatsapp/sender.js";
import { updatePreferences, getUserLanguage } from "../users/repository.js";
import { hashPhone } from "../utils/hash.js";
import { getLogger } from "../utils/logger.js";
import {
  ONBOARDING_INTERESTS_MESSAGE,
  ONBOARDING_INTERESTS_MESSAGE_EN,
} from "../llm/prompts.js";
import { handleCalendarRequest } from "./calendar-handler.js";

/**
 * Handle interactive message replies (button taps and list selections).
 * Returns true if the reply was handled, false if it should fall through
 * to normal message routing.
 */
export async function handleInteractiveReply(
  from: string,
  replyId: string,
  replyTitle: string
): Promise<boolean> {
  const logger = getLogger();
  const phoneHash = hashPhone(from);
  const language = await getUserLanguage(phoneHash);
  const isEnglish = language === "en";

  logger.info({ from: from.slice(-4), replyId }, "Interactive reply received");

  // --- Onboarding button replies ---
  if (replyId === "onboarding_tourist") {
    await updatePreferences(phoneHash, { isTourist: true, language });
    const message = isEnglish
      ? ONBOARDING_INTERESTS_MESSAGE_EN
      : ONBOARDING_INTERESTS_MESSAGE;
    await sendTextMessage(from, message);
    return true;
  }

  if (replyId === "onboarding_local") {
    await updatePreferences(phoneHash, { isTourist: false, language });
    const message = isEnglish
      ? ONBOARDING_INTERESTS_MESSAGE_EN
      : ONBOARDING_INTERESTS_MESSAGE;
    await sendTextMessage(from, message);
    return true;
  }

  if (replyId === "onboarding_moving") {
    await updatePreferences(phoneHash, { isTourist: true, language });
    const message = isEnglish
      ? ONBOARDING_INTERESTS_MESSAGE_EN
      : ONBOARDING_INTERESTS_MESSAGE;
    await sendTextMessage(from, message);
    return true;
  }

  // --- Event action button replies ---
  if (replyId === "action_more_events") {
    // Fall through to normal routing — the body "Ver mas eventos" / "More events"
    // will be classified as an event_query
    return false;
  }

  if (replyId === "action_other_category") {
    const msg = isEnglish
      ? "What type of events interest you? (music, food, art, nightlife, wellness, tours, wine)"
      : "Que tipo de eventos te interesan? (musica, comida, arte, vida nocturna, bienestar, tours, vino)";
    await sendTextMessage(from, msg);
    return true;
  }

  if (replyId === "action_share") {
    // Will be handled below — generate share message
    const msg = isEnglish
      ? "Forward my last message to your friends, or send them this link to chat with me directly:\nwa.me/12058920417?text=Hola"
      : "Reenvia mi ultimo mensaje a tus amigos, o enviales este link para chatear conmigo:\nwa.me/12058920417?text=Hola";
    await sendTextMessage(from, msg);
    return true;
  }

  // --- Calendar action ---
  if (replyId.startsWith("calendar_")) {
    // Extract event index from replyId like "calendar_0", "calendar_1"
    await handleCalendarRequest(from, replyId, language);
    return true;
  }

  // Unknown interactive reply — don't handle, fall through
  logger.debug({ replyId }, "Unknown interactive reply ID, falling through");
  return false;
}
