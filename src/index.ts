import express from "express";
import { loadConfig } from "./config.js";
import { getLogger } from "./utils/logger.js";
import { createWebhookRouter } from "./whatsapp/webhook.js";
import { createAdminRouter } from "./admin/routes.js";
import { startScheduler } from "./jobs/scheduler.js";

const config = loadConfig();
const logger = getLogger();
const app = express();

// Health check (before raw body parser)
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Debug endpoint - tests DB + LLM connectivity
app.get("/debug", async (_req, res) => {
  const results: Record<string, string> = {};
  try {
    const { getDb } = await import("./db/index.js");
    const db = getDb();
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`SELECT 1`);
    results.db = "OK";
  } catch (e: any) {
    results.db = `FAIL: ${e.message?.substring(0, 100)}`;
  }
  try {
    const { getLLMClient } = await import("./llm/client.js");
    const client = getLLMClient();
    const r = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 10,
      messages: [{ role: "user", content: "Say OK" }],
    });
    results.llm = `OK: ${r.content[0].type === "text" ? r.content[0].text : ""}`;
  } catch (e: any) {
    results.llm = `FAIL: ${e.message?.substring(0, 100)}`;
  }
  try {
    const { getWhatsAppClient, getPhoneNumberId } = await import("./whatsapp/client.js");
    const client = getWhatsAppClient();
    results.whatsapp = `Client initialized, phoneId: ${getPhoneNumberId()}`;
  } catch (e: any) {
    results.whatsapp = `FAIL: ${e.message?.substring(0, 100)}`;
  }
  results.env = config.NODE_ENV;
  results.city = config.DEFAULT_CITY;
  res.json(results);
});

// Mount admin dashboard (before raw body parser for webhook)
app.use(createAdminRouter());

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
// Build: 20260403205046
