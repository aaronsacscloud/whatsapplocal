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
  jsonb,
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
    contentType: text("content_type").default("event"), // 'event' | 'recurring' | 'workshop' | 'activity' | 'post'
    recurrenceDay: integer("recurrence_day"), // 0=Sunday, 1=Monday... 6=Saturday
    recurrenceTime: text("recurrence_time"), // "10:00" in 24h format
    recurrenceEndDate: timestamp("recurrence_end_date", { withTimezone: true }),
    workshopStartDate: timestamp("workshop_start_date", { withTimezone: true }),
    workshopEndDate: timestamp("workshop_end_date", { withTimezone: true }),
    price: text("price"), // "$100", "Gratis", "$500 USD"
    duration: text("duration"), // "2 hours", "3 dias"
    description: text("description"),
    sourceUrl: text("source_url"),
    sourceType: sourceTypeEnum("source_type"),
    confidence: real("confidence"),
    rawContent: text("raw_content"),
    imageUrl: text("image_url"),
    dedupHash: text("dedup_hash"),
    scrapedAt: timestamp("scraped_at", { withTimezone: true }).defaultNow(),
    freshnessScore: real("freshness_score").default(1.0),
    sourceCount: integer("source_count").default(1),
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
    index("idx_events_recurrence_day").on(table.recurrenceDay),
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
  latitude: real("latitude"),
  longitude: real("longitude"),
  address: text("address"),
  googleMapsUrl: text("google_maps_url"),
  eventsFound: integer("events_found").default(0),
  eventsFromImages: integer("events_from_images").default(0),
  lastUsefulEventAt: timestamp("last_useful_event_at", { withTimezone: true }),
  qualityScore: real("quality_score").default(0.5),
  totalScrapes: integer("total_scrapes").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  phoneHash: text("phone_hash").notNull().unique(),
  name: text("name"),
  city: text("city"),
  neighborhood: text("neighborhood"),
  language: text("language").default("es"),
  interests: text("interests").array(),
  isTourist: boolean("is_tourist"),
  onboardingComplete: boolean("onboarding_complete").default(false),
  digestEnabled: boolean("digest_enabled").default(true),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).defaultNow(),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }).defaultNow(),
  queryCount: integer("query_count").default(0),
  forwardCount: integer("forward_count").default(0),
  dailyQueryCount: integer("daily_query_count").default(0),
  dailyQueryResetAt: timestamp("daily_query_reset_at", { withTimezone: true }),
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

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    phoneHash: text("phone_hash").notNull(),
    role: text("role").notNull(), // 'user' or 'assistant'
    content: text("content").notNull(),
    intent: text("intent"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_conversations_phone").on(table.phoneHash, table.createdAt),
  ]
);

export const analytics = pgTable(
  "analytics",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    phoneHash: text("phone_hash"),
    intent: text("intent").notNull(),
    query: text("query"),
    category: text("category"),
    city: text("city"),
    resultsCount: integer("results_count").default(0),
    responseTimeMs: integer("response_time_ms"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_analytics_intent").on(table.intent, table.createdAt),
    index("idx_analytics_created").on(table.createdAt),
  ]
);

export const userAlerts = pgTable(
  "user_alerts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    phoneHash: text("phone_hash").notNull(),
    category: text("category").notNull(),
    query: text("query"),
    active: boolean("active").default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_user_alerts_phone").on(table.phoneHash, table.active),
    index("idx_user_alerts_category").on(table.category, table.active),
  ]
);

export const alertNotifications = pgTable(
  "alert_notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    alertId: uuid("alert_id")
      .notNull()
      .references(() => userAlerts.id, { onDelete: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    notifiedAt: timestamp("notified_at", { withTimezone: true }).defaultNow(),
  }
);

export const favorites = pgTable(
  "favorites",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    phoneHash: text("phone_hash").notNull(),
    eventId: uuid("event_id").references(() => events.id, {
      onDelete: "cascade",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [index("idx_favorites_phone").on(table.phoneHash)]
);

export const scrapeLogs = pgTable("scrape_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  sourcesProcessed: integer("sources_processed").default(0),
  eventsInserted: integer("events_inserted").default(0),
  eventsRejected: integer("events_rejected").default(0),
  duplicatesMerged: integer("duplicates_merged").default(0),
  errors: integer("errors").default(0),
  trigger: text("trigger").default("cron"),
  details: jsonb("details"),
});

export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
export type Source = typeof sources.$inferSelect;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
export type Analytics = typeof analytics.$inferSelect;
export type NewAnalytics = typeof analytics.$inferInsert;
export type UserAlert = typeof userAlerts.$inferSelect;
export type NewUserAlert = typeof userAlerts.$inferInsert;
export type Favorite = typeof favorites.$inferSelect;
export type NewFavorite = typeof favorites.$inferInsert;
export type ScrapeLog = typeof scrapeLogs.$inferSelect;
export type NewScrapeLog = typeof scrapeLogs.$inferInsert;
