import { eq, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { sources, type Source } from "../db/schema.js";
import { getLogger } from "../utils/logger.js";

const SUCCESS_RATE_THRESHOLD = 0.8;
const MAX_CONSECUTIVE_FAILURES = 3;

export async function recordScrapeSuccess(sourceId: string): Promise<void> {
  const db = getDb();
  await db
    .update(sources)
    .set({
      lastScrapedAt: new Date(),
      successRate: sql`LEAST(1.0, ${sources.successRate} * 0.9 + 0.1)`,
    })
    .where(eq(sources.id, sourceId));
}

export async function recordScrapeFailure(sourceId: string): Promise<void> {
  const db = getDb();
  const logger = getLogger();

  await db
    .update(sources)
    .set({
      successRate: sql`GREATEST(0.0, ${sources.successRate} * 0.9)`,
    })
    .where(eq(sources.id, sourceId));

  // Check if we should deactivate
  const [source] = await db
    .select()
    .from(sources)
    .where(eq(sources.id, sourceId))
    .limit(1);

  if (source && (source.successRate ?? 1) < SUCCESS_RATE_THRESHOLD) {
    logger.warn(
      { sourceId, name: source.name, successRate: source.successRate },
      "Source health below threshold"
    );
  }

  if (source && (source.successRate ?? 1) < 0.1) {
    await db
      .update(sources)
      .set({ isActive: false })
      .where(eq(sources.id, sourceId));

    logger.error(
      { sourceId, name: source.name },
      "Source deactivated due to repeated failures"
    );
  }
}

export async function getActiveSources(): Promise<Source[]> {
  const db = getDb();
  return db
    .select()
    .from(sources)
    .where(eq(sources.isActive, true));
}

export async function getSourceHealth(): Promise<
  Array<{ name: string; successRate: number | null; isActive: boolean | null }>
> {
  const db = getDb();
  return db
    .select({
      name: sources.name,
      successRate: sources.successRate,
      isActive: sources.isActive,
    })
    .from(sources);
}
