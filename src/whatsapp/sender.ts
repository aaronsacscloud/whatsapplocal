import { getWhatsAppClient, getPhoneNumberId } from "./client.js";
import { getConfig } from "../config.js";
import { getLogger } from "../utils/logger.js";

/**
 * Send an image with optional caption via Kapso MCP
 */
export async function sendImageMessage(
  to: string,
  imageUrl: string,
  caption?: string
): Promise<void> {
  const logger = getLogger();
  const config = getConfig();

  if (!config.KAPSO_API_KEY) {
    logger.warn("Cannot send image: no Kapso API key");
    return;
  }

  try {
    const response = await fetch("https://app.kapso.ai/mcp", {
      method: "POST",
      headers: {
        "X-API-Key": config.KAPSO_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          name: "whatsapp_send_media",
          arguments: {
            conversation_selector: { phone_number: to },
            message_type: "image",
            file_url: imageUrl,
            caption: caption || "",
          },
        },
        id: Date.now(),
      }),
    });

    const result = (await response.json()) as any;
    if (result.error) {
      logger.warn({ error: result.error }, "Kapso image send failed, skipping image");
    } else {
      logger.info({ to: to.slice(-4) }, "Image sent");
    }
  } catch (error) {
    logger.warn({ error }, "Image send failed, skipping");
  }
}

export async function sendTextMessage(
  to: string,
  text: string
): Promise<void> {
  const logger = getLogger();
  const config = getConfig();

  // Try Kapso MCP API first (works with sandbox), fall back to WhatsApp Cloud API
  if (config.KAPSO_API_KEY) {
    try {
      const response = await fetch("https://app.kapso.ai/mcp", {
        method: "POST",
        headers: {
          "X-API-Key": config.KAPSO_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "tools/call",
          params: {
            name: "whatsapp_send_text_message",
            arguments: {
              conversation_selector: { phone_number: to },
              content: text,
            },
          },
          id: Date.now(),
        }),
      });

      const result = await response.json();
      if (result.error) {
        throw new Error(result.error.message || "Kapso MCP error");
      }

      logger.info({ to: to.slice(-4), via: "kapso" }, "Message sent");
      return;
    } catch (error) {
      logger.warn(
        { error, to: to.slice(-4) },
        "Kapso send failed, trying WhatsApp Cloud API"
      );
    }
  }

  // Fallback: direct WhatsApp Cloud API
  try {
    const client = getWhatsAppClient();
    const phoneNumberId = getPhoneNumberId();
    await client.messages.sendText({
      phoneNumberId,
      to,
      body: text,
    });
    logger.info({ to: to.slice(-4), via: "meta" }, "Message sent");
  } catch (error) {
    logger.error({ error, to: to.slice(-4) }, "Failed to send message");
    throw error;
  }
}
