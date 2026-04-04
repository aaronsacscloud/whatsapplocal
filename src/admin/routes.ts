import { Router, json } from "express";
import { eq, desc, sql, and, gte, lte, lt, count, asc } from "drizzle-orm";
import { getDb } from "../db/index.js";
import {
  sources,
  events,
  users,
  analytics,
  conversations,
  userAlerts,
  alertNotifications,
  scrapeLogs,
} from "../db/schema.js";
import { getDashboardHTML } from "./dashboard.js";
import { getQRPageHTML } from "./qr.js";
import { runScrapeAll } from "../scraper/manager.js";
import { countStaleEvents } from "../scraper/freshness.js";
import { getConfig } from "../config.js";
import { getLogger } from "../utils/logger.js";

export function createAdminRouter(): Router {
  const router = Router();

  // JSON body parsing for admin API routes only
  router.use("/admin/api", json());

  // Serve dashboard HTML
  router.get("/admin", (_req, res) => {
    res.type("html").send(getDashboardHTML());
  });

  // ─── Overview Stats ──────────────────────────────────────────

  router.get("/admin/api/stats", async (_req, res) => {
    try {
      const db = getDb();

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - 7);
      weekStart.setHours(0, 0, 0, 0);

      const [eventCountResult] = await db
        .select({ value: count() })
        .from(events);

      const [activeSourcesResult] = await db
        .select({ value: count() })
        .from(sources)
        .where(eq(sources.isActive, true));

      const [usersCountResult] = await db
        .select({ value: count() })
        .from(users);

      const [eventsTodayResult] = await db
        .select({ value: count() })
        .from(events)
        .where(
          and(
            gte(events.eventDate, todayStart),
            lte(events.eventDate, todayEnd)
          )
        );

      const [eventsWeekResult] = await db
        .select({ value: count() })
        .from(events)
        .where(gte(events.eventDate, weekStart));

      const [activeTodayResult] = await db
        .select({ value: count() })
        .from(users)
        .where(gte(users.lastActiveAt, todayStart));

      const [activeWeekResult] = await db
        .select({ value: count() })
        .from(users)
        .where(gte(users.lastActiveAt, weekStart));

      const [queriesResult] = await db
        .select({
          totalQueries: sql<number>`COALESCE(SUM(${users.queryCount}), 0)`,
          totalForwards: sql<number>`COALESCE(SUM(${users.forwardCount}), 0)`,
        })
        .from(users);

      // Messages today
      const [messagesTodayResult] = await db
        .select({ value: count() })
        .from(conversations)
        .where(
          and(
            eq(conversations.role, "user"),
            gte(conversations.createdAt, todayStart)
          )
        );

      // Total messages
      const [totalMessagesResult] = await db
        .select({ value: count() })
        .from(conversations)
        .where(eq(conversations.role, "user"));

      // Bot response rate (answered vs unknown)
      const [answeredResult] = await db
        .select({ value: count() })
        .from(analytics)
        .where(sql`${analytics.intent} != 'unknown' AND ${analytics.intent} IS NOT NULL`);

      const [unknownResult] = await db
        .select({ value: count() })
        .from(analytics)
        .where(eq(analytics.intent, "unknown"));

      // Average response time
      const [avgResponseResult] = await db
        .select({
          avgMs: sql<number>`COALESCE(AVG(${analytics.responseTimeMs}), 0)`,
        })
        .from(analytics)
        .where(sql`${analytics.responseTimeMs} IS NOT NULL`);

      // Subscribers (digest enabled)
      const [subscribersResult] = await db
        .select({ value: count() })
        .from(users)
        .where(eq(users.digestEnabled, true));

      const categoryBreakdown = await db
        .select({
          category: events.category,
          count: count(),
        })
        .from(events)
        .groupBy(events.category);

      const answered = Number(answeredResult.value) || 0;
      const unknown = Number(unknownResult.value) || 0;
      const totalIntent = answered + unknown;
      const responseRate = totalIntent > 0 ? Math.round((answered / totalIntent) * 100) : 100;

      res.json({
        totalEvents: eventCountResult.value,
        activeSources: activeSourcesResult.value,
        totalUsers: usersCountResult.value,
        eventsToday: eventsTodayResult.value,
        eventsWeek: eventsWeekResult.value,
        activeToday: activeTodayResult.value,
        activeWeek: activeWeekResult.value,
        totalQueries: queriesResult.totalQueries,
        totalForwards: queriesResult.totalForwards,
        messagesToday: messagesTodayResult.value,
        totalMessages: totalMessagesResult.value,
        responseRate,
        avgResponseMs: Math.round(Number(avgResponseResult.avgMs) || 0),
        subscribers: subscribersResult.value,
        eventsByCategory: categoryBreakdown,
      });
    } catch (error) {
      const logger = getLogger();
      logger.error({ error }, "Admin stats query failed");
      res.status(500).json({ error: "Failed to load stats" });
    }
  });

  // ─── Users ──────────────────────────────────────────────────

  router.get("/admin/api/users", async (req, res) => {
    try {
      const db = getDb();
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
      const offset = (page - 1) * limit;
      const sort = (req.query.sort as string) || "last_active";
      const lang = req.query.language as string;
      const tourist = req.query.tourist as string;
      const onboarding = req.query.onboarding as string;

      const conditions = [];

      if (lang && (lang === "es" || lang === "en")) {
        conditions.push(eq(users.language, lang));
      }

      if (tourist === "true") {
        conditions.push(eq(users.isTourist, true));
      } else if (tourist === "false") {
        conditions.push(eq(users.isTourist, false));
      }

      if (onboarding === "true") {
        conditions.push(eq(users.onboardingComplete, true));
      } else if (onboarding === "false") {
        conditions.push(eq(users.onboardingComplete, false));
      }

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      let orderBy;
      switch (sort) {
        case "queries":
          orderBy = desc(users.queryCount);
          break;
        case "first_seen":
          orderBy = desc(users.firstSeenAt);
          break;
        default:
          orderBy = desc(users.lastActiveAt);
      }

      const [totalResult] = await db
        .select({ value: count() })
        .from(users)
        .where(where);

      const userList = await db
        .select()
        .from(users)
        .where(where)
        .orderBy(orderBy)
        .limit(limit)
        .offset(offset);

      res.json({
        users: userList,
        total: totalResult.value,
        page,
        limit,
        totalPages: Math.ceil(totalResult.value / limit),
      });
    } catch (error) {
      const logger = getLogger();
      logger.error({ error }, "Admin users query failed");
      res.status(500).json({ error: "Failed to load users" });
    }
  });

  // GET /admin/api/users/:phoneHash/conversations
  router.get("/admin/api/users/:phoneHash/conversations", async (req, res) => {
    try {
      const { phoneHash } = req.params;
      const db = getDb();

      const convos = await db
        .select()
        .from(conversations)
        .where(eq(conversations.phoneHash, phoneHash))
        .orderBy(desc(conversations.createdAt))
        .limit(10);

      res.json(convos);
    } catch (error) {
      const logger = getLogger();
      logger.error({ error }, "Admin user conversations query failed");
      res.status(500).json({ error: "Failed to load conversations" });
    }
  });

  // ─── Conversations / Messages ──────────────────────────────

  router.get("/admin/api/conversations/recent", async (req, res) => {
    try {
      const db = getDb();
      const limit = Math.min(50, parseInt(req.query.limit as string) || 20);
      const intentFilter = req.query.intent as string;

      // Get recent user messages with their bot responses
      const conditions = [eq(conversations.role, "user")];
      if (intentFilter) {
        conditions.push(eq(conversations.intent, intentFilter));
      }

      const recentMessages = await db
        .select()
        .from(conversations)
        .where(and(...conditions))
        .orderBy(desc(conversations.createdAt))
        .limit(limit);

      // For each user message, try to find the bot response
      const messagesWithResponses = await Promise.all(
        recentMessages.map(async (msg) => {
          const [botResponse] = await db
            .select()
            .from(conversations)
            .where(
              and(
                eq(conversations.phoneHash, msg.phoneHash),
                eq(conversations.role, "assistant"),
                gte(conversations.createdAt, msg.createdAt!)
              )
            )
            .orderBy(asc(conversations.createdAt))
            .limit(1);

          return {
            ...msg,
            botResponse: botResponse?.content || null,
          };
        })
      );

      res.json(messagesWithResponses);
    } catch (error) {
      const logger = getLogger();
      logger.error({ error }, "Admin recent conversations query failed");
      res.status(500).json({ error: "Failed to load conversations" });
    }
  });

  // GET /admin/api/conversations/unanswered — messages where intent was unknown
  router.get("/admin/api/conversations/unanswered", async (_req, res) => {
    try {
      const db = getDb();

      const unanswered = await db
        .select({
          id: conversations.id,
          phoneHash: conversations.phoneHash,
          content: conversations.content,
          intent: conversations.intent,
          createdAt: conversations.createdAt,
        })
        .from(conversations)
        .where(
          and(
            eq(conversations.role, "user"),
            eq(conversations.intent, "unknown")
          )
        )
        .orderBy(desc(conversations.createdAt))
        .limit(50);

      res.json(unanswered);
    } catch (error) {
      const logger = getLogger();
      logger.error({ error }, "Admin unanswered query failed");
      res.status(500).json({ error: "Failed to load unanswered messages" });
    }
  });

  // ─── Sources ──────────────────────────────────────────────────

  router.get("/admin/api/sources", async (_req, res) => {
    try {
      const db = getDb();
      const allSources = await db
        .select()
        .from(sources)
        .orderBy(desc(sources.createdAt));

      res.json(allSources);
    } catch (error) {
      const logger = getLogger();
      logger.error({ error }, "Admin sources query failed");
      res.status(500).json({ error: "Failed to load sources" });
    }
  });

  router.post("/admin/api/sources", async (req, res) => {
    try {
      const { name, url, type, pollPriority } = req.body;

      if (!name || !url || !type) {
        res.status(400).json({ error: "name, url, and type are required" });
        return;
      }

      const validTypes = [
        "facebook_page",
        "instagram",
        "tiktok",
        "user_forwarded",
        "website",
        "platform",
      ];
      if (!validTypes.includes(type)) {
        res.status(400).json({ error: "Invalid source type" });
        return;
      }

      const validPriorities = ["high", "medium", "low"];
      if (pollPriority && !validPriorities.includes(pollPriority)) {
        res.status(400).json({ error: "Invalid priority" });
        return;
      }

      const db = getDb();
      const [newSource] = await db
        .insert(sources)
        .values({
          name,
          url,
          type: type as "facebook_page" | "instagram" | "tiktok" | "user_forwarded" | "website" | "platform",
          pollPriority: (pollPriority || "medium") as "high" | "medium" | "low",
        })
        .returning();

      res.status(201).json(newSource);
    } catch (error) {
      const logger = getLogger();
      logger.error({ error }, "Admin add source failed");
      res.status(500).json({ error: "Failed to add source" });
    }
  });

  router.put("/admin/api/sources/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const updates: Record<string, unknown> = {};

      if (req.body.isActive !== undefined) {
        updates.isActive = Boolean(req.body.isActive);
      }

      if (req.body.pollPriority !== undefined) {
        const validPriorities = ["high", "medium", "low"];
        if (!validPriorities.includes(req.body.pollPriority)) {
          res.status(400).json({ error: "Invalid priority" });
          return;
        }
        updates.pollPriority = req.body.pollPriority;
      }

      if (req.body.name !== undefined) {
        updates.name = req.body.name;
      }

      if (req.body.url !== undefined) {
        updates.url = req.body.url;
      }

      if (Object.keys(updates).length === 0) {
        res.status(400).json({ error: "No valid fields to update" });
        return;
      }

      const db = getDb();
      const [updated] = await db
        .update(sources)
        .set(updates)
        .where(eq(sources.id, id))
        .returning();

      if (!updated) {
        res.status(404).json({ error: "Source not found" });
        return;
      }

      res.json(updated);
    } catch (error) {
      const logger = getLogger();
      logger.error({ error }, "Admin update source failed");
      res.status(500).json({ error: "Failed to update source" });
    }
  });

  router.delete("/admin/api/sources/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const db = getDb();

      const [deleted] = await db
        .delete(sources)
        .where(eq(sources.id, id))
        .returning();

      if (!deleted) {
        res.status(404).json({ error: "Source not found" });
        return;
      }

      res.json({ success: true, deleted });
    } catch (error) {
      const logger = getLogger();
      logger.error({ error }, "Admin delete source failed");
      res.status(500).json({ error: "Failed to delete source" });
    }
  });

  // ─── Events ──────────────────────────────────────────────────

  router.get("/admin/api/events", async (req, res) => {
    try {
      const db = getDb();
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
      const offset = (page - 1) * limit;

      const conditions = [];

      // Category filter
      if (req.query.category && typeof req.query.category === "string") {
        conditions.push(eq(events.category, req.query.category as any));
      }

      // Content type filter
      if (req.query.content_type && typeof req.query.content_type === "string") {
        conditions.push(eq(events.contentType, req.query.content_type));
      }

      // Source type filter
      if (req.query.source_type && typeof req.query.source_type === "string") {
        conditions.push(eq(events.sourceType, req.query.source_type as any));
      }

      // City filter
      if (req.query.city && typeof req.query.city === "string") {
        conditions.push(eq(events.city, req.query.city));
      }

      // Date filter
      if (req.query.date && typeof req.query.date === "string") {
        const now = new Date();
        if (req.query.date === "today") {
          const todayStart = new Date(now);
          todayStart.setHours(0, 0, 0, 0);
          const todayEnd = new Date(now);
          todayEnd.setHours(23, 59, 59, 999);
          conditions.push(gte(events.eventDate, todayStart));
          conditions.push(lte(events.eventDate, todayEnd));
        } else if (req.query.date === "week") {
          const weekStart = new Date(now);
          weekStart.setHours(0, 0, 0, 0);
          const weekEnd = new Date(now);
          weekEnd.setDate(weekEnd.getDate() + 7);
          weekEnd.setHours(23, 59, 59, 999);
          conditions.push(gte(events.eventDate, weekStart));
          conditions.push(lte(events.eventDate, weekEnd));
        }
      }

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const [totalResult] = await db
        .select({ value: count() })
        .from(events)
        .where(where);

      const eventList = await db
        .select()
        .from(events)
        .where(where)
        .orderBy(desc(events.eventDate))
        .limit(limit)
        .offset(offset);

      res.json({
        events: eventList,
        total: totalResult.value,
        page,
        limit,
        totalPages: Math.ceil(totalResult.value / limit),
      });
    } catch (error) {
      const logger = getLogger();
      logger.error({ error }, "Admin events query failed");
      res.status(500).json({ error: "Failed to load events" });
    }
  });

  // POST /admin/api/events/manual — manually add an event
  router.post("/admin/api/events/manual", async (req, res) => {
    try {
      const {
        title,
        venueName,
        venueAddress,
        city,
        eventDate,
        category,
        contentType,
        price,
        description,
        imageUrl,
      } = req.body;

      if (!title || !city) {
        res.status(400).json({ error: "title and city are required" });
        return;
      }

      const db = getDb();
      const [newEvent] = await db
        .insert(events)
        .values({
          title,
          venueName: venueName || null,
          venueAddress: venueAddress || null,
          city,
          eventDate: eventDate ? new Date(eventDate) : null,
          category: category || "other",
          contentType: contentType || "event",
          price: price || null,
          description: description || null,
          imageUrl: imageUrl || null,
          sourceType: "user_forwarded",
          confidence: 1.0,
          scrapedAt: new Date(),
        })
        .returning();

      res.status(201).json(newEvent);
    } catch (error) {
      const logger = getLogger();
      logger.error({ error }, "Admin manual event add failed");
      res.status(500).json({ error: "Failed to add event" });
    }
  });

  // DELETE /admin/api/events — bulk delete events
  router.delete("/admin/api/events", async (req, res) => {
    try {
      const { ids } = req.body;
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        res.status(400).json({ error: "ids array is required" });
        return;
      }

      const db = getDb();
      let deletedCount = 0;
      for (const id of ids) {
        const [deleted] = await db
          .delete(events)
          .where(eq(events.id, id))
          .returning();
        if (deleted) deletedCount++;
      }

      res.json({ success: true, deleted: deletedCount });
    } catch (error) {
      const logger = getLogger();
      logger.error({ error }, "Admin bulk delete events failed");
      res.status(500).json({ error: "Failed to delete events" });
    }
  });

  // PUT /admin/api/events/category — bulk update category
  router.put("/admin/api/events/category", async (req, res) => {
    try {
      const { ids, category } = req.body;
      if (!ids || !Array.isArray(ids) || !category) {
        res.status(400).json({ error: "ids array and category are required" });
        return;
      }

      const db = getDb();
      let updatedCount = 0;
      for (const id of ids) {
        const [updated] = await db
          .update(events)
          .set({ category })
          .where(eq(events.id, id))
          .returning();
        if (updated) updatedCount++;
      }

      res.json({ success: true, updated: updatedCount });
    } catch (error) {
      const logger = getLogger();
      logger.error({ error }, "Admin bulk update category failed");
      res.status(500).json({ error: "Failed to update categories" });
    }
  });

  // ─── Scraping ──────────────────────────────────────────────────

  router.post("/admin/api/scrape", async (_req, res) => {
    const logger = getLogger();
    try {
      logger.info("Manual scrape triggered from admin dashboard");
      const result = await runScrapeAll("admin_manual");
      res.json(result);
    } catch (error) {
      logger.error({ error }, "Manual scrape failed");
      res.status(500).json({ error: "Scrape failed" });
    }
  });

  router.post("/admin/api/scrape/run", async (_req, res) => {
    const logger = getLogger();
    try {
      logger.info("Full scrape triggered from admin dashboard");
      const result = await runScrapeAll("admin_full");
      res.json(result);
    } catch (error) {
      logger.error({ error }, "Full scrape failed");
      res.status(500).json({ error: "Full scrape failed" });
    }
  });

  router.post("/admin/api/quality/run", async (_req, res) => {
    const logger = getLogger();
    try {
      const { recalculateAllFreshness } = await import("../scraper/freshness.js");
      await recalculateAllFreshness();
      res.json({ success: true, message: "Quality check complete" });
    } catch (error) {
      logger.error({ error }, "Quality check failed");
      res.status(500).json({ error: "Quality check failed" });
    }
  });

  // GET /admin/api/scrape-log — last 10 scrape runs
  router.get("/admin/api/scrape-log", async (_req, res) => {
    try {
      const db = getDb();
      const logs = await db
        .select()
        .from(scrapeLogs)
        .orderBy(desc(scrapeLogs.startedAt))
        .limit(10);

      res.json(logs);
    } catch (error) {
      const logger = getLogger();
      logger.error({ error }, "Admin scrape log query failed");
      res.status(500).json({ error: "Failed to load scrape logs" });
    }
  });

  // ─── Analytics ──────────────────────────────────────────────

  router.get("/admin/api/analytics/top-queries", async (_req, res) => {
    try {
      const db = getDb();
      const results = await db
        .select({
          query: analytics.query,
          intent: analytics.intent,
          count: count(),
        })
        .from(analytics)
        .where(sql`${analytics.query} IS NOT NULL`)
        .groupBy(analytics.query, analytics.intent)
        .orderBy(desc(count()))
        .limit(20);

      res.json(results);
    } catch (error) {
      const logger = getLogger();
      logger.error({ error }, "Analytics top-queries failed");
      res.status(500).json({ error: "Failed to load top queries" });
    }
  });

  router.get("/admin/api/analytics/intents", async (_req, res) => {
    try {
      const db = getDb();
      const results = await db
        .select({
          intent: analytics.intent,
          count: count(),
        })
        .from(analytics)
        .groupBy(analytics.intent)
        .orderBy(desc(count()));

      res.json(results);
    } catch (error) {
      const logger = getLogger();
      logger.error({ error }, "Analytics intents failed");
      res.status(500).json({ error: "Failed to load intent distribution" });
    }
  });

  router.get("/admin/api/analytics/daily", async (_req, res) => {
    try {
      const db = getDb();
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const results = await db
        .select({
          date: sql<string>`DATE(${analytics.createdAt})`.as("date"),
          count: count(),
        })
        .from(analytics)
        .where(gte(analytics.createdAt, thirtyDaysAgo))
        .groupBy(sql`DATE(${analytics.createdAt})`)
        .orderBy(sql`DATE(${analytics.createdAt})`);

      res.json(results);
    } catch (error) {
      const logger = getLogger();
      logger.error({ error }, "Analytics daily failed");
      res.status(500).json({ error: "Failed to load daily analytics" });
    }
  });

  router.get("/admin/api/analytics/hourly", async (_req, res) => {
    try {
      const db = getDb();
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const hourlyData = await db
        .select({
          hour: sql<number>`EXTRACT(HOUR FROM ${analytics.createdAt})`.as("hour"),
          count: count(),
        })
        .from(analytics)
        .where(gte(analytics.createdAt, sevenDaysAgo))
        .groupBy(sql`EXTRACT(HOUR FROM ${analytics.createdAt})`)
        .orderBy(sql`EXTRACT(HOUR FROM ${analytics.createdAt})`);

      const hourMap = new Map(hourlyData.map((h) => [Number(h.hour), Number(h.count)]));
      const popularHours = Array.from({ length: 24 }, (_, i) => ({
        hour: i,
        count: hourMap.get(i) || 0,
      }));

      res.json(popularHours);
    } catch (error) {
      const logger = getLogger();
      logger.error({ error }, "Analytics hourly failed");
      res.status(500).json({ error: "Failed to load hourly analytics" });
    }
  });

  router.get("/admin/api/analytics/categories", async (_req, res) => {
    try {
      const db = getDb();
      const results = await db
        .select({
          category: analytics.category,
          count: count(),
        })
        .from(analytics)
        .where(sql`${analytics.category} IS NOT NULL`)
        .groupBy(analytics.category)
        .orderBy(desc(count()))
        .limit(20);

      res.json(results);
    } catch (error) {
      const logger = getLogger();
      logger.error({ error }, "Analytics categories failed");
      res.status(500).json({ error: "Failed to load category analytics" });
    }
  });

  // ─── Retention & Engagement ──────────────────────────────

  router.get("/admin/api/metrics/retention", async (_req, res) => {
    try {
      const db = getDb();
      const now = new Date();

      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);

      const yesterdayStart = new Date(todayStart);
      yesterdayStart.setDate(yesterdayStart.getDate() - 1);

      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const [dauResult] = await db
        .select({ value: sql<number>`COUNT(DISTINCT ${analytics.phoneHash})` })
        .from(analytics)
        .where(gte(analytics.createdAt, todayStart));

      const [wauResult] = await db
        .select({ value: sql<number>`COUNT(DISTINCT ${analytics.phoneHash})` })
        .from(analytics)
        .where(gte(analytics.createdAt, sevenDaysAgo));

      const [mauResult] = await db
        .select({ value: sql<number>`COUNT(DISTINCT ${analytics.phoneHash})` })
        .from(analytics)
        .where(gte(analytics.createdAt, thirtyDaysAgo));

      const [retentionResult] = await db
        .select({ value: sql<number>`COUNT(DISTINCT t.phone_hash)` })
        .from(
          sql`(
            SELECT DISTINCT ${analytics.phoneHash} AS phone_hash
            FROM ${analytics}
            WHERE ${analytics.createdAt} >= ${todayStart}
          ) t
          INNER JOIN (
            SELECT DISTINCT ${analytics.phoneHash} AS phone_hash
            FROM ${analytics}
            WHERE ${analytics.createdAt} >= ${yesterdayStart}
              AND ${analytics.createdAt} < ${todayStart}
          ) y ON t.phone_hash = y.phone_hash`
        );

      const retentionTrend = await db
        .select({
          date: sql<string>`DATE(${analytics.createdAt})`.as("date"),
          uniqueUsers: sql<number>`COUNT(DISTINCT ${analytics.phoneHash})`.as("unique_users"),
        })
        .from(analytics)
        .where(gte(analytics.createdAt, sevenDaysAgo))
        .groupBy(sql`DATE(${analytics.createdAt})`)
        .orderBy(sql`DATE(${analytics.createdAt})`);

      const dau = Number(dauResult.value) || 0;
      const yesterdayUsers = retentionTrend.length >= 2
        ? Number(retentionTrend[retentionTrend.length - 2]?.uniqueUsers) || 0
        : 0;
      const retained = Number(retentionResult.value) || 0;
      const retentionRate = yesterdayUsers > 0
        ? Math.round((retained / yesterdayUsers) * 100)
        : 0;

      res.json({
        dau,
        wau: Number(wauResult.value) || 0,
        mau: Number(mauResult.value) || 0,
        retentionRate,
        retainedUsers: retained,
        retentionTrend,
      });
    } catch (error) {
      const logger = getLogger();
      logger.error({ error }, "Retention metrics failed");
      res.status(500).json({ error: "Failed to load retention metrics" });
    }
  });

  router.get("/admin/api/metrics/engagement", async (_req, res) => {
    try {
      const db = getDb();
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const [avgResult] = await db
        .select({
          totalQueries: sql<number>`COUNT(*)`,
          uniqueUsers: sql<number>`COUNT(DISTINCT ${analytics.phoneHash})`,
        })
        .from(analytics)
        .where(gte(analytics.createdAt, sevenDaysAgo));

      const totalQueries = Number(avgResult.totalQueries) || 0;
      const uniqueUsers = Number(avgResult.uniqueUsers) || 1;
      const avgQueriesPerUser = Math.round((totalQueries / uniqueUsers) * 10) / 10;

      const [responseTimeResult] = await db
        .select({
          avgMs: sql<number>`COALESCE(AVG(${analytics.responseTimeMs}), 0)`,
          p50: sql<number>`COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ${analytics.responseTimeMs}), 0)`,
          p95: sql<number>`COALESCE(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY ${analytics.responseTimeMs}), 0)`,
        })
        .from(analytics)
        .where(
          and(
            gte(analytics.createdAt, sevenDaysAgo),
            sql`${analytics.responseTimeMs} IS NOT NULL`
          )
        );

      const responseTimeTrend = await db
        .select({
          date: sql<string>`DATE(${analytics.createdAt})`.as("date"),
          avgMs: sql<number>`AVG(${analytics.responseTimeMs})`.as("avg_ms"),
        })
        .from(analytics)
        .where(
          and(
            gte(analytics.createdAt, sevenDaysAgo),
            sql`${analytics.responseTimeMs} IS NOT NULL`
          )
        )
        .groupBy(sql`DATE(${analytics.createdAt})`)
        .orderBy(sql`DATE(${analytics.createdAt})`);

      res.json({
        avgQueriesPerUser,
        totalQueries,
        uniqueUsers,
        responseTime: {
          avgMs: Math.round(Number(responseTimeResult.avgMs) || 0),
          p50Ms: Math.round(Number(responseTimeResult.p50) || 0),
          p95Ms: Math.round(Number(responseTimeResult.p95) || 0),
        },
        responseTimeTrend,
      });
    } catch (error) {
      const logger = getLogger();
      logger.error({ error }, "Engagement metrics failed");
      res.status(500).json({ error: "Failed to load engagement metrics" });
    }
  });

  // ─── Alerts & Subscriptions ────────────────────────────────

  router.get("/admin/api/alerts", async (_req, res) => {
    try {
      const db = getDb();

      const alerts = await db
        .select()
        .from(userAlerts)
        .orderBy(desc(userAlerts.createdAt))
        .limit(100);

      const [totalResult] = await db
        .select({ value: count() })
        .from(userAlerts)
        .where(eq(userAlerts.active, true));

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - 7);
      weekStart.setHours(0, 0, 0, 0);

      const [sentTodayResult] = await db
        .select({ value: count() })
        .from(alertNotifications)
        .where(gte(alertNotifications.notifiedAt, todayStart));

      const [sentWeekResult] = await db
        .select({ value: count() })
        .from(alertNotifications)
        .where(gte(alertNotifications.notifiedAt, weekStart));

      res.json({
        alerts,
        totalActive: totalResult.value,
        sentToday: sentTodayResult.value,
        sentWeek: sentWeekResult.value,
      });
    } catch (error) {
      const logger = getLogger();
      logger.error({ error }, "Admin alerts query failed");
      res.status(500).json({ error: "Failed to load alerts" });
    }
  });

  // ─── Settings ──────────────────────────────────────────────

  router.get("/admin/api/settings", async (_req, res) => {
    try {
      const config = getConfig();
      res.json({
        DEFAULT_CITY: config.DEFAULT_CITY,
        NODE_ENV: config.NODE_ENV,
        LOG_LEVEL: config.LOG_LEVEL,
        PORT: config.PORT,
      });
    } catch (error) {
      const logger = getLogger();
      logger.error({ error }, "Admin settings query failed");
      res.status(500).json({ error: "Failed to load settings" });
    }
  });

  // ─── Data Quality ──────────────────────────────────────────

  router.get("/admin/api/quality", async (_req, res) => {
    try {
      const db = getDb();
      const config = getConfig();

      const SMA_TZ = -6;
      const now = new Date();
      const smaMs = now.getTime() + now.getTimezoneOffset() * 60000 + SMA_TZ * 3600000;
      const sma = new Date(smaMs);

      const eventsPerDay: Array<{ date: string; count: number }> = [];
      for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
        const dayStart = new Date(
          Date.UTC(sma.getFullYear(), sma.getMonth(), sma.getDate() + dayOffset) -
            SMA_TZ * 3600000
        );
        const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

        const result = await db
          .select({ cnt: sql<number>`COUNT(*)` })
          .from(events)
          .where(
            and(
              sql`${events.city} = ${config.DEFAULT_CITY}`,
              gte(events.eventDate, dayStart),
              lt(events.eventDate, dayEnd)
            )
          );

        const cnt = Number((result as unknown as Array<{ cnt: string }>)[0]?.cnt) || 0;
        eventsPerDay.push({
          date: dayStart.toISOString().split("T")[0],
          count: cnt,
        });
      }

      const futureStart = new Date(
        Date.UTC(sma.getFullYear(), sma.getMonth(), sma.getDate()) -
          SMA_TZ * 3600000
      );

      const completenessResult = await db
        .select({
          total: sql<number>`COUNT(*)`,
          withImage: sql<number>`COUNT(CASE WHEN ${events.imageUrl} IS NOT NULL THEN 1 END)`,
          withPrice: sql<number>`COUNT(CASE WHEN ${events.price} IS NOT NULL THEN 1 END)`,
          withDescription: sql<number>`COUNT(CASE WHEN ${events.description} IS NOT NULL AND LENGTH(${events.description}) > 10 THEN 1 END)`,
          withVenue: sql<number>`COUNT(CASE WHEN ${events.venueAddress} IS NOT NULL THEN 1 END)`,
        })
        .from(events)
        .where(
          and(
            sql`${events.city} = ${config.DEFAULT_CITY}`,
            gte(events.eventDate, futureStart)
          )
        );

      const c = completenessResult[0];

      const sourceRanking = await db
        .select({
          name: sources.name,
          qualityScore: sources.qualityScore,
          eventsFound: sources.eventsFound,
          totalScrapes: sources.totalScrapes,
          successRate: sources.successRate,
        })
        .from(sources)
        .where(eq(sources.isActive, true))
        .orderBy(desc(sources.qualityScore))
        .limit(10);

      const staleCount = await countStaleEvents();

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const [mergedTodayResult] = await db
        .select({ cnt: sql<number>`COUNT(*)` })
        .from(events)
        .where(
          and(
            sql`${events.sourceCount} > 1`,
            gte(events.scrapedAt, todayStart)
          )
        );

      const duplicatesMergedToday = Number(
        (mergedTodayResult as unknown as { cnt: string })?.cnt
      ) || 0;

      res.json({
        eventsPerDay,
        completeness: {
          withImage: Number(c?.withImage) || 0,
          withPrice: Number(c?.withPrice) || 0,
          withDescription: Number(c?.withDescription) || 0,
          withVenue: Number(c?.withVenue) || 0,
          total: Number(c?.total) || 0,
        },
        sourceRanking,
        staleEvents: staleCount,
        duplicatesMergedToday,
      });
    } catch (error) {
      const logger = getLogger();
      logger.error({ error }, "Admin quality API failed");
      res.status(500).json({ error: "Failed to load quality data" });
    }
  });

  // ─── QR Code Widget ──────────────────────────────────────────

  router.get("/admin/qr/:sourceName", (req, res) => {
    const { sourceName } = req.params;
    res.type("html").send(getQRPageHTML(sourceName));
  });

  return router;
}
