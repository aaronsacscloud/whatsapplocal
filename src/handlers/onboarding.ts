import { sendTextMessage } from "../whatsapp/sender.js";
import { isOnboardingComplete, getUserName, findUserByPhone } from "../users/repository.js";
import { hashPhone } from "../utils/hash.js";
import { searchEvents } from "../events/repository.js";
import { getConfig } from "../config.js";
import { getLogger } from "../utils/logger.js";

/**
 * Get today's date range in SMA timezone (UTC-6).
 * Uses fixed offset — do NOT use getTimezoneOffset.
 */
function getTodayRangeSMA(): { todayStart: Date; todayEnd: Date } {
  const now = new Date();
  const sma = new Date(now.getTime() - 6 * 3600000);
  const todayStart = new Date(
    Date.UTC(sma.getUTCFullYear(), sma.getUTCMonth(), sma.getUTCDate(), 6, 0, 0)
  );
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  return { todayStart, todayEnd };
}

/** Map interest tags to event categories for filtering */
const INTEREST_TO_CATEGORY: Record<string, string> = {
  music: "music",
  food: "food",
  culture: "culture",
  nightlife: "nightlife",
  wellness: "wellness",
  adventure: "adventure",
  wine: "wine",
};

/**
 * Fetch today's top events matching optional interest categories and format as a short list.
 */
export async function getTodayEventsText(
  interests?: string[] | null,
): Promise<string> {
  const logger = getLogger();
  const config = getConfig();

  try {
    const { todayStart, todayEnd } = getTodayRangeSMA();

    // If user has specific interests (not "everything"), try to fetch matching events first
    let events: Awaited<ReturnType<typeof searchEvents>> = [];

    if (interests && interests.length > 0 && !interests.includes("everything")) {
      // Try each interest category to gather matching events
      for (const interest of interests) {
        const category = INTEREST_TO_CATEGORY[interest];
        if (!category) continue;
        const catEvents = await searchEvents({
          city: config.DEFAULT_CITY,
          dateFrom: todayStart,
          dateTo: todayEnd,
          category,
          limit: 3,
        });
        events.push(...catEvents);
        if (events.length >= 3) break;
      }
      // Deduplicate by id
      const seen = new Set<string>();
      events = events.filter((e) => {
        if (seen.has(e.id)) return false;
        seen.add(e.id);
        return true;
      });
      events = events.slice(0, 3);
    }

    // Fallback to general events if no interest-based results
    if (events.length === 0) {
      events = await searchEvents({
        city: config.DEFAULT_CITY,
        dateFrom: todayStart,
        dateTo: todayEnd,
        limit: 3,
      });
    }

    if (events.length === 0) {
      return "Aun no tengo eventos para hoy — preguntame cuando quieras!";
    }

    const lines = events.map((e, i) => {
      const time = e.eventDate
        ? new Date(e.eventDate).toLocaleTimeString("es-MX", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
            timeZone: "America/Mexico_City",
          })
        : e.recurrenceTime ?? "";
      const venue = e.venueName ? ` - ${e.venueName}` : "";
      const timeStr = time ? ` ${time}` : "";
      return `${i + 1}. *${e.title}*${timeStr}${venue}`;
    });

    return lines.join("\n");
  } catch (error) {
    logger.warn({ error }, "Failed to fetch today's events for onboarding");
    return "Preguntame sobre eventos, restaurantes o lo que necesites!";
  }
}

/**
 * Handle the onboarding entry point for both new and returning users.
 * For NEW users: sends step 1 — ask for name.
 * For RETURNING users: shows personalized greeting + today's events.
 */
export async function handleOnboarding(
  from: string,
  language: "es" | "en" = "es"
): Promise<void> {
  const phoneHash = hashPhone(from);
  const completed = await isOnboardingComplete(phoneHash);

  if (completed) {
    // Returning user — personalized greeting + today's events
    const name = await getUserName(phoneHash);
    const user = await findUserByPhone(from);
    const interests = user?.interests ?? null;
    const eventsText = await getTodayEventsText(interests);

    const greeting = name
      ? `Hola ${name}! Aqui tienes lo mejor de hoy:`
      : `Hola de nuevo! Aqui tienes lo mejor de hoy:`;

    const message = `${greeting}\n\n${eventsText}\n\nPreguntame mas sobre cualquiera de estos, o lo que necesites!`;
    await sendTextMessage(from, message);
  } else {
    // New user — Step 1: ask for name
    const message = `Hola! Soy tu guia local de San Miguel de Allende. Como te llamas?`;
    await sendTextMessage(from, message);
  }
}
