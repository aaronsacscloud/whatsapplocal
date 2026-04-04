import { eq, desc, lte, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { conversations } from "../db/schema.js";
import { getLogger } from "../utils/logger.js";

export async function saveMessage(
  phoneHash: string,
  role: "user" | "assistant",
  content: string,
  intent?: string
): Promise<void> {
  const db = getDb();
  const logger = getLogger();

  try {
    await db.insert(conversations).values({
      phoneHash,
      role,
      content,
      intent,
    });
  } catch (error) {
    logger.error({ error }, "Failed to save conversation message");
  }
}

export async function getRecentMessages(
  phoneHash: string,
  limit = 10
): Promise<Array<{ role: string; content: string; created_at: Date }>> {
  const db = getDb();
  const logger = getLogger();

  try {
    const messages = await db
      .select({
        role: conversations.role,
        content: conversations.content,
        created_at: conversations.createdAt,
      })
      .from(conversations)
      .where(eq(conversations.phoneHash, phoneHash))
      .orderBy(desc(conversations.createdAt))
      .limit(limit);

    // Return in chronological order (oldest first)
    return messages.reverse() as Array<{
      role: string;
      content: string;
      created_at: Date;
    }>;
  } catch (error) {
    logger.error({ error }, "Failed to get recent messages");
    return [];
  }
}

export async function clearOldConversations(
  olderThanHours = 24
): Promise<number> {
  const db = getDb();
  const logger = getLogger();

  try {
    const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);

    const deleted = await db
      .delete(conversations)
      .where(lte(conversations.createdAt, cutoff))
      .returning({ id: conversations.id });

    return deleted.length;
  } catch (error) {
    logger.error({ error }, "Failed to clear old conversations");
    return 0;
  }
}
