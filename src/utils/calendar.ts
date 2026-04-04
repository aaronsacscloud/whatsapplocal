/**
 * ICS calendar file generator.
 * Produces valid iCalendar (.ics) content for events.
 */

export interface CalendarEvent {
  title: string;
  date: Date;
  endDate?: Date;
  venue?: string;
  description?: string;
  url?: string;
}

/**
 * Pad a number to 2 digits.
 */
function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

/**
 * Format a Date as an iCalendar DTSTART/DTEND value (UTC).
 * Format: YYYYMMDDTHHMMSSZ
 */
function formatICSDate(d: Date): string {
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
 * Escape special characters in iCalendar text fields.
 */
function escapeICS(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

/**
 * Generate a unique UID for the calendar event.
 */
function generateUID(): string {
  const random = Math.random().toString(36).substring(2, 15);
  const timestamp = Date.now().toString(36);
  return `${timestamp}-${random}@whatsapplocal.bot`;
}

/**
 * Generate a valid .ics file content string for an event.
 */
export function generateICS(event: CalendarEvent): string {
  const uid = generateUID();
  const now = new Date();
  const dtStart = formatICSDate(event.date);

  // Default end date: 2 hours after start if not provided
  const endDate = event.endDate ?? new Date(event.date.getTime() + 2 * 60 * 60 * 1000);
  const dtEnd = formatICSDate(endDate);

  const dtStamp = formatICSDate(now);

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//WhatsApp Local Bot//SMA Events//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeICS(event.title)}`,
  ];

  if (event.venue) {
    lines.push(`LOCATION:${escapeICS(event.venue + ", San Miguel de Allende")}`);
  }

  if (event.description) {
    lines.push(`DESCRIPTION:${escapeICS(event.description)}`);
  }

  if (event.url) {
    lines.push(`URL:${event.url}`);
  }

  lines.push("END:VEVENT");
  lines.push("END:VCALENDAR");

  return lines.join("\r\n");
}

/**
 * Convert ICS content to a base64 data URI that can be used as a document URL.
 */
export function icsToDataUri(icsContent: string): string {
  const base64 = Buffer.from(icsContent, "utf-8").toString("base64");
  return `data:text/calendar;base64,${base64}`;
}
