import { eq, and, gte, lte, ilike, sql, desc } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { events, type NewEvent, type Event } from "../db/schema.js";

export async function insertEvent(event: NewEvent): Promise<Event> {
  const db = getDb();
  const [inserted] = await db.insert(events).values(event).returning();
  return inserted;
}

export async function upsertEvent(event: NewEvent): Promise<Event> {
  const db = getDb();

  if (event.dedupHash) {
    const existing = await db
      .select()
      .from(events)
      .where(eq(events.dedupHash, event.dedupHash))
      .limit(1);

    if (existing.length > 0) {
      const current = existing[0];
      if ((event.confidence ?? 0) > (current.confidence ?? 0)) {
        const [updated] = await db
          .update(events)
          .set({
            title: event.title,
            description: event.description,
            confidence: event.confidence,
            rawContent: event.rawContent,
            scrapedAt: new Date(),
          })
          .where(eq(events.id, current.id))
          .returning();
        return updated;
      }
      // Even if not updating, refresh scraped_at to mark as "seen again"
      await db
        .update(events)
        .set({ scrapedAt: new Date() })
        .where(eq(events.id, current.id));
      return current;
    }
  }

  return insertEvent(event);
}

export interface SearchFilters {
  city: string;
  neighborhood?: string;
  category?: string;
  dateFrom?: Date;
  dateTo?: Date;
  query?: string;
  limit?: number;
  contentType?: string; // 'event' | 'recurring' | 'workshop' | 'activity' | 'post' | 'all'
}

/**
 * Search events including regular events, recurring events for the day of week,
 * and active workshops that overlap the date range.
 */
export async function searchEvents(filters: SearchFilters): Promise<Event[]> {
  const db = getDb();

  const city = filters.city.replace(/'/g, "''");
  const contentType = filters.contentType || "event";
  const limit = filters.limit ?? 10;

  // Shared conditions for neighborhood, category, query
  const sharedConditions: string[] = [];

  if (filters.neighborhood) {
    sharedConditions.push(`neighborhood ILIKE '%${filters.neighborhood.replace(/'/g, "''")}%'`);
  }

  if (filters.category) {
    sharedConditions.push(`category = '${filters.category.replace(/'/g, "''")}'`);
  }

  if (filters.query) {
    const q = filters.query.replace(/'/g, "''");
    sharedConditions.push(`(title ILIKE '%${q}%' OR description ILIKE '%${q}%')`);
  }

  const sharedWhere = sharedConditions.length > 0 ? " AND " + sharedConditions.join(" AND ") : "";

  // If we have date filters, build a combined query that includes recurring + workshop
  if (filters.dateFrom && filters.dateTo && (contentType === "event" || contentType === "all")) {
    const dateFromISO = filters.dateFrom.toISOString();
    const dateToISO = filters.dateTo.toISOString();

    // Calculate the day(s) of week in the date range for recurring event matching
    const dayOfWeekConditions = getDaysOfWeekInRange(filters.dateFrom, filters.dateTo);

    const typeClauses: string[] = [];

    // 1. Regular events where event_date falls in range
    typeClauses.push(
      `(content_type = 'event' AND event_date >= '${dateFromISO}'::timestamptz AND event_date < '${dateToISO}'::timestamptz)`
    );

    // Also include events with NULL content_type (legacy data)
    typeClauses.push(
      `(content_type IS NULL AND event_date >= '${dateFromISO}'::timestamptz AND event_date < '${dateToISO}'::timestamptz)`
    );

    // 2. Recurring events where recurrence_day matches any day in the range
    if (dayOfWeekConditions.length > 0) {
      const dayList = dayOfWeekConditions.join(", ");
      typeClauses.push(
        `(content_type = 'recurring' AND recurrence_day IN (${dayList}) AND (recurrence_end_date IS NULL OR recurrence_end_date > NOW()))`
      );
    }

    // 3. Active workshops that overlap the date range
    typeClauses.push(
      `(content_type = 'workshop' AND workshop_start_date <= '${dateToISO}'::timestamptz AND workshop_end_date >= '${dateFromISO}'::timestamptz)`
    );

    // If contentType is 'all', also include activities and posts
    if (contentType === "all") {
      typeClauses.push(
        `(content_type = 'activity')`
      );
    }

    const where = `city = '${city}' AND (${typeClauses.join(" OR ")})${sharedWhere}`;

    const result = await db.execute(
      sql.raw(
        `SELECT * FROM events WHERE ${where}
         ORDER BY
           COALESCE(freshness_score, 0.5) * COALESCE(confidence, 0.5) DESC,
           CASE content_type
             WHEN 'event' THEN event_date
             WHEN 'recurring' THEN ('2000-01-01 ' || COALESCE(recurrence_time, '23:59'))::timestamp
             WHEN 'workshop' THEN workshop_start_date
             ELSE event_date
           END ASC NULLS LAST
         LIMIT ${limit}`
      )
    );

    return result as unknown as Event[];
  }

  // Non-date or specific content_type queries: use the original logic
  const conditions: string[] = [`city = '${city}'`];

  if (contentType !== "all") {
    conditions.push(`(content_type = '${contentType.replace(/'/g, "''")}' OR content_type IS NULL)`);
  }

  if (filters.dateFrom) {
    conditions.push(`event_date >= '${filters.dateFrom.toISOString()}'::timestamptz`);
  }

  if (filters.dateTo) {
    conditions.push(`event_date <= '${filters.dateTo.toISOString()}'::timestamptz`);
  }

  if (!filters.dateFrom && !filters.dateTo) {
    conditions.push(`(expires_at IS NULL OR expires_at > NOW())`);
  }

  const where = conditions.join(" AND ") + sharedWhere;

  const result = await db.execute(
    sql.raw(`SELECT * FROM events WHERE ${where} ORDER BY COALESCE(freshness_score, 0.5) * COALESCE(confidence, 0.5) DESC, event_date ASC NULLS LAST LIMIT ${limit}`)
  );

  return result as unknown as Event[];
}

/**
 * Get all unique days of the week (0-6) that fall within the given date range.
 * 0=Sunday, 1=Monday... 6=Saturday (matches JS Date.getDay() / PostgreSQL EXTRACT(DOW))
 */
function getDaysOfWeekInRange(from: Date, to: Date): number[] {
  const days = new Set<number>();
  const current = new Date(from);

  // Limit to 7 iterations max (a full week covers all days)
  let iterations = 0;
  while (current <= to && iterations < 7) {
    days.add(current.getUTCDay());
    current.setUTCDate(current.getUTCDate() + 1);
    iterations++;
  }

  return Array.from(days);
}

export async function expireOldEvents(): Promise<number> {
  const db = getDb();
  const result = await db
    .delete(events)
    .where(
      and(
        sql`${events.expiresAt} IS NOT NULL`,
        lte(events.expiresAt, new Date())
      )
    )
    .returning({ id: events.id });

  return result.length;
}

export async function countEventsForDate(
  city: string,
  dateStart: Date,
  dateEnd: Date
): Promise<number> {
  const db = getDb();
  const result = await db.execute(
    sql.raw(
      `SELECT COUNT(*) as cnt FROM events
       WHERE city = '${city.replace(/'/g, "''")}'
         AND (
           (content_type = 'event' AND event_date >= '${dateStart.toISOString()}'::timestamptz AND event_date < '${dateEnd.toISOString()}'::timestamptz)
           OR (content_type = 'recurring' AND recurrence_day = ${dateStart.getUTCDay()} AND (recurrence_end_date IS NULL OR recurrence_end_date > NOW()))
           OR (content_type = 'workshop' AND workshop_start_date <= '${dateEnd.toISOString()}'::timestamptz AND workshop_end_date >= '${dateStart.toISOString()}'::timestamptz)
         )`
    )
  );
  const rows = result as unknown as Array<{ cnt: string }>;
  return parseInt(rows[0]?.cnt || "0", 10);
}

export async function deleteEventsOlderThan(cutoffDate: Date): Promise<number> {
  const db = getDb();
  // Only delete regular events with old dates; recurring events and workshops have their own expiry
  const result = await db
    .delete(events)
    .where(
      and(
        sql`${events.contentType} = 'event'`,
        sql`${events.eventDate} IS NOT NULL`,
        lte(events.eventDate, cutoffDate)
      )
    )
    .returning({ id: events.id });
  return result.length;
}

export async function findByDedupHash(
  hash: string
): Promise<Event | undefined> {
  const db = getDb();
  const [found] = await db
    .select()
    .from(events)
    .where(eq(events.dedupHash, hash))
    .limit(1);

  return found;
}
