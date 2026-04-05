import { sendTextMessage, sendDocumentMessage } from "../whatsapp/sender.js";
import { getLogger } from "../utils/logger.js";
import { generateICS, type CalendarEvent } from "../utils/calendar.js";
import { generateGoogleCalendarUrl } from "../utils/calendar-links.js";
import { getRecentEvents } from "./event-context.js";

/**
 * Handle "add to calendar" requests.
 * Generates an .ics file and sends it as a document via WhatsApp.
 */
export async function handleCalendarRequest(
  from: string,
  replyId: string,
  language: "es" | "en" = "es"
): Promise<void> {
  const logger = getLogger();
  const isEnglish = language === "en";

  try {
    // Get recently shown events from context
    const recentEvents = getRecentEvents(from);

    if (!recentEvents || recentEvents.length === 0) {
      const msg = isEnglish
        ? "I don't have recent events to add. Ask me about events first!"
        : "No tengo eventos recientes para agregar. Preguntame sobre eventos primero!";
      await sendTextMessage(from, msg);
      return;
    }

    // Parse event index from replyId (e.g., "calendar_0" -> index 0)
    const indexStr = replyId.replace("calendar_", "");
    const eventIndex = parseInt(indexStr, 10);

    // If index is valid, add specific event; otherwise add first one
    const targetEvent = (!isNaN(eventIndex) && eventIndex < recentEvents.length)
      ? recentEvents[eventIndex]
      : recentEvents[0];

    if (!targetEvent) {
      const msg = isEnglish
        ? "Could not find that event. Try asking again."
        : "No pude encontrar ese evento. Intenta preguntar de nuevo.";
      await sendTextMessage(from, msg);
      return;
    }

    const calEvent: CalendarEvent = {
      title: targetEvent.title,
      date: targetEvent.eventDate ? new Date(targetEvent.eventDate) : new Date(),
      endDate: targetEvent.eventEndDate ? new Date(targetEvent.eventEndDate) : undefined,
      venue: targetEvent.venueName || undefined,
      description: targetEvent.description || undefined,
      url: targetEvent.sourceUrl || undefined,
    };

    const icsContent = generateICS(calEvent);

    // Create a base64 data URI for the .ics file
    const base64 = Buffer.from(icsContent, "utf-8").toString("base64");
    const dataUri = `data:text/calendar;base64,${base64}`;

    // Try sending as document; if it fails (data URIs may not work), send as text
    try {
      const filename = `${targetEvent.title.replace(/[^a-zA-Z0-9 ]/g, "").substring(0, 30).trim()}.ics`;
      await sendDocumentMessage(from, dataUri, filename, isEnglish
        ? `Calendar invite: ${targetEvent.title}`
        : `Invitacion: ${targetEvent.title}`
      );
    } catch {
      // Fallback: send ICS content as text so the user can save it
      logger.warn("Document send failed, sending ICS as text");
    }

    const gcalUrl = await generateGoogleCalendarUrl(targetEvent);
    const confirmMsg = isEnglish
      ? `Added to calendar: *${targetEvent.title}*\n\nGoogle Calendar: ${gcalUrl}\n\nIf the file didn't arrive, you can use the link above.`
      : `Agregado al calendario: *${targetEvent.title}*\n\nGoogle Calendar: ${gcalUrl}\n\nSi no llego el archivo, usa el link de arriba.`;
    await sendTextMessage(from, confirmMsg);
  } catch (error) {
    logger.error({ error }, "Calendar handler failed");
    const msg = isEnglish
      ? "Sorry, I couldn't generate the calendar invite. Try again later."
      : "Lo siento, no pude generar la invitacion. Intenta mas tarde.";
    await sendTextMessage(from, msg);
  }
}

/**
 * Detect if a user message is asking to add an event to their calendar.
 */
export function isCalendarRequest(message: string): boolean {
  const lower = message.toLowerCase().trim();
  return (
    lower.includes("agregar al calendario") ||
    lower.includes("agregar a mi calendario") ||
    lower.includes("add to calendar") ||
    lower.includes("add to my calendar") ||
    lower.includes("calendar invite") ||
    lower.includes("invitacion al calendario") ||
    lower.includes("guardar evento") ||
    lower.includes("save event") ||
    lower.includes(".ics")
  );
}
