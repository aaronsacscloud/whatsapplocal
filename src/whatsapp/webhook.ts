import { Router, type Request, type Response } from "express";
import {
  normalizeWebhook,
  verifySignature,
} from "@kapso/whatsapp-cloud-api/server";
import { getConfig } from "../config.js";
import { getLogger } from "../utils/logger.js";
import { routeMessage } from "./router.js";
import {
  isMessageProcessed,
  markMessageProcessed,
} from "../queue/message-queue.js";

interface ParsedMessage {
  from: string;
  body: string;
  messageId: string;
  isForwarded: boolean;
  /** Message type: text, image, audio, etc. */
  type: "text" | "image" | "audio" | "other";
  /** Media ID for image/audio messages (used to download from Meta API) */
  mediaId?: string;
}

/**
 * Parse incoming webhook payload.
 * Handles both Kapso v2 format and raw Meta format.
 */
function parseWebhookPayload(payload: any): ParsedMessage[] {
  const messages: ParsedMessage[] = [];

  // Kapso v2 format: { event, data: { message, contact, ... } }
  if (payload.event && payload.data) {
    const data = payload.data;
    const msg = data.message || data;

    const from =
      msg.from ||
      data.contact?.wa_id ||
      data.contact?.phone ||
      "";
    const messageId = msg.id || msg.message_id || payload.id || "";
    const isForwarded = !!(msg.context?.forwarded || msg.context?.from);

    // Determine message type
    const msgType = msg.type || "text";

    if (msgType === "image" && from && messageId) {
      const mediaId = msg.image?.id || "";
      messages.push({
        from,
        body: msg.image?.caption || "",
        messageId,
        isForwarded,
        type: "image",
        mediaId,
      });
      return messages;
    }

    if (msgType === "audio" && from && messageId) {
      const mediaId = msg.audio?.id || "";
      messages.push({
        from,
        body: "",
        messageId,
        isForwarded,
        type: "audio",
        mediaId,
      });
      return messages;
    }

    // Text messages
    const body =
      msg.text?.body ||
      msg.body ||
      (typeof msg.text === "string" ? msg.text : "") ||
      "";

    if (from && messageId && body) {
      messages.push({ from, body, messageId, isForwarded, type: "text" });
    }
    return messages;
  }

  // Kapso v2 array format: [{ event, data }]
  if (Array.isArray(payload)) {
    for (const item of payload) {
      messages.push(...parseWebhookPayload(item));
    }
    return messages;
  }

  // Meta format: { object: "whatsapp_business_account", entry: [...] }
  if (payload.object === "whatsapp_business_account") {
    const result = normalizeWebhook(payload);
    for (const msg of result.messages) {
      if (!msg.from || !msg.id) continue;

      const isForwarded = !!msg.context?.from;

      // Handle image messages
      if (msg.type === "image") {
        const mediaId = (msg as any).image?.id || "";
        messages.push({
          from: msg.from,
          body: (msg as any).image?.caption || "",
          messageId: msg.id,
          isForwarded,
          type: "image",
          mediaId,
        });
        continue;
      }

      // Handle audio/voice messages
      if (msg.type === "audio") {
        const mediaId = (msg as any).audio?.id || "";
        messages.push({
          from: msg.from,
          body: "",
          messageId: msg.id,
          isForwarded,
          type: "audio",
          mediaId,
        });
        continue;
      }

      // Only process text messages for now; skip other types
      if (msg.type !== "text") continue;

      messages.push({
        from: msg.from,
        body: msg.text?.body ?? "",
        messageId: msg.id,
        isForwarded,
        type: "text",
      });
    }
    return messages;
  }

  return messages;
}

export function createWebhookRouter(): Router {
  const router = Router();

  // Meta verification handshake
  router.get("/webhook", (req: Request, res: Response) => {
    const config = getConfig();
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === config.WEBHOOK_VERIFY_TOKEN) {
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  });

  // Receive messages
  router.post("/webhook", async (req: Request, res: Response) => {
    const logger = getLogger();
    const config = getConfig();

    // Always respond 200 immediately
    res.sendStatus(200);

    try {
      const rawBody = req.body as Buffer;
      const signatureHeader = req.headers["x-hub-signature-256"] as
        | string
        | undefined;

      // Verify signature for Meta webhooks (skip for Kapso proxy)
      if (
        config.META_APP_SECRET !== "skip-in-sandbox-mode" &&
        signatureHeader
      ) {
        const valid = verifySignature({
          rawBody,
          appSecret: config.META_APP_SECRET,
          signatureHeader,
        });
        if (!valid) {
          logger.warn("Invalid webhook signature");
          return;
        }
      }

      const payload = JSON.parse(rawBody.toString());
      const messages = parseWebhookPayload(payload);

      logger.info({ messageCount: messages.length }, "Webhook received");

      for (const message of messages) {
        // Idempotency: skip already-processed messages
        const alreadyProcessed = await isMessageProcessed(message.messageId);
        if (alreadyProcessed) {
          logger.debug(
            { messageId: message.messageId },
            "Duplicate message, skipping"
          );
          continue;
        }

        await markMessageProcessed(message.messageId);

        // Process async
        setImmediate(() => {
          routeMessage(message).catch((error) => {
            logger.error(
              { error, messageId: message.messageId },
              "Message processing failed"
            );
          });
        });
      }
    } catch (error) {
      logger.error({ error }, "Webhook processing error");
    }
  });

  return router;
}
