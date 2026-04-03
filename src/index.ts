import express from "express";
import { loadConfig } from "./config.js";
import { getLogger } from "./utils/logger.js";
import { createWebhookRouter } from "./whatsapp/webhook.js";
import { startScheduler } from "./jobs/scheduler.js";

const config = loadConfig();
const logger = getLogger();
const app = express();

// Health check (before raw body parser)
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Raw body parser for webhook signature verification
app.use("/webhook", express.raw({ type: "application/json" }));

// Mount webhook routes
app.use(createWebhookRouter());

// Start server
app.listen(config.PORT, () => {
  logger.info(
    { port: config.PORT, city: config.DEFAULT_CITY, env: config.NODE_ENV },
    "WhatsApp Local server started"
  );

  // Start cron jobs
  if (config.NODE_ENV !== "test") {
    startScheduler();
  }
});

export { app };
