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
  const conditions = [eq(events.city, filters.city)];

  if (filters.neighborhood) {
    conditions.push(ilike(events.neighborhood, `%${filters.neighborhood}%`));
  }

  if (filters.category) {
    conditions.push(eq(events.category, filters.category as any));
  }

  if (filters.dateFrom) {
    conditions.push(gte(events.eventDate, filters.dateFrom));
  }

  if (filters.dateTo) {
    conditions.push(lte(events.eventDate, filters.dateTo));
  }

  if (filters.query) {
    conditions.push(
      sql`(${events.title} ILIKE ${"%" + filters.query + "%"} OR ${events.description} ILIKE ${"%" + filters.query + "%"})`
    );
  }

  // Exclude expired events
  conditions.push(
    sql`(${events.expiresAt} IS NULL OR ${events.expiresAt} > NOW())`
  );

  return db
    .select()
    .from(events)
    .where(and(...conditions))
    .orderBy(desc(events.eventDate))
    .limit(filters.limit ?? 10);
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
