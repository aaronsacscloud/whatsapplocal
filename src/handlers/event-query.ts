import { searchFromClassification } from "../events/search.js";
import { generateResponse, type ConversationMessage } from "../llm/responder.js";
import { sendTextMessage, sendInteractiveButtons } from "../whatsapp/sender.js";
import { incrementQueryCount } from "../users/repository.js";
import { hashPhone } from "../utils/hash.js";
import { getConfig } from "../config.js";
import { getLogger } from "../utils/logger.js";
import type { ClassificationResult } from "../llm/classifier.js";
import { storeRecentEvents } from "./event-context.js";
import { formatWeeklyCalendar, isWeeklyRequest } from "./weekly-calendar.js";
import { isCalendarRequest, handleCalendarRequest } from "./calendar-handler.js";

export async function handleEventQuery(
  from: string,
  body: string,
  classification: ClassificationResult,
  conversationHistory: ConversationMessage[] = [],
  language: "es" | "en" = "es",
  interests?: string[]
): Promise<string> {
  const config = getConfig();
  const logger = getLogger();
  const isEnglish = language === "en";
  const city = classification.city ?? config.DEFAULT_CITY;

  // Check if user is asking to add an event to calendar
  if (isCalendarRequest(body)) {
    await handleCalendarRequest(from, "calendar_0", language);
    return isEnglish
      ? "Calendar invite generated."
      : "Invitacion de calendario generada.";
  }

  const events = await searchFromClassification(classification, interests);

  // Store events in context for calendar/share features
  if (events.length > 0) {
    storeRecentEvents(from, events);
  }

  // Check if this is a weekly calendar view request
  if (isWeeklyRequest(classification.date) && events.length > 0) {
    const weeklyMessages = formatWeeklyCalendar(events, language);

    // Send all weekly calendar messages
    for (let i = 0; i < weeklyMessages.length; i++) {
      await sendTextMessage(from, weeklyMessages[i]);
    }

    // Send action buttons after weekly view
    await sendEventActionButtons(from, isEnglish);
    await incrementQueryCount(hashPhone(from));

    return weeklyMessages[0] || (isEnglish ? "No events found." : "No hay eventos.");
  }

  // Standard event query flow — pass budget filter if detected
  // The responder now sends structured cards directly (images + cards + summary)
  // so we only need to send the first card as text if there are no events
  // (LLM fallback case)
  const response = await generateResponse(body, events, city, conversationHistory, language, from, classification.budget);

  // Send the response text (first event card or LLM fallback)
  if (response) {
    await sendTextMessage(from, response);
  }

  // Send action buttons if we found events
  if (events.length > 0) {
    await sendEventActionButtons(from, isEnglish);
  }

  await incrementQueryCount(hashPhone(from));

  return response;
}

/**
 * Send interactive action buttons after showing events.
 */
async function sendEventActionButtons(
  from: string,
  isEnglish: boolean
): Promise<void> {
  const logger = getLogger();

  try {
    const buttons = isEnglish
      ? [
          { id: "action_more_events", title: "More events" },
          { id: "action_other_category", title: "Other category" },
          { id: "action_share", title: "Share" },
        ]
      : [
          { id: "action_more_events", title: "Ver mas eventos" },
          { id: "action_other_category", title: "Otra categoria" },
          { id: "action_share", title: "Compartir" },
        ];

    const body = isEnglish
      ? "What would you like to do next?"
      : "Que te gustaria hacer?";

    await sendInteractiveButtons(from, body, buttons);
  } catch (error) {
    logger.debug({ error }, "Failed to send action buttons, skipping");
  }
}
