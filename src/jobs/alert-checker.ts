import { eq, and, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { userAlerts, alertNotifications, events } from "../db/schema.js";
import { getLogger } from "../utils/logger.js";
import { trackQuery } from "../analytics/tracker.js";
import { updateJobState, shouldRunJob } from "./scheduler.js";
import type { Event, UserAlert } from "../db/schema.js";

const JOB_NAME = "alert-checker";
const MIN_INTERVAL_MS = 1.5 * 60 * 60 * 1000; // 1.5 hours minimum

// SMA timezone offset: UTC-6 (CST)
const SMA_TZ_OFFSET = -6;

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

interface AlertWithEvents {
  alert: UserAlert;
  newEvents: Event[];
}

async function getActiveAlerts(): Promise<UserAlert[]> {
  const db = getDb();
  const result = await db
    .select()
    .from(userAlerts)
    .where(eq(userAlerts.active, true));
  return result;
}

async function findNewEventsForAlert(alert: UserAlert): Promise<Event[]> {
  const db = getDb();

  // Look for events in the next 7 days matching the alert category
  // that haven't been notified for this alert yet
  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const category = alert.category.replace(/'/g, "''");
  const alertId = alert.id.replace(/'/g, "''");

  const result = await db.execute(
    sql.raw(
      `SELECT e.* FROM events e
       WHERE e.category = '${category}'
         AND e.city = 'San Miguel de Allende'
         AND (e.event_date >= '${now.toISOString()}'::timestamptz OR e.event_date IS NULL)
         AND (e.event_date <= '${weekFromNow.toISOString()}'::timestamptz OR e.event_date IS NULL)
         AND e.id NOT IN (
           SELECT an.event_id FROM alert_notifications an WHERE an.alert_id = '${alertId}'
         )
       ORDER BY e.event_date ASC NULLS LAST
       LIMIT 5`
    )
  );

  return result as unknown as Event[];
}

async function markEventsNotified(
  alertId: string,
  eventIds: string[]
): Promise<void> {
  const db = getDb();

  for (const eventId of eventIds) {
    try {
      await db.insert(alertNotifications).values({
        alertId,
        eventId,
      });
    } catch {
      // Ignore duplicate constraint violations
    }
  }
}

function formatAlertMessage(
  alert: UserAlert,
  newEvents: Event[],
  language: "es" | "en"
): string {
  const isEn = language === "en";
  const emoji = getCategoryEmoji(alert.category);

  const header = isEn
    ? `${emoji} New ${alert.category} events found!`
    : `${emoji} Nuevos eventos de ${alert.category} encontrados!`;

  const eventLines = newEvents.map((e) => {
    const title = (e as any).title || "";
    const venue = (e as any).venueName || (e as any).venue_name || "";
    const eventDate = (e as any).eventDate || (e as any).event_date;

    let dateStr = "";
    if (eventDate) {
      const d = new Date(eventDate);
      const smaDate = new Date(d.getTime() + SMA_TZ_OFFSET * 3600000);
      dateStr = smaDate.toLocaleDateString(isEn ? "en-US" : "es-MX", {
        weekday: "short",
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      });
      const hasTime = d.getUTCHours() !== 0 || d.getUTCMinutes() !== 0;
      if (hasTime) {
        const timeStr = smaDate.toLocaleTimeString(isEn ? "en-US" : "es-MX", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
          timeZone: "UTC",
        });
        dateStr += ` — ${timeStr}`;
      }
    }

    const parts = [`*${title}*`];
    if (venue) parts.push(`  ${venue}`);
    if (dateStr) parts.push(`  ${dateStr}`);

    const sourceUrl = (e as any).sourceUrl || (e as any).source_url;
    if (sourceUrl) parts.push(`  ${sourceUrl}`);

    return parts.join("\n");
  });

  const footer = isEn
    ? "\nAsk me for more details!"
    : "\nPreguntame por mas detalles!";

  return `${header}\n\n${eventLines.join("\n\n")}${footer}`;
}

export async function executeAlertChecker(): Promise<void> {
  const logger = getLogger();

  const canRun = await shouldRunJob(JOB_NAME, MIN_INTERVAL_MS);
  if (!canRun) {
    logger.debug("Alert checker skipped: too soon since last run");
    return;
  }

  logger.info("Alert checker job starting");

  try {
    await updateJobState(JOB_NAME, "running");

    const alerts = await getActiveAlerts();

    if (alerts.length === 0) {
      logger.info("Alert checker: no active alerts");
      await updateJobState(JOB_NAME, "idle");
      return;
    }

    let notified = 0;
    let checked = 0;

    for (const alert of alerts) {
      checked++;

      try {
        const newEvents = await findNewEventsForAlert(alert);

        if (newEvents.length === 0) continue;

        // Mark events as notified (regardless of whether we can send,
        // to prevent re-checking the same events)
        const eventIds = newEvents.map(
          (e) => (e as any).id || (e as any).id
        );
        await markEventsNotified(alert.id, eventIds);

        // Track the alert notification
        trackQuery({
          phoneHash: alert.phoneHash,
          intent: "alert_notification",
          category: alert.category,
          resultsCount: newEvents.length,
        });

        notified++;

        logger.info(
          {
            alertId: alert.id,
            phoneHash: alert.phoneHash.slice(0, 8),
            category: alert.category,
            newEvents: newEvents.length,
          },
          "Alert triggered"
        );
      } catch (error) {
        logger.error(
          { error, alertId: alert.id },
          "Failed to check alert"
        );
      }
    }

    await updateJobState(JOB_NAME, "idle");
    logger.info(
      { checked, notified },
      "Alert checker completed"
    );
  } catch (error) {
    await updateJobState(JOB_NAME, "error");
    logger.error({ error }, "Alert checker job failed");
  }
}

// Export for tests
export { formatAlertMessage, findNewEventsForAlert };
