/**
 * Google Calendar URL and iCal (.ics) link generators for events.
 * SMA timezone: UTC-6 (CST). Event dates in DB are stored in UTC.
 */

import type { Event } from "../db/schema.js";

// SMA is UTC-6
const SMA_UTC_OFFSET_HOURS = 6;

/**
 * Format a Date as YYYYMMDDTHHmmSSZ for Google Calendar URLs.
 */
function formatGCalDate(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
}

/**
 * Get the start and end dates for an event in UTC.
 * If the event has no specific time (midnight UTC), default to 19:00-22:00 SMA time
 * which is 01:00-04:00 UTC next day.
 */
function getEventDatesUTC(event: any): { start: Date; end: Date } {
  const eventDate = event.eventDate || event.event_date;
  const eventEndDate = event.eventEndDate || event.event_end_date;

  let start: Date;
  if (eventDate) {
    start = new Date(eventDate);
  } else {
    start = new Date();
  }

  // Check if time is midnight UTC (no specific time set)
  const hasTime = start.getUTCHours() !== 0 || start.getUTCMinutes() !== 0;

  if (!hasTime) {
    // Default to 19:00 SMA time = 01:00 UTC next day
    const defaultStart = new Date(start);
    defaultStart.setUTCDate(defaultStart.getUTCDate() + 1);
    defaultStart.setUTCHours(1, 0, 0, 0);
    start = defaultStart;
  }

  let end: Date;
  if (eventEndDate) {
    end = new Date(eventEndDate);
  } else if (!hasTime) {
    // Default end: 22:00 SMA time = 04:00 UTC next day
    end = new Date(start);
    end.setUTCHours(4, 0, 0, 0);
  } else {
    // Default end: 3 hours after start
    end = new Date(start.getTime() + 3 * 3600000);
  }

  return { start, end };
}

/**
 * Generate a Google Calendar URL for an event.
 * Users can click this link to add the event to their Google Calendar.
 */
export function generateGoogleCalendarUrl(event: any): string {
  const { start, end } = getEventDatesUTC(event);
  const title = event.title || "Evento";
  const venue = event.venueName || event.venue_name || "";
  const description = event.description || "";
  const location = venue
    ? `${venue}, San Miguel de Allende`
    : "San Miguel de Allende";

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${formatGCalDate(start)}/${formatGCalDate(end)}`,
    location,
    details: description.substring(0, 500),
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Generate .ics file content for iCal / Apple Calendar.
 */
export function generateIcsContent(event: any): string {
  const { start, end } = getEventDatesUTC(event);
  const title = event.title || "Evento";
  const venue = event.venueName || event.venue_name || "";
  const description = event.description || "";
  const location = venue
    ? `${venue}, San Miguel de Allende`
    : "San Miguel de Allende";

  // Escape iCal special characters
  const esc = (s: string) =>
    s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

  const uid = `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 10)}@whatsapplocal.bot`;
  const stamp = formatGCalDate(new Date());

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//WhatsApp Local Bot//SMA Events//EN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${formatGCalDate(start)}`,
    `DTEND:${formatGCalDate(end)}`,
    `SUMMARY:${esc(title)}`,
    `LOCATION:${esc(location)}`,
    `DESCRIPTION:${esc(description.substring(0, 500))}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return lines.join("\r\n");
}

/**
 * Generate a formatted calendar message with Google Calendar link.
 * This is appended to event cards in WhatsApp messages.
 */
export function generateCalendarMessage(event: any, language: "es" | "en"): string {
  const gcalUrl = generateGoogleCalendarUrl(event);
  const isEn = language === "en";
  return isEn
    ? `Add to calendar: ${gcalUrl}`
    : `Agregar al calendario: ${gcalUrl}`;
}
