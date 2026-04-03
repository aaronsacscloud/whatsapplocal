import { getWhatsAppClient, getPhoneNumberId } from "./client.js";
import { getLogger } from "../utils/logger.js";

export async function sendTextMessage(
  to: string,
  text: string
): Promise<void> {
  const logger = getLogger();
  const client = getWhatsAppClient();
  const phoneNumberId = getPhoneNumberId();

  try {
    await client.messages.sendText({
      phoneNumberId,
      to,
      body: text,
    });
    logger.info({ to: to.slice(-4) }, "Message sent");
  } catch (error) {
    logger.error({ error, to: to.slice(-4) }, "Failed to send message");
    throw error;
  }
}
