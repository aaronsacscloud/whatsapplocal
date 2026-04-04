import type { Event } from "../db/schema.js";

/**
 * SMA timezone offset: UTC-6 (CST)
 */
const SMA_TZ_OFFSET = -6;

function getSMANow(): Date {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utcMs + SMA_TZ_OFFSET * 3600000);
}

function getCategoryEmoji(category: string | null): string {
  const emojis: Record<string, string> = {
    music: "🎵",
    food: "🍽️",
    nightlife: "🌙",
    culture: "🎨",
    sports: "⚽",
    popup: "🎪",
    wellness: "🧘",
    tour: "🚶",
    class: "📚",
    adventure: "🎈",
    wine: "🍷",
  };
  return emojis[category || ""] || "📌";
}

interface DayEntry {
  dayKey: string;
  dayLabel: string;
  dayNumber: number;
  events: Event[];
}

/**
 * Format events into a weekly calendar view.
 * Returns an array of messages (split to keep under WhatsApp limits).
 */
export function formatWeeklyCalendar(
  events: Event[],
  language: "es" | "en" = "es"
): string[] {
  const isEn = language === "en";
  const sma = getSMANow();
  const today = new Date(sma.getFullYear(), sma.getMonth(), sma.getDate());

  // Build day-by-day structure for the full week (7 days)
  const days: DayEntry[] = [];
  const dayNames_es = ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"];
  const dayNames_en = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  for (let i = 0; i < 7; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    const dayOfWeek = date.getDay();
    const dayName = isEn ? dayNames_en[dayOfWeek] : dayNames_es[dayOfWeek];
    const dayNumber = date.getDate();

    days.push({
      dayKey: date.toISOString().split("T")[0],
      dayLabel: `${dayName} ${dayNumber}`,
      dayNumber,
      events: [],
    });
  }

  // Assign events to days
  for (const event of events) {
    const eventDate = (event as any).eventDate || (event as any).event_date;
    if (!eventDate) continue;

    const d = new Date(eventDate);
    const smaDt = new Date(d.getTime() + SMA_TZ_OFFSET * 3600000);
    const dayKey = new Date(smaDt.getFullYear(), smaDt.getMonth(), smaDt.getDate())
      .toISOString()
      .split("T")[0];

    const dayEntry = days.find((day) => day.dayKey === dayKey);
    if (dayEntry) {
      dayEntry.events.push(event);
    }
  }

  // Build messages — group 2-3 days per message to stay under WhatsApp limits
  const header = isEn
    ? "📅 *THIS WEEK IN SMA*\n"
    : "📅 *ESTA SEMANA EN SMA*\n";

  const messages: string[] = [];
  const DAYS_PER_MESSAGE = 3;

  for (let i = 0; i < days.length; i += DAYS_PER_MESSAGE) {
    const chunk = days.slice(i, i + DAYS_PER_MESSAGE);
    const lines: string[] = [];

    if (i === 0) {
      lines.push(header);
    }

    for (const day of chunk) {
      lines.push(`*${day.dayLabel}*`);

      if (day.events.length === 0) {
        const noEvents = isEn ? "  No events listed" : "  Sin eventos registrados";
        lines.push(noEvents);
      } else {
        for (const event of day.events) {
          const emoji = getCategoryEmoji((event as any).category);
          const title = (event as any).title || "Evento";
          const venue = (event as any).venueName || (event as any).venue_name || "";

          // Get time
          const eventDate = (event as any).eventDate || (event as any).event_date;
          let timeStr = "";
          if (eventDate) {
            const d = new Date(eventDate);
            const smaDt = new Date(d.getTime() + SMA_TZ_OFFSET * 3600000);
            const hasTime = d.getUTCHours() !== 0 || d.getUTCMinutes() !== 0;
            if (hasTime) {
              timeStr = smaDt.toLocaleTimeString(isEn ? "en-US" : "es-MX", {
                hour: "numeric",
                minute: "2-digit",
                hour12: true,
                timeZone: "UTC",
              });
            }
          }

          let eventLine = `  ${emoji} ${title}`;
          if (venue) eventLine += ` @ ${venue}`;
          if (timeStr) eventLine += ` — ${timeStr}`;

          lines.push(eventLine);
        }
      }

      lines.push(""); // Blank line between days
    }

    messages.push(lines.join("\n").trim());
  }

  // Add footer to last message
  if (messages.length > 0) {
    const footer = isEn
      ? "\nAsk me about any day for full details!"
      : "\nPreguntame por cualquier dia para ver los detalles!";
    messages[messages.length - 1] += footer;
  }

  return messages;
}

/**
 * Check if a classification date indicates a weekly/full-week request.
 */
export function isWeeklyRequest(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const lower = dateStr.toLowerCase().trim();
  return (
    lower.includes("esta semana") ||
    lower.includes("this week") ||
    lower.includes("la semana") ||
    lower.includes("weekly") ||
    lower === "semana"
  );
}
