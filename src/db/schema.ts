import {
  pgTable,
  uuid,
  text,
  timestamp,
  real,
  boolean,
  integer,
  index,
  pgEnum,
} from "drizzle-orm/pg-core";

export const categoryEnum = pgEnum("category", [
  "music",
  "food",
  "nightlife",
  "culture",
  "sports",
  "popup",
  "wellness",
  "tour",
  "class",
  "adventure",
  "wine",
  "other",
]);

export const sourceTypeEnum = pgEnum("source_type", [
  "facebook_page",
  "instagram",
  "tiktok",
  "user_forwarded",
  "website",
  "platform",
]);

export const pollPriorityEnum = pgEnum("poll_priority", [
  "high",
  "medium",
  "low",
]);

export const events = pgTable(
  "events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: text("title").notNull(),
    venueName: text("venue_name"),
    venueAddress: text("venue_address"),
    neighborhood: text("neighborhood"),
    city: text("city").notNull(),
    eventDate: timestamp("event_date", { withTimezone: true }),
    eventEndDate: timestamp("event_end_date", { withTimezone: true }),
    category: categoryEnum("category").default("other"),
    description: text("description"),
    sourceUrl: text("source_url"),
    sourceType: sourceTypeEnum("source_type"),
    confidence: real("confidence"),
    rawContent: text("raw_content"),
    imageUrl: text("image_url"),
    dedupHash: text("dedup_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_events_city_date").on(table.city, table.eventDate),
    index("idx_events_neighborhood_date").on(
      table.neighborhood,
      table.eventDate
    ),
    index("idx_events_dedup_hash").on(table.dedupHash),
  ]
);

export const sources = pgTable("sources", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  type: sourceTypeEnum("type").notNull(),
  pollPriority: pollPriorityEnum("poll_priority").default("medium"),
  lastScrapedAt: timestamp("last_scraped_at", { withTimezone: true }),
  successRate: real("success_rate").default(1.0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  phoneHash: text("phone_hash").notNull().unique(),
  city: text("city"),
  neighborhood: text("neighborhood"),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).defaultNow(),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }).defaultNow(),
  queryCount: integer("query_count").default(0),
  forwardCount: integer("forward_count").default(0),
});

export const processedMessages = pgTable("processed_messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  messageId: text("message_id").notNull().unique(),
  processedAt: timestamp("processed_at", { withTimezone: true }).defaultNow(),
});

export const jobState = pgTable("job_state", {
  id: uuid("id").defaultRandom().primaryKey(),
  jobName: text("job_name").notNull().unique(),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  status: text("status").default("idle"),
});

export const messageQueue = pgTable("message_queue", {
  id: uuid("id").defaultRandom().primaryKey(),
  phoneHash: text("phone_hash").notNull(),
  messageBody: text("message_body").notNull(),
  messageId: text("message_id").notNull(),
  attempts: integer("attempts").default(0),
  nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  status: text("status").default("pending"),
});

export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
export type Source = typeof sources.$inferSelect;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
