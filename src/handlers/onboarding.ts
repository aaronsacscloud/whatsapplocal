import { sendTextMessage } from "../whatsapp/sender.js";
import { isOnboardingComplete, getUserName } from "../users/repository.js";
import { hashPhone } from "../utils/hash.js";
import { searchEvents } from "../events/repository.js";
import { getConfig } from "../config.js";
import { getLogger } from "../utils/logger.js";
import { saveMessage } from "../conversations/repository.js";

/**
 * SMA timezone helpers.
 */
function getSMANow(): Date {
  return new Date(Date.now() - 6 * 3600000);
}

function smaDayStart(sma: Date): Date {
  return new Date(Date.UTC(sma.getUTCFullYear(), sma.getUTCMonth(), sma.getUTCDate(), 6, 0, 0));
}

const DAY_MS = 24 * 60 * 60 * 1000;

const DAY_NAMES_ES = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];

/**
 * Smart event search: cascades through today → tomorrow → next days until it finds events.
 * Returns the events + a label describing which day they're for.
 */
async function findNextEvents(city: string): Promise<{ events: any[]; label: string }> {
  const sma = getSMANow();
  const hour = sma.getUTCHours();
  const dayOfWeek = sma.getUTCDay(); // 0=Sun, 5=Fri, 6=Sat
  const today = smaDayStart(sma);

  // If it's past 9 PM, skip today — nothing new is starting
  const skipToday = hour >= 21;

  const searches = [];

  if (!skipToday) {
    searches.push({ from: today, to: new Date(today.getTime() + DAY_MS), label: "hoy" });
  }

  // Tomorrow
  const tomorrow = new Date(today.getTime() + DAY_MS);
  const tomorrowDay = (dayOfWeek + 1) % 7;
  searches.push({
    from: tomorrow,
    to: new Date(tomorrow.getTime() + DAY_MS),
    label: `manana ${DAY_NAMES_ES[tomorrowDay]}`,
  });

  // If today is Thu/Fri, also try Saturday and Sunday
  if (dayOfWeek >= 4 || dayOfWeek === 0) {
    const daysToSat = (6 - dayOfWeek + 7) % 7;
    if (daysToSat > 1) {
      const sat = new Date(today.getTime() + daysToSat * DAY_MS);
      searches.push({ from: sat, to: new Date(sat.getTime() + DAY_MS), label: "el sabado" });
    }
    const daysToSun = (7 - dayOfWeek) % 7;
    if (daysToSun > 1) {
      const sun = new Date(today.getTime() + daysToSun * DAY_MS);
      searches.push({ from: sun, to: new Date(sun.getTime() + DAY_MS), label: "el domingo" });
    }
  }

  // Next 7 days as fallback
  searches.push({
    from: today,
    to: new Date(today.getTime() + 7 * DAY_MS),
    label: "esta semana",
  });

  for (const search of searches) {
    const events = await searchEvents({
      city,
      dateFrom: search.from,
      dateTo: search.to,
      limit: 5,
      contentType: "all",
    });

    if (events.length > 0) {
      return { events: events.slice(0, 5), label: search.label };
    }
  }

  return { events: [], label: "" };
}

/**
 * Format events as a short preview list.
 */
function formatEventPreview(events: any[]): string {
  return events.map((e, i) => {
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
  }).join("\n");
}

/**
 * Get a time-aware greeting modifier.
 */
function getTimeGreeting(): string {
  const sma = getSMANow();
  const hour = sma.getUTCHours();
  if (hour < 12) return "Buenos dias";
  if (hour < 18) return "Buenas tardes";
  return "Buenas noches";
}

/**
 * Handle the onboarding entry point.
 * NEW users: ask for name.
 * RETURNING users: smart greeting with next available events.
 */
export async function handleOnboarding(
  from: string,
  language: "es" | "en" = "es"
): Promise<void> {
  const phoneHash = hashPhone(from);
  const config = getConfig();
  const completed = await isOnboardingComplete(phoneHash);

  if (completed) {
    // Returning user — smart greeting with events
    const name = await getUserName(phoneHash);
    const timeGreeting = getTimeGreeting();
    const greeting = name
      ? `${timeGreeting} ${name}!`
      : `${timeGreeting}!`;

    const { events, label } = await findNextEvents(config.DEFAULT_CITY);

    let msg: string;
    if (events.length > 0) {
      const preview = formatEventPreview(events);
      msg = `${greeting} Esto es lo que hay ${label}:\n\n${preview}\n\nPreguntame por mas detalles de cualquiera, o dime que buscas.`;
    } else {
      msg = `${greeting} Ahorita no tengo eventos cargados, pero preguntame lo que quieras sobre San Miguel. Puedo ayudarte con restaurantes, actividades, tips locales y mas.`;
    }

    await sendTextMessage(from, msg);
    await saveMessage(phoneHash, "assistant", msg, "onboarding");
  } else {
    // New user — Step 1: ask for name
    const msg = `Hola! Soy tu guia local de San Miguel de Allende. Voy a ayudarte a descubrir los mejores eventos, restaurantes y experiencias de la ciudad.\n\nComo te llamas?`;
    await sendTextMessage(from, msg);
    await saveMessage(phoneHash, "assistant", msg, "onboarding");
  }
}
