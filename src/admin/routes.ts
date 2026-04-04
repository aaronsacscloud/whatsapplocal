import { Router, json } from "express";
import { eq, desc, sql, and, gte, lte, lt, count } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { sources, events, users, analytics } from "../db/schema.js";
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

  // GET /admin/api/stats - Dashboard aggregate stats
  router.get("/admin/api/stats", async (_req, res) => {
    try {
      const db = getDb();

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

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

      const [activeTodayResult] = await db
        .select({ value: count() })
        .from(users)
        .where(gte(users.lastActiveAt, todayStart));

      const [queriesResult] = await db
        .select({
          totalQueries: sql<number>`COALESCE(SUM(${users.queryCount}), 0)`,
          totalForwards: sql<number>`COALESCE(SUM(${users.forwardCount}), 0)`,
        })
        .from(users);

      const categoryBreakdown = await db
        .select({
          category: events.category,
          count: count(),
        })
        .from(events)
        .groupBy(events.category);

      res.json({
        totalEvents: eventCountResult.value,
        activeSources: activeSourcesResult.value,
        totalUsers: usersCountResult.value,
        eventsToday: eventsTodayResult.value,
        activeToday: activeTodayResult.value,
        totalQueries: queriesResult.totalQueries,
        totalForwards: queriesResult.totalForwards,
        eventsByCategory: categoryBreakdown,
      });
    } catch (error) {
      const logger = getLogger();
      logger.error({ error }, "Admin stats query failed");
      res.status(500).json({ error: "Failed to load stats" });
    }
  });

  // GET /admin/api/sources - List all sources
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

  // POST /admin/api/sources - Add a new source
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
          type: type as "facebook_page" | "instagram" | "tiktok" | "user_forwarded",
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

  // PUT /admin/api/sources/:id - Update a source
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

  // DELETE /admin/api/sources/:id - Delete a source
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

  // GET /admin/api/events - List events with pagination and filters
  router.get("/admin/api/events", async (req, res) => {
    try {
      const db = getDb();
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
      const offset = (page - 1) * limit;

      const conditions = [];

      // Category filter
      if (req.query.category && typeof req.query.category === "string") {
        const validCategories = [
          "music",
          "food",
          "nightlife",
          "culture",
          "sports",
          "popup",
          "other",
        ];
        if (validCategories.includes(req.query.category)) {
          conditions.push(
            eq(
              events.category,
              req.query.category as
                | "music"
                | "food"
                | "nightlife"
                | "culture"
                | "sports"
                | "popup"
                | "other"
            )
          );
        }
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

  // POST /admin/api/scrape - Trigger manual scrape
  router.post("/admin/api/scrape", async (_req, res) => {
    const logger = getLogger();
    try {
      logger.info("Manual scrape triggered from admin dashboard");
      const result = await runScrapeAll();
      res.json(result);
    } catch (error) {
      logger.error({ error }, "Manual scrape failed");
      res.status(500).json({ error: "Scrape failed" });
    }
  });

  // ─── Analytics Endpoints ───────────────────────────────────────────

  // GET /admin/api/analytics/top-queries — Top 20 most common queries
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

  // GET /admin/api/analytics/intents — Intent distribution
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

  // GET /admin/api/analytics/daily — Queries per day (last 30 days)
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

  // ─── Retention & Engagement Metrics ──────────────────────────

  // GET /admin/api/metrics/retention — DAU, WAU, MAU, retention rate
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

      // DAU: distinct users who queried today
      const [dauResult] = await db
        .select({ value: sql<number>`COUNT(DISTINCT ${analytics.phoneHash})` })
        .from(analytics)
        .where(gte(analytics.createdAt, todayStart));

      // WAU: distinct users in last 7 days
      const [wauResult] = await db
        .select({ value: sql<number>`COUNT(DISTINCT ${analytics.phoneHash})` })
        .from(analytics)
        .where(gte(analytics.createdAt, sevenDaysAgo));

      // MAU: distinct users in last 30 days
      const [mauResult] = await db
        .select({ value: sql<number>`COUNT(DISTINCT ${analytics.phoneHash})` })
        .from(analytics)
        .where(gte(analytics.createdAt, thirtyDaysAgo));

      // Retention: users who queried today AND also queried yesterday
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

      // Daily retention for last 7 days
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

  // GET /admin/api/metrics/engagement — avg queries, popular hours, response times
  router.get("/admin/api/metrics/engagement", async (_req, res) => {
    try {
      const db = getDb();
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      // Avg queries per user (last 7 days)
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

      // Popular hours (group by hour of day)
      const hourlyData = await db
        .select({
          hour: sql<number>`EXTRACT(HOUR FROM ${analytics.createdAt})`.as("hour"),
          count: count(),
        })
        .from(analytics)
        .where(gte(analytics.createdAt, sevenDaysAgo))
        .groupBy(sql`EXTRACT(HOUR FROM ${analytics.createdAt})`)
        .orderBy(sql`EXTRACT(HOUR FROM ${analytics.createdAt})`);

      // Avg response time
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

      // Response time trend (daily avg)
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

      // Build full 24-hour heatmap data
      const hourMap = new Map(hourlyData.map((h) => [Number(h.hour), Number(h.count)]));
      const popularHours = Array.from({ length: 24 }, (_, i) => ({
        hour: i,
        count: hourMap.get(i) || 0,
      }));

      res.json({
        avgQueriesPerUser,
        totalQueries,
        uniqueUsers,
        popularHours,
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

  // ─── Data Quality ��─────────────────────────────────────────

  // GET /admin/api/quality — Data quality metrics
  router.get("/admin/api/quality", async (_req, res) => {
    try {
      const db = getDb();
      const config = getConfig();
      const logger = getLogger();

      // SMA timezone offset
      const SMA_TZ = -6;
      const now = new Date();
      const smaMs = now.getTime() + now.getTimezoneOffset() * 60000 + SMA_TZ * 3600000;
      const sma = new Date(smaMs);

      // Events per day for next 7 days
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

      // Completeness metrics for future events
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

      // Source quality ranking (top 10 sources by quality_score)
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

      // Stale events count
      const staleCount = await countStaleEvents();

      // Duplicates merged today (approximate: events updated today with source_count > 1)
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

  // GET /admin/qr/:sourceName — Printable QR code page for a business
  router.get("/admin/qr/:sourceName", (req, res) => {
    const { sourceName } = req.params;
    res.type("html").send(getQRPageHTML(sourceName));
  });

  return router;
}
