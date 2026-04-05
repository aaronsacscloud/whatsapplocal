import { sendTextMessage, sendInteractiveButtons } from "../whatsapp/sender.js";
import { updatePreferences, getUserLanguage } from "../users/repository.js";
import { hashPhone } from "../utils/hash.js";
import { getLogger } from "../utils/logger.js";
import {
  ONBOARDING_INTERESTS_MESSAGE,
  ONBOARDING_INTERESTS_MESSAGE_EN,
} from "../llm/prompts.js";
import { handleCalendarRequest } from "./calendar-handler.js";
import { handleOnboardingResponse } from "./onboarding-response.js";
import { getRecentMessages } from "../conversations/repository.js";

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

  // --- New onboarding: interest list selections ---
  if (replyId.startsWith("interest_")) {
    // Get last bot message to confirm we're in interests step
    const history = await getRecentMessages(phoneHash, 5);
    const lastBotMessage = history
      .filter((msg) => msg.role === "assistant")
      .at(-1);

    const handled = await handleOnboardingResponse(
      from,
      replyId,
      lastBotMessage?.content ?? null,
      language
    );
    if (handled) return true;

    // Fallback: force-handle as interest selection even without matching context
    return handleOnboardingResponse(from, replyId, "que te interesa mas", language);
  }

  // --- Onboarding: day selection buttons ---
  if (replyId === "onboard_today" || replyId === "onboard_tomorrow" || replyId === "onboard_weekend") {
    // Map button to a natural query and fall through to normal routing
    // The router will classify it as event_query
    return false;
  }

  // --- Legacy onboarding button replies (backward compat) ---
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

  // --- Plan builder button replies ---
  if (replyId === "plan_modify") {
    const msg = isEnglish
      ? "What would you like to change? (e.g. different restaurant, later start time, add drinks)"
      : "Que te gustaria cambiar? (ej: otro restaurante, empezar mas tarde, agregar drinks)";
    await sendTextMessage(from, msg);
    return true;
  }

  if (replyId === "plan_new") {
    const msg = isEnglish
      ? "What kind of plan do you want? Tell me the day, group size, vibe, and any preferences."
      : "Que tipo de plan quieres? Dime el dia, cuantas personas, el vibe y lo que prefieras.";
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
