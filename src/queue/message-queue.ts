import { eq, lte, and } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { processedMessages, messageQueue } from "../db/schema.js";
import { getLogger } from "../utils/logger.js";

export async function isMessageProcessed(messageId: string): Promise<boolean> {
  const db = getDb();
  const [found] = await db
    .select()
    .from(processedMessages)
    .where(eq(processedMessages.messageId, messageId))
    .limit(1);

  return !!found;
}

export async function markMessageProcessed(messageId: string): Promise<void> {
  const db = getDb();
  await db
    .insert(processedMessages)
    .values({ messageId })
    .onConflictDoNothing();
}

export async function enqueueMessage(
  phoneHash: string,
  messageBody: string,
  messageId: string
): Promise<void> {
  const db = getDb();
  const nextRetry = new Date(Date.now() + 1000); // 1 second initial delay

  await db.insert(messageQueue).values({
    phoneHash,
    messageBody,
    messageId,
    nextRetryAt: nextRetry,
  });
}

export interface QueuedMessage {
  id: string;
  phoneHash: string;
  messageBody: string;
  messageId: string;
  attempts: number;
}

export async function dequeueMessages(limit = 10): Promise<QueuedMessage[]> {
  const db = getDb();
  const now = new Date();

  const messages = await db
    .select()
    .from(messageQueue)
    .where(
      and(
        eq(messageQueue.status, "pending"),
        lte(messageQueue.nextRetryAt, now)
      )
    )
    .limit(limit);

  return messages.map((m) => ({
    id: m.id,
    phoneHash: m.phoneHash,
    messageBody: m.messageBody,
    messageId: m.messageId,
    attempts: m.attempts ?? 0,
  }));
}

export async function markMessageCompleted(id: string): Promise<void> {
  const db = getDb();
  await db
    .update(messageQueue)
    .set({ status: "completed" })
    .where(eq(messageQueue.id, id));
}

export async function markMessageFailed(
  id: string,
  attempts: number
): Promise<void> {
  const db = getDb();
  const maxRetries = 3;

  if (attempts >= maxRetries) {
    await db
      .update(messageQueue)
      .set({ status: "failed", attempts })
      .where(eq(messageQueue.id, id));
    return;
  }

  const delay = Math.min(1000 * Math.pow(2, attempts), 30000);
  const nextRetry = new Date(Date.now() + delay);

  await db
    .update(messageQueue)
    .set({ attempts, nextRetryAt: nextRetry })
    .where(eq(messageQueue.id, id));
}

export async function cleanupExpiredMessages(): Promise<number> {
  const db = getDb();
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const deleted = await db
    .delete(processedMessages)
    .where(lte(processedMessages.processedAt, oneHourAgo))
    .returning({ id: processedMessages.id });

  return deleted.length;
}
