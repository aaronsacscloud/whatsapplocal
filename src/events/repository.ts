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
          })
          .where(eq(events.id, current.id))
          .returning();
        return updated;
      }
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
}

export async function searchEvents(filters: SearchFilters): Promise<Event[]> {
  const db = getDb();

  // Build raw SQL for reliable date handling with postgres-js
  const conditions: string[] = [`city = '${filters.city.replace(/'/g, "''")}'`];

  if (filters.neighborhood) {
    conditions.push(`neighborhood ILIKE '%${filters.neighborhood.replace(/'/g, "''")}%'`);
  }

  if (filters.category) {
    conditions.push(`category = '${filters.category}'`);
  }

  if (filters.dateFrom) {
    conditions.push(`(event_date >= '${filters.dateFrom.toISOString()}'::timestamptz OR event_date IS NULL)`);
  }

  if (filters.dateTo) {
    conditions.push(`(event_date <= '${filters.dateTo.toISOString()}'::timestamptz OR event_date IS NULL)`);
  }

  if (filters.query) {
    const q = filters.query.replace(/'/g, "''");
    conditions.push(`(title ILIKE '%${q}%' OR description ILIKE '%${q}%')`);
  }

  if (!filters.dateFrom && !filters.dateTo) {
    conditions.push(`(expires_at IS NULL OR expires_at > NOW())`);
  }

  const where = conditions.join(" AND ");
  const limit = filters.limit ?? 10;

  const result = await db.execute(
    sql.raw(`SELECT * FROM events WHERE ${where} ORDER BY event_date DESC NULLS LAST LIMIT ${limit}`)
  );

  return result as unknown as Event[];
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
