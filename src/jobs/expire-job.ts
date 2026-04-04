import { expireOldEvents } from "../events/repository.js";
import { cleanupExpiredMessages } from "../queue/message-queue.js";
import { clearOldConversations } from "../conversations/repository.js";
import { getLogger } from "../utils/logger.js";

export async function executeExpireJob(): Promise<void> {
  const logger = getLogger();

  try {
    const expiredEvents = await expireOldEvents();
    const cleanedMessages = await cleanupExpiredMessages();
    const cleanedConversations = await clearOldConversations(24);

    logger.info(
      { expiredEvents, cleanedMessages, cleanedConversations },
      "Expire job completed"
    );
  } catch (error) {
    logger.error({ error }, "Expire job failed");
  }
}
