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

    // Always respond 200 immediately (WhatsApp retries after 20s)
    res.sendStatus(200);

    try {
      const rawBody = req.body as Buffer;
      const signatureHeader = req.headers["x-hub-signature-256"] as
        | string
        | undefined;

      // Verify signature (skip in sandbox mode where Kapso handles verification)
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
      const result = normalizeWebhook(payload);

      for (const message of result.messages) {
        if (!message.from || !message.id) continue;
        if (message.type !== "text") continue;

        // Idempotency: skip already-processed messages
        const alreadyProcessed = await isMessageProcessed(message.id);
        if (alreadyProcessed) {
          logger.debug(
            { messageId: message.id },
            "Duplicate message, skipping"
          );
          continue;
        }

        await markMessageProcessed(message.id);

        const isForwarded = !!message.context?.from;

        // Process async to not block webhook response
        setImmediate(() => {
          routeMessage({
            from: message.from!,
            body: message.text?.body ?? "",
            messageId: message.id,
            isForwarded,
          }).catch((error) => {
            logger.error(
              { error, messageId: message.id },
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
