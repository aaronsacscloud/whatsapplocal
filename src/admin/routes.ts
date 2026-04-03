import { Router, json } from "express";
import { eq, desc, sql, and, gte, lte, count } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { sources, events, users } from "../db/schema.js";
import { getDashboardHTML } from "./dashboard.js";
import { runScrapeAll } from "../scraper/manager.js";
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

  return router;
}
