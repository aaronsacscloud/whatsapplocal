import { getWhatsAppClient, getPhoneNumberId } from "./client.js";
import { getConfig } from "../config.js";
import { getLogger } from "../utils/logger.js";

/**
 * Helper to call Kapso MCP API.
 */
async function callKapsoMCP(
  toolName: string,
  args: Record<string, unknown>
): Promise<any> {
  const config = getConfig();
  if (!config.KAPSO_API_KEY) {
    throw new Error("No Kapso API key configured");
  }

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
        name: toolName,
        arguments: args,
      },
      id: Date.now(),
    }),
  });

  const result = (await response.json()) as any;
  if (result.error) {
    throw new Error(result.error.message || `Kapso MCP error for ${toolName}`);
  }
  return result;
}

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
    await callKapsoMCP("whatsapp_send_media", {
      conversation_selector: { phone_number: to },
      message_type: "image",
      file_url: imageUrl,
      caption: caption || "",
    });
    logger.info({ to: to.slice(-4) }, "Image sent");
  } catch (error) {
    logger.warn({ error }, "Image send failed, skipping");
  }
}

/**
 * Send interactive button message via Kapso MCP.
 * Max 3 buttons per message, each with id + title (max 20 chars).
 */
export async function sendInteractiveButtons(
  to: string,
  body: string,
  buttons: Array<{ id: string; title: string }>
): Promise<void> {
  const logger = getLogger();
  const config = getConfig();

  // WhatsApp enforces max 3 buttons
  const trimmedButtons = buttons.slice(0, 3).map((b) => ({
    id: b.id,
    title: b.title.substring(0, 20),
  }));

  if (config.KAPSO_API_KEY) {
    try {
      await callKapsoMCP("whatsapp_send_interactive", {
        conversation_selector: { phone_number: to },
        interactive_type: "button",
        body_text: body,
        buttons: trimmedButtons.map((b) => ({
          type: "reply",
          reply: { id: b.id, title: b.title },
        })),
      });
      logger.info({ to: to.slice(-4), via: "kapso" }, "Interactive buttons sent");
      return;
    } catch (error) {
      logger.warn(
        { error, to: to.slice(-4) },
        "Kapso interactive send failed, falling back to text"
      );
    }
  }

  // Fallback: send as numbered text list
  const fallbackLines = [body, ""];
  trimmedButtons.forEach((b, i) => {
    fallbackLines.push(`${i + 1}. ${b.title}`);
  });
  await sendTextMessage(to, fallbackLines.join("\n"));
}

/**
 * Send interactive list message via Kapso MCP.
 * Lists support sections with rows (id + title + optional description).
 */
export async function sendInteractiveList(
  to: string,
  body: string,
  buttonText: string,
  sections: Array<{
    title: string;
    rows: Array<{ id: string; title: string; description?: string }>;
  }>
): Promise<void> {
  const logger = getLogger();
  const config = getConfig();

  if (config.KAPSO_API_KEY) {
    try {
      await callKapsoMCP("whatsapp_send_interactive", {
        conversation_selector: { phone_number: to },
        interactive_type: "list",
        body_text: body,
        button_text: buttonText,
        sections: sections.map((s) => ({
          title: s.title.substring(0, 24),
          rows: s.rows.map((r) => ({
            id: r.id,
            title: r.title.substring(0, 24),
            description: r.description?.substring(0, 72) || "",
          })),
        })),
      });
      logger.info({ to: to.slice(-4), via: "kapso" }, "Interactive list sent");
      return;
    } catch (error) {
      logger.warn(
        { error, to: to.slice(-4) },
        "Kapso interactive list send failed, falling back to text"
      );
    }
  }

  // Fallback: send as numbered text
  const fallbackLines = [body, ""];
  let idx = 1;
  for (const section of sections) {
    fallbackLines.push(`*${section.title}*`);
    for (const row of section.rows) {
      fallbackLines.push(`${idx}. ${row.title}${row.description ? ` — ${row.description}` : ""}`);
      idx++;
    }
    fallbackLines.push("");
  }
  await sendTextMessage(to, fallbackLines.join("\n"));
}

/**
 * Send a document message via Kapso MCP (used for .ics calendar files).
 */
export async function sendDocumentMessage(
  to: string,
  documentUrl: string,
  filename: string,
  caption?: string
): Promise<void> {
  const logger = getLogger();
  const config = getConfig();

  if (!config.KAPSO_API_KEY) {
    logger.warn("Cannot send document: no Kapso API key");
    return;
  }

  try {
    await callKapsoMCP("whatsapp_send_media", {
      conversation_selector: { phone_number: to },
      message_type: "document",
      file_url: documentUrl,
      filename,
      caption: caption || "",
    });
    logger.info({ to: to.slice(-4) }, "Document sent");
  } catch (error) {
    logger.warn({ error }, "Document send failed, skipping");
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
      await callKapsoMCP("whatsapp_send_text_message", {
        conversation_selector: { phone_number: to },
        content: text,
      });
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
