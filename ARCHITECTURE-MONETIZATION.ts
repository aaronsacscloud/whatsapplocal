/**
 * ===========================================================================
 * WHATSAPP LOCAL — MONETIZATION & ENGAGEMENT TECHNICAL ARCHITECTURE
 * ===========================================================================
 *
 * Target: San Miguel de Allende WhatsApp events bot
 * Stack: Node.js/TypeScript, Express, Drizzle ORM, Supabase (Postgres),
 *        Claude API (Anthropic), Kapso WhatsApp Cloud API
 *
 * This file is the executable specification. Every schema is valid Drizzle ORM
 * code. Every type is real TypeScript. Copy-paste into the codebase to build.
 *
 * TABLE OF CONTENTS
 * -----------------
 * 1. USER PROFILE SYSTEM (enhanced)
 * 2. SUBSCRIPTION / PREMIUM TIERS
 * 3. BUSINESS DASHBOARD (B2B)
 * 4. PLAN BUILDER (killer feature)
 * 5. ENGAGEMENT HOOKS (gamification)
 * 6. PAYMENT INTEGRATION
 * 7. API ENDPOINTS
 * 8. IMPLEMENTATION PRIORITY
 */

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
  uniqueIndex,
  serial,
  varchar,
  numeric,
} from "drizzle-orm/pg-core";

// ==========================================================================
// 1. USER PROFILE SYSTEM
// ==========================================================================
//
// CURRENT STATE: The `users` table has: phoneHash, city, neighborhood,
// language, interests (text[]), isTourist, onboardingComplete, digestEnabled,
// firstSeenAt, lastActiveAt, queryCount, forwardCount.
//
// STRATEGY: Instead of replacing the users table, we add a `user_profiles`
// table (1:1 via phoneHash) and a `user_behaviors` table for time-series
// behavioral data. This avoids a breaking migration on the core users table.
//
// PROGRESSIVE DATA COLLECTION: We never show a "fill out your profile" form.
// Instead, the LLM extracts preferences from natural conversation:
//
//   User: "algo barato para cenar con amigos"
//     -> price_range: "low", group_size: 3-5, cuisine: inferred later
//
//   User: "jazz esta noche"
//     -> music_genres: ["jazz"], time_preference: "night"
//
//   User: "yoga mañana temprano"
//     -> vibe: "wellness", time_preference: "morning"
//
//   User: "un restaurante fancy para 2"
//     -> price_range: "high", group_size: 2, vibe: "romantic"
//
// The classifier already extracts: category, budget, date, language.
// We enhance it to also extract: group_size, vibe, cuisine_hint.
// These get accumulated in user_profiles over time.

export const vibeEnum = pgEnum("vibe", [
  "chill",
  "party",
  "culture",
  "romantic",
  "family",
  "adventure",
  "wellness",
]);

export const priceRangeEnum = pgEnum("price_range", [
  "free",
  "low",      // < $200 MXN
  "medium",   // $200-$600 MXN
  "high",     // $600-$1500 MXN
  "premium",  // > $1500 MXN
]);

export const ageRangeEnum = pgEnum("age_range", [
  "18-25",
  "26-35",
  "36-50",
  "51+",
]);

export const genderEnum = pgEnum("gender", [
  "male",
  "female",
  "non_binary",
  "prefer_not_to_say",
]);

export const userProfiles = pgTable(
  "user_profiles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    phoneHash: text("phone_hash").notNull().unique(),

    // --- Demographics (optional, collected over time) ---
    ageRange: ageRangeEnum("age_range"),
    gender: genderEnum("gender"),
    neighborhood: text("neighborhood"),  // home neighborhood (not just search)
    nationality: text("nationality"),     // inferred from language patterns

    // --- Preferences (accumulated from queries) ---
    cuisineTypes: text("cuisine_types").array(),    // ["mexican","italian","japanese"]
    musicGenres: text("music_genres").array(),      // ["jazz","rock","electronic"]
    preferredPriceRange: priceRangeEnum("preferred_price_range"),
    vibes: text("vibes").array(),                    // ["chill","culture"]
    preferredTimeOfDay: text("preferred_time_of_day"), // "morning"|"afternoon"|"evening"|"night"
    typicalGroupSize: integer("typical_group_size"),   // 1-10+
    preferredCategories: text("preferred_categories").array(), // weighted from usage

    // --- Behavioral aggregates (updated by background job) ---
    totalEventsAttended: integer("total_events_attended").default(0),
    avgSpendEstimate: real("avg_spend_estimate"),  // estimated MXN per outing
    peakActivityHour: integer("peak_activity_hour"), // 0-23
    weekdayVsWeekend: real("weekday_vs_weekend"),    // 0.0 = all weekday, 1.0 = all weekend
    avgQuerysPerWeek: real("avg_queries_per_week"),

    // --- Social ---
    referredBy: text("referred_by"),          // phoneHash of referrer
    referralCount: integer("referral_count").default(0),
    friendPhoneHashes: text("friend_phone_hashes").array(), // friends on platform

    // --- Engagement Score (0-100) ---
    // Calculated: queries(1pt) + forwards(5pt) + attendance(10pt) + reviews(15pt) + streak bonus
    engagementScore: real("engagement_score").default(0),
    engagementTier: text("engagement_tier").default("new"), // new|casual|active|power|ambassador

    // --- Profile metadata ---
    profileCompleteness: real("profile_completeness").default(0), // 0.0-1.0
    lastProfileUpdate: timestamp("last_profile_update", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_user_profiles_engagement").on(table.engagementScore),
    index("idx_user_profiles_tier").on(table.engagementTier),
  ]
);

// Time-series behavioral observations (one row per inferred preference per query)
// This is the RAW data that feeds into the aggregated user_profiles.
export const userBehaviors = pgTable(
  "user_behaviors",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    phoneHash: text("phone_hash").notNull(),
    observationType: text("observation_type").notNull(),
    // observation_type values:
    //   "category_interest" -> value = "music"
    //   "cuisine_preference" -> value = "japanese"
    //   "music_genre" -> value = "jazz"
    //   "price_signal" -> value = "low" | "high"
    //   "group_size" -> value = "4"
    //   "vibe_signal" -> value = "romantic"
    //   "time_preference" -> value = "night"
    //   "attendance_confirm" -> value = eventId
    //   "review_submitted" -> value = eventId
    observationValue: text("observation_value").notNull(),
    confidence: real("confidence").default(0.8),  // how confident was the extraction
    sourceQuery: text("source_query"),            // the original user message
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_user_behaviors_phone").on(table.phoneHash, table.createdAt),
    index("idx_user_behaviors_type").on(table.observationType),
  ]
);

/**
 * PROGRESSIVE COLLECTION IMPLEMENTATION
 *
 * Step 1: Enhance the classifier to extract more signals.
 *   Current ClassificationResult gets new optional fields:
 *
 *   interface ClassificationResult {
 *     // ... existing fields ...
 *     groupSize?: number;        // "para 4 personas" -> 4
 *     vibeHint?: string;         // "algo tranquilo" -> "chill"
 *     cuisineHint?: string;      // "comida japonesa" -> "japanese"
 *     musicGenreHint?: string;   // "jazz en vivo" -> "jazz"
 *   }
 *
 * Step 2: In the router (whatsapp/router.ts), after classification,
 *   call a new function `recordBehavioralSignals(phoneHash, classification)`.
 *   This inserts rows into user_behaviors for each detected signal.
 *
 * Step 3: A background job (every 6 hours) aggregates user_behaviors
 *   into user_profiles. Example:
 *     - Count observations by type -> top 3 become preferredCategories
 *     - Average group_size observations -> typicalGroupSize
 *     - Most common time_preference -> preferredTimeOfDay
 *
 * Step 4: After 10+ queries, we have a rich profile WITHOUT ever asking
 *   a single direct question. The onboarding flow (already exists) handles
 *   the basics (tourist/local, language, broad interests). Everything else
 *   is inferred.
 *
 * Step 5: Periodically (monthly), the bot can ask ONE targeted question
 *   to fill a gap: "Oye, noto que buscas mucha comida japonesa. Te gustan
 *   los bares de sake tambien?" -> fills a gap naturally.
 */


// ==========================================================================
// 2. SUBSCRIPTION / PREMIUM TIERS
// ==========================================================================
//
// DESIGN DECISIONS:
// - Subscriptions are managed in Supabase, NOT in Stripe alone.
//   Stripe is the payment processor; our DB is the source of truth.
// - Rate limiting is per-phoneHash, checked in the router before any
//   LLM call (cheap check: single DB read, cacheable in-memory).
// - Trial periods: 7-day free trial for Premium on first signup.
// - Upgrade flow: user asks "dame mas" beyond free limit -> bot says
//   "Has usado tus 5 consultas de hoy. Quieres desbloquear consultas
//   ilimitadas por $99 MXN/mes?" with a payment link button.

export const subscriptionTierEnum = pgEnum("subscription_tier", [
  "free",
  "premium",
  "vip",
]);

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "active",
  "trialing",
  "past_due",
  "canceled",
  "expired",
]);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    phoneHash: text("phone_hash").notNull().unique(),
    tier: subscriptionTierEnum("tier").default("free").notNull(),
    status: subscriptionStatusEnum("status").default("active").notNull(),

    // Stripe integration
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),

    // Billing
    currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),

    // Usage tracking for free tier rate limiting
    dailyQueryCount: integer("daily_query_count").default(0),
    dailyQueryResetAt: timestamp("daily_query_reset_at", { withTimezone: true }),

    // Cancellation
    canceledAt: timestamp("canceled_at", { withTimezone: true }),
    cancelReason: text("cancel_reason"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_subscriptions_stripe").on(table.stripeCustomerId),
    index("idx_subscriptions_tier").on(table.tier),
  ]
);

/**
 * RATE LIMITING IMPLEMENTATION
 *
 * Location: New middleware function in whatsapp/router.ts, called BEFORE
 * the LLM classifier. This is critical — the classifier costs ~0.5 cents
 * per call, so we gate it.
 *
 * ```typescript
 * async function checkRateLimit(phoneHash: string): Promise<{
 *   allowed: boolean;
 *   tier: "free" | "premium" | "vip";
 *   remaining: number;
 * }> {
 *   const sub = await getSubscription(phoneHash); // cached 5 min
 *
 *   if (sub.tier !== "free") {
 *     return { allowed: true, tier: sub.tier, remaining: Infinity };
 *   }
 *
 *   // Free tier: 5 queries per day
 *   const now = new Date();
 *   if (!sub.dailyQueryResetAt || sub.dailyQueryResetAt < startOfDay(now)) {
 *     await resetDailyCount(phoneHash);
 *     return { allowed: true, tier: "free", remaining: 5 };
 *   }
 *
 *   if (sub.dailyQueryCount >= 5) {
 *     return { allowed: false, tier: "free", remaining: 0 };
 *   }
 *
 *   await incrementDailyCount(phoneHash);
 *   return { allowed: true, tier: "free", remaining: 5 - sub.dailyQueryCount - 1 };
 * }
 * ```
 *
 * When `allowed === false`, the router sends an upsell message with a
 * Stripe payment link button instead of processing the query.
 *
 * TIER FEATURES MATRIX:
 *
 * | Feature                    | Free  | Premium ($99 MXN/mo) | VIP ($299 MXN/mo) |
 * |----------------------------|-------|----------------------|--------------------|
 * | Queries per day            | 5     | Unlimited            | Unlimited          |
 * | Daily digest               | Yes   | Yes (no ads)         | Yes (no ads)       |
 * | Priority event alerts      | No    | 1 hour early         | 3 hours early      |
 * | Plan builder               | No    | Yes                  | Yes                |
 * | Reservation assistance     | No    | Yes                  | Yes + priority     |
 * | Ads in digest              | Yes   | No                   | No                 |
 * | VIP event access           | No    | Yes                  | Yes                |
 * | Personal concierge         | No    | No                   | Yes (human+AI)     |
 * | Group planning tools       | No    | No                   | Yes                |
 * | Partner discounts          | No    | No                   | 10-20% off         |
 * | Event priority booking     | No    | No                   | Yes                |
 *
 * PRICING NOTE: $4.99 USD ~ $99 MXN and $14.99 USD ~ $299 MXN.
 * For Mexico/LatAm, pricing in MXN is critical. We use Stripe with
 * MXN currency support.
 */


// ==========================================================================
// 3. BUSINESS DASHBOARD (B2B Revenue)
// ==========================================================================
//
// DESIGN: Businesses authenticate via email+password (NOT WhatsApp).
// They get a separate web dashboard at /biz or a subdomain.
// The business entity links to venue/source data in the existing events system.
//
// Authentication: Supabase Auth (email/password). We store the Supabase
// auth user ID in `businesses.authUserId`. The admin dashboard already
// exists at /admin; the business dashboard is a NEW route at /biz.

export const businessTierEnum = pgEnum("business_tier", [
  "free",
  "featured",
  "premium_business",
]);

export const businessStatusEnum = pgEnum("business_status", [
  "pending",     // claimed, awaiting verification
  "active",
  "suspended",
]);

export const businesses = pgTable(
  "businesses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    authUserId: text("auth_user_id").unique(), // Supabase Auth user ID

    // Business info
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),  // URL-friendly name
    description: text("description"),
    category: text("category"),              // restaurant, bar, gallery, etc.
    address: text("address"),
    neighborhood: text("neighborhood"),
    city: text("city").default("San Miguel de Allende"),
    phone: text("phone"),
    email: text("email").notNull(),
    website: text("website"),
    instagramHandle: text("instagram_handle"),
    facebookPageUrl: text("facebook_page_url"),

    // Location
    latitude: real("latitude"),
    longitude: real("longitude"),
    googleMapsUrl: text("google_maps_url"),

    // Branding
    logoUrl: text("logo_url"),
    coverImageUrl: text("cover_image_url"),

    // Subscription
    tier: businessTierEnum("tier").default("free").notNull(),
    status: businessStatusEnum("status").default("pending").notNull(),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),

    // Link to existing sources table (for scraper integration)
    sourceId: uuid("source_id"),  // FK to sources.id

    // Verification
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    verifiedBy: text("verified_by"), // admin who verified

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_businesses_city").on(table.city),
    index("idx_businesses_tier").on(table.tier),
    uniqueIndex("idx_businesses_slug").on(table.slug),
  ]
);

// Events submitted by businesses (separate from scraped events)
export const businessEvents = pgTable(
  "business_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id").notNull(), // FK to businesses.id
    eventId: uuid("event_id"),                  // FK to events.id (created after approval)

    // Event details (before event is created in main table)
    title: text("title").notNull(),
    description: text("description"),
    eventDate: timestamp("event_date", { withTimezone: true }),
    eventEndDate: timestamp("event_end_date", { withTimezone: true }),
    category: text("category"),
    price: text("price"),
    imageUrl: text("image_url"),

    // Promotion settings (Featured/Premium only)
    isFeatured: boolean("is_featured").default(false),
    featuredUntil: timestamp("featured_until", { withTimezone: true }),
    pushNotificationSent: boolean("push_notification_sent").default(false),
    digestIncluded: boolean("digest_included").default(false),

    // Status
    status: text("status").default("pending"), // pending, approved, rejected, expired
    approvedAt: timestamp("approved_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_business_events_business").on(table.businessId),
    index("idx_business_events_featured").on(table.isFeatured),
  ]
);

// Analytics visible to businesses
export const businessAnalytics = pgTable(
  "business_analytics",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id").notNull(),
    eventId: uuid("event_id"),

    // Metrics
    metricType: text("metric_type").notNull(),
    // metric_type values:
    //   "impression"      -> event shown in search results
    //   "detail_view"     -> user asked for more details
    //   "click_source"    -> user clicked source URL
    //   "click_maps"      -> user clicked Google Maps link
    //   "share"           -> user shared the event
    //   "favorite"        -> user favorited the event
    //   "digest_view"     -> event included in digest
    //   "push_delivered"  -> push notification delivered
    //   "plan_included"   -> event included in a plan builder result

    // Optional demographic breakdown (anonymized, aggregated)
    userTier: text("user_tier"),       // engagement tier of the user
    userLanguage: text("user_language"),
    userIsTourist: boolean("user_is_tourist"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_biz_analytics_business").on(table.businessId, table.createdAt),
    index("idx_biz_analytics_event").on(table.eventId),
    index("idx_biz_analytics_type").on(table.metricType, table.createdAt),
  ]
);

// Direct messaging from business to interested users (Premium Business only)
export const businessMessages = pgTable(
  "business_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id").notNull(),
    phoneHash: text("phone_hash").notNull(),  // target user
    content: text("content").notNull(),
    status: text("status").default("pending"), // pending, sent, failed
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  }
);

/**
 * BUSINESS DASHBOARD ARCHITECTURE
 *
 * Route: /biz/*
 * Auth: Supabase Auth (email/password), NOT WhatsApp
 * Frontend: Server-rendered HTML (like existing /admin dashboard)
 *           or a separate lightweight React SPA at /biz
 *
 * Business authentication flow:
 *   1. Business visits /biz/register
 *   2. Fills form: business name, email, address, category
 *   3. Creates Supabase Auth account (email + password)
 *   4. We create a `businesses` row with status="pending"
 *   5. Admin reviews and verifies (sets status="active")
 *   6. Business can now log in at /biz/login and:
 *      - Submit events manually
 *      - See analytics (impressions, clicks)
 *      - Upgrade to Featured/Premium
 *
 * API Endpoints:
 *   POST /biz/api/register       -> create account
 *   POST /biz/api/login          -> Supabase auth
 *   GET  /biz/api/profile        -> business profile
 *   PUT  /biz/api/profile        -> update profile
 *   POST /biz/api/events         -> submit new event
 *   GET  /biz/api/events         -> list business events
 *   GET  /biz/api/analytics      -> analytics dashboard data
 *   POST /biz/api/upgrade        -> Stripe checkout for tier upgrade
 *   POST /biz/api/messages       -> send message to interested users (Premium)
 *
 * BUSINESS TIER FEATURES:
 *
 * | Feature                        | Free     | Featured ($49 USD/mo) | Premium ($149 USD/mo)  |
 * |--------------------------------|----------|-----------------------|------------------------|
 * | Claim venue page               | Yes      | Yes                   | Yes                    |
 * | Submit events                  | 3/month  | Unlimited             | Unlimited              |
 * | Basic analytics (views/clicks) | Yes      | Yes                   | Yes                    |
 * | Events shown first in results  | No       | Yes                   | Yes                    |
 * | Highlighted in daily digest    | No       | Yes                   | Yes                    |
 * | "Sponsored" badge              | No       | Yes                   | Yes                    |
 * | Push notification to users     | No       | 2/month               | Unlimited              |
 * | Demographic analytics          | No       | Yes                   | Yes                    |
 * | Direct messaging to users      | No       | No                    | Yes                    |
 * | Reservation integration        | No       | No                    | Yes                    |
 * | Custom promotions              | No       | No                    | Yes                    |
 * | Monthly insight report          | No       | No                    | Yes                    |
 * | AI account manager             | No       | No                    | Yes                    |
 *
 * FEATURED EVENT BOOSTING (search integration):
 *
 * In events/repository.ts searchEvents(), when building the ORDER BY,
 * we add a boost for events from Featured/Premium businesses:
 *
 *   ORDER BY
 *     CASE WHEN be.is_featured AND be.featured_until > NOW() THEN 1 ELSE 0 END DESC,
 *     COALESCE(freshness_score, 0.5) * COALESCE(confidence, 0.5) DESC,
 *     event_date ASC
 *
 * This requires a LEFT JOIN to business_events.
 */


// ==========================================================================
// 4. PLAN BUILDER (the killer feature)
// ==========================================================================
//
// "Plan my Saturday night for 4 people, budget $2000 pesos, we like jazz
//  and good food"
//
// TECHNICAL APPROACH: Multi-step LLM chain with structured tool use.
// NOT a single prompt. Each step validates and enriches the previous.

export const planStatusEnum = pgEnum("plan_status", [
  "building",     // LLM is generating
  "draft",        // ready for user review
  "confirmed",    // user accepted
  "modified",     // user requested changes
  "completed",    // all events attended
  "canceled",
]);

export const plans = pgTable(
  "plans",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    phoneHash: text("phone_hash").notNull(),

    // Input
    originalRequest: text("original_request").notNull(),
    date: timestamp("date", { withTimezone: true }),
    groupSize: integer("group_size").default(1),
    budgetMxn: integer("budget_mxn"),
    preferences: jsonb("preferences"),
    // preferences shape: { cuisines: string[], musicGenres: string[],
    //   vibes: string[], avoid: string[] }

    // Output
    status: planStatusEnum("status").default("building").notNull(),
    totalEstimatedCostMxn: integer("total_estimated_cost_mxn"),
    totalDurationMinutes: integer("total_duration_minutes"),

    // Sharing
    shareCode: text("share_code").unique(),  // 6-char code for group sharing
    groupPhoneHashes: text("group_phone_hashes").array(), // friends in the plan

    // Metadata
    llmModelUsed: text("llm_model_used"),
    generationTimeMs: integer("generation_time_ms"),
    userRating: integer("user_rating"),  // 1-5 stars
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_plans_phone").on(table.phoneHash),
    index("idx_plans_share").on(table.shareCode),
  ]
);

export const planSteps = pgTable(
  "plan_steps",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    planId: uuid("plan_id").notNull(),  // FK to plans.id
    stepOrder: integer("step_order").notNull(),

    // Step details
    stepType: text("step_type").notNull(),
    // "dinner", "bar", "show", "walk", "drinks", "activity", "transport"
    title: text("title").notNull(),
    venueName: text("venue_name"),
    venueAddress: text("venue_address"),
    startTime: text("start_time"),           // "19:00"
    endTime: text("end_time"),               // "20:30"
    durationMinutes: integer("duration_minutes"),
    estimatedCostMxn: integer("estimated_cost_mxn"), // per person
    estimatedCostTotalMxn: integer("estimated_cost_total_mxn"),

    // Linked to existing data
    eventId: uuid("event_id"),       // FK to events.id if applicable
    businessId: uuid("business_id"), // FK to businesses.id if applicable

    // Transit between steps
    transitMode: text("transit_mode"),        // "walk", "taxi", "uber"
    transitDurationMinutes: integer("transit_duration_minutes"),
    transitDistanceKm: real("transit_distance_km"),

    // Reservation
    reservationStatus: text("reservation_status"),
    // "not_needed", "suggested", "pending", "confirmed", "failed"
    reservationPhone: text("reservation_phone"),
    reservationUrl: text("reservation_url"),

    // Details
    description: text("description"),
    whyIncluded: text("why_included"), // "Great jazz venue, matches your preference"
    priceRange: text("price_range"),   // "$", "$$", "$$$"
    googleMapsUrl: text("google_maps_url"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_plan_steps_plan").on(table.planId, table.stepOrder),
  ]
);

/**
 * PLAN BUILDER — TECHNICAL IMPLEMENTATION
 *
 * The plan builder uses a multi-step LLM chain. This is NOT a single massive
 * prompt. Each step is a focused LLM call with specific tools.
 *
 * ┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
 * │  1. PARSE    │ --> │  2. SEARCH   │ --> │  3. PLAN     │ --> │  4. PRESENT  │
 * │  REQUEST     │     │  & MATCH     │     │  & OPTIMIZE  │     │  & ITERATE   │
 * └──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
 *
 * STEP 1: PARSE REQUEST (Haiku — fast, cheap)
 *
 *   Input: "Plan my Saturday night for 4 people, budget $2000 pesos,
 *           we like jazz and good food"
 *
 *   LLM extracts:
 *   {
 *     date: "2026-04-11",        // next Saturday
 *     groupSize: 4,
 *     budgetMxn: 2000,           // total for group
 *     budgetPerPersonMxn: 500,   // derived
 *     timeStart: "19:00",        // "night" -> 19:00 default
 *     timeEnd: "01:00",          // night ends late
 *     preferences: {
 *       cuisines: ["mexican", "fine_dining"],
 *       musicGenres: ["jazz"],
 *       vibes: ["social", "chill"],
 *       mustInclude: [],
 *       avoid: []
 *     }
 *   }
 *
 *   Cost: ~$0.001 (Haiku)
 *
 * STEP 2: SEARCH & MATCH (Database + Knowledge Base)
 *
 *   No LLM call. Pure database queries:
 *
 *   a) Search events for that date matching jazz/music
 *      -> searchEvents({ dateFrom, dateTo, category: "music" })
 *
 *   b) Search events for food/dining
 *      -> searchEvents({ dateFrom, dateTo, category: "food" })
 *
 *   c) Load venue knowledge base for restaurants, bars, activities
 *      -> getLocalKnowledge() filtered by cuisine, price range
 *
 *   d) Fetch Google Maps distance matrix between top candidate venues
 *      -> getDistanceMatrix(origins, destinations)
 *      NOTE: This uses Google Maps Distance Matrix API.
 *      For MVP, use a precomputed lookup table for SMA venues
 *      (the city is small, ~50 key venues, 2500 pairs).
 *
 *   Cost: ~$0 (DB queries only, Google Maps ~$0.005 per element)
 *
 * STEP 3: PLAN & OPTIMIZE (Sonnet — reasoning needed)
 *
 *   Input: parsed request + candidate events + venue data + distances
 *
 *   System prompt: "You are a local concierge in San Miguel de Allende.
 *     Build an evening plan that respects the budget, minimizes walking
 *     between venues, and creates a natural flow (dinner -> activity ->
 *     drinks). Consider venue opening hours, price ranges, and group size."
 *
 *   Tools available to the LLM (Claude tool_use):
 *     - check_availability(venue, date, time, partySize) -> boolean
 *     - estimate_cost(venue, partySize, duration) -> { min, max, avg }
 *     - get_walking_time(from, to) -> minutes
 *     - get_venue_details(venueName) -> { hours, priceRange, vibe, ... }
 *
 *   Output: structured plan with steps, times, costs, transit.
 *
 *   Cost: ~$0.02 (Sonnet with tool use)
 *
 * STEP 4: PRESENT & ITERATE (WhatsApp formatting)
 *
 *   No LLM call. Format the plan into WhatsApp messages:
 *
 *   Message 1 (header):
 *   "Tu plan para el sabado 🌙
 *    4 personas | Presupuesto: $2,000 MXN
 *    Duracion estimada: 6 horas"
 *
 *   Message 2-N (one per step):
 *   "1. Cena en La Posadita — 7:00 PM
 *      Cocina mexicana | $$$
 *      ~$350/persona
 *      Reservacion sugerida: 415-152-0839
 *      📍 maps.google.com/...
 *
 *      🚶 10 min caminando al siguiente"
 *
 *   Message N+1 (summary):
 *   "Costo total estimado: $1,800 MXN ($450/persona)
 *    Tiempo total: 5h 30min
 *
 *    [Confirmar plan] [Modificar] [Nuevo plan]"
 *
 *   If user taps "Modificar", we go back to Step 3 with their feedback.
 *   This uses the existing interactive buttons system.
 *
 * RESERVATION INTEGRATION:
 *
 * For MVP, we provide phone numbers and suggest users call/WhatsApp directly.
 * Phase 2: Integrate with OpenTable (limited in Mexico) or direct WhatsApp
 * Business API to send reservation requests to venue WhatsApp numbers.
 * Phase 3: Build a simple reservation system where businesses on our Premium
 * tier can accept reservations through the dashboard.
 *
 * DISTANCE/TIME CALCULATIONS:
 *
 * San Miguel de Allende is a compact city. Most restaurants/bars in Centro
 * are within 15 minutes walking distance. We precompute a venue-to-venue
 * walking time lookup table:
 *
 *   venues_distance_matrix: {
 *     "La Posadita -> Raindog": { walkMinutes: 8, distanceKm: 0.6 },
 *     "Raindog -> ALTAR Terraza": { walkMinutes: 5, distanceKm: 0.4 },
 *     ...
 *   }
 *
 * Stored as a JSON file or in a small DB table. Updated monthly.
 * For unknown pairs, estimate: SMA Centro average = 1 km / 12 min walk.
 *
 * GROUP COORDINATION:
 *
 * When a plan is confirmed, the bot generates a share code (e.g., "JAZZ42").
 * The creator shares it with friends. Friends text the bot: "plan JAZZ42"
 * and get the full itinerary. Each person's attendance is tracked.
 *
 * The VIP tier adds: a shared WhatsApp group where the bot posts the
 * plan, sends reminders 1 hour before each step, and updates if plans
 * change (e.g., "It's raining, La Posadita's terrace might be closed.
 * Want to switch to Lavanda?")
 */

// Precomputed venue distance matrix
export const venueDistances = pgTable(
  "venue_distances",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    venueA: text("venue_a").notNull(),  // venue name
    venueB: text("venue_b").notNull(),  // venue name
    walkMinutes: integer("walk_minutes"),
    driveMinutes: integer("drive_minutes"),
    distanceKm: real("distance_km"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_venue_distances_a").on(table.venueA),
    index("idx_venue_distances_b").on(table.venueB),
  ]
);


// ==========================================================================
// 5. ENGAGEMENT HOOKS (Gamification)
// ==========================================================================

export const badgeTypeEnum = pgEnum("badge_type", [
  "foodie_explorer",    // visited/queried 10+ food events
  "night_owl",          // 10+ nightlife queries after 8pm
  "culture_vulture",    // 10+ culture events
  "early_bird",         // 10+ morning queries
  "social_butterfly",   // referred 3+ friends
  "local_expert",       // 50+ queries answered
  "streak_7",           // 7-day streak
  "streak_30",          // 30-day streak
  "first_plan",         // created first plan
  "plan_master",        // created 5+ plans
  "reviewer",           // submitted 5+ reviews
  "trendsetter",        // forwarded 10+ events
  "ambassador",         // referred 10+ friends who became active
  "vip_member",         // upgraded to VIP
  "founding_member",    // one of first 100 users
]);

// Points ledger (append-only for auditability)
export const pointsLedger = pgTable(
  "points_ledger",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    phoneHash: text("phone_hash").notNull(),

    // Action that earned points
    action: text("action").notNull(),
    // action values:
    //   "query"         -> 1 point
    //   "forward_event" -> 5 points
    //   "attend_event"  -> 10 points
    //   "review_event"  -> 15 points
    //   "refer_friend"  -> 50 points
    //   "streak_bonus"  -> variable
    //   "badge_earned"  -> 25 points
    //   "plan_created"  -> 10 points
    //   "plan_completed"-> 20 points
    //   "redeem"        -> negative points

    points: integer("points").notNull(),  // positive = earned, negative = spent
    balance: integer("balance").notNull(), // running balance after this transaction
    description: text("description"),
    referenceId: text("reference_id"),     // eventId, badgeId, etc.
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_points_phone").on(table.phoneHash, table.createdAt),
    index("idx_points_action").on(table.action),
  ]
);

// User badges (earned achievements)
export const userBadges = pgTable(
  "user_badges",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    phoneHash: text("phone_hash").notNull(),
    badge: badgeTypeEnum("badge").notNull(),
    earnedAt: timestamp("earned_at", { withTimezone: true }).defaultNow(),
    notified: boolean("notified").default(false), // whether user was told
  },
  (table) => [
    index("idx_user_badges_phone").on(table.phoneHash),
    uniqueIndex("idx_user_badges_unique").on(table.phoneHash, table.badge),
  ]
);

// Streak tracking
export const userStreaks = pgTable(
  "user_streaks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    phoneHash: text("phone_hash").notNull().unique(),
    currentStreak: integer("current_streak").default(0),
    longestStreak: integer("longest_streak").default(0),
    lastActiveDate: text("last_active_date"), // "2026-04-04" in SMA timezone
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  }
);

// Referrals tracking
export const referrals = pgTable(
  "referrals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    referrerPhoneHash: text("referrer_phone_hash").notNull(),
    referredPhoneHash: text("referred_phone_hash").notNull(),
    referralCode: text("referral_code").notNull(),
    status: text("status").default("pending"),
    // "pending" = referred user registered but not active yet
    // "active"  = referred user made 3+ queries (reward triggers)
    // "rewarded" = referrer got the points
    rewardedAt: timestamp("rewarded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_referrals_referrer").on(table.referrerPhoneHash),
    uniqueIndex("idx_referrals_referred").on(table.referredPhoneHash),
    index("idx_referrals_code").on(table.referralCode),
  ]
);

// Event attendance tracking (for points + analytics)
export const eventAttendance = pgTable(
  "event_attendance",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    phoneHash: text("phone_hash").notNull(),
    eventId: uuid("event_id").notNull(),
    status: text("status").default("interested"),
    // "interested" -> user showed interest (queried/saved)
    // "going"      -> user confirmed going
    // "attended"   -> confirmed attended (self-reported or location)
    // "no_show"    -> marked going but didn't attend
    rating: integer("rating"),       // 1-5
    review: text("review"),          // brief text review
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_attendance_phone").on(table.phoneHash),
    index("idx_attendance_event").on(table.eventId),
    uniqueIndex("idx_attendance_unique").on(table.phoneHash, table.eventId),
  ]
);

// Leaderboard (materialized, refreshed every hour)
export const leaderboard = pgTable(
  "leaderboard",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    phoneHash: text("phone_hash").notNull(),
    displayName: text("display_name"),  // optional anonymous name
    totalPoints: integer("total_points").default(0),
    rank: integer("rank"),
    period: text("period").notNull(),   // "2026-04" (monthly), "2026-W14" (weekly)
    periodType: text("period_type").notNull(), // "monthly" | "weekly"
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_leaderboard_period").on(table.period, table.rank),
    uniqueIndex("idx_leaderboard_unique").on(table.phoneHash, table.period),
  ]
);

/**
 * ENGAGEMENT HOOKS — IMPLEMENTATION APPROACH
 *
 * 1. STREAK COUNTER
 *    Location: whatsapp/router.ts (after successful message processing)
 *
 *    ```typescript
 *    async function updateStreak(phoneHash: string): Promise<{
 *      streak: number;
 *      isNewStreak: boolean;
 *      milestones: number[];  // [7, 30] if crossed
 *    }> {
 *      const smaNow = getSMADate();
 *      const todayStr = smaNow.toISOString().split("T")[0]; // "2026-04-04"
 *
 *      const streakRecord = await getStreak(phoneHash);
 *
 *      if (streakRecord.lastActiveDate === todayStr) {
 *        // Already counted today
 *        return { streak: streakRecord.currentStreak, isNewStreak: false, milestones: [] };
 *      }
 *
 *      const yesterday = new Date(smaNow);
 *      yesterday.setDate(yesterday.getDate() - 1);
 *      const yesterdayStr = yesterday.toISOString().split("T")[0];
 *
 *      let newStreak: number;
 *      if (streakRecord.lastActiveDate === yesterdayStr) {
 *        newStreak = streakRecord.currentStreak + 1;
 *      } else {
 *        newStreak = 1; // streak broken
 *      }
 *
 *      await updateStreakRecord(phoneHash, newStreak, todayStr);
 *
 *      const milestones = [];
 *      if (newStreak === 7) milestones.push(7);
 *      if (newStreak === 30) milestones.push(30);
 *
 *      return { streak: newStreak, isNewStreak: true, milestones };
 *    }
 *    ```
 *
 *    When milestones are hit, the bot sends a celebration message AFTER
 *    the normal response:
 *    "🔥 7 dias seguidos explorando SMA! +25 puntos bonus"
 *
 * 2. BADGES
 *    Checked by a background job (every 2 hours) that scans user_behaviors
 *    and analytics to detect badge qualification:
 *
 *    - foodie_explorer: COUNT(behaviors WHERE type='category_interest' AND value='food') >= 10
 *    - night_owl: COUNT(analytics WHERE EXTRACT(HOUR FROM created_at) >= 20) >= 10
 *    - culture_vulture: similar for culture category
 *    - social_butterfly: referral_count >= 3
 *    - local_expert: queryCount >= 50
 *    - streak_7: currentStreak >= 7
 *    - streak_30: currentStreak >= 30
 *    - founding_member: firstSeenAt < '2026-05-01' (first 100 users)
 *
 *    New badges are sent as WhatsApp messages:
 *    "🏅 Nuevo logro: *Foodie Explorer*
 *     Has explorado 10+ eventos de comida. +25 puntos"
 *
 * 3. POINTS SYSTEM
 *    Points are awarded in real-time (not batch):
 *    - After each query: +1 point (in router.ts)
 *    - After forwarding event: +5 points (in forward handler)
 *    - After self-reporting attendance: +10 points (new handler)
 *    - After submitting review: +15 points (new handler)
 *    - After friend becomes active via referral: +50 points (background job)
 *
 *    The points_ledger is append-only. The balance column is a running
 *    total for fast reads. We never UPDATE the ledger, only INSERT.
 *
 * 4. LEADERBOARD
 *    Updated hourly by a background job. Top 10 shown on request:
 *    "🏆 Top exploradores en SMA - Abril
 *     1. Explorer_42 — 320 pts
 *     2. NightOwl_17 — 285 pts
 *     3. Tu — 240 pts (#3!)
 *     ..."
 *
 *    Users are anonymous by default (auto-generated display name).
 *    They can set a custom display name: "llamame NightHawk"
 *
 * 5. REFERRAL REWARDS
 *    Flow:
 *    a) User says "invitar amigo" -> bot generates unique referral code
 *       (e.g., "SMA-JAZZ42") and shareable message with the code.
 *    b) Friend signs up and texts "SMA-JAZZ42" as first message
 *       -> referrals row created with status="pending"
 *    c) After friend makes 3+ queries -> status="active"
 *       -> referrer gets +50 points
 *       -> if referrer is free tier, gets 1 week premium trial
 *    d) referrer gets notification: "Tu amigo se unio! +50 puntos"
 *
 *    Stored in referrals table. The referral code is part of the
 *    wa.me link: wa.me/12058920417?text=SMA-JAZZ42
 */


// ==========================================================================
// 6. PAYMENT INTEGRATION
// ==========================================================================
//
// RECOMMENDATION FOR MEXICO/LATAM: Stripe Checkout via payment links.
//
// Why NOT WhatsApp Pay:
//   - WhatsApp Pay is only available in Brazil and India as of 2026.
//   - Mexico does not have WhatsApp Pay.
//
// Why NOT in-chat payment:
//   - WhatsApp Business API supports template messages with payment buttons
//     only via specific partners (not generally available in Mexico).
//   - Requires Meta Business verification + payment provider integration.
//
// RECOMMENDED APPROACH: Stripe Checkout Session
//
// Flow:
//   1. User hits rate limit or asks to upgrade
//   2. Bot sends: "Desbloquea Premium por $99/mes"
//      With an interactive button: [Suscribirme $99/mes]
//   3. Button tap triggers creation of Stripe Checkout Session
//   4. Bot sends the checkout URL as a clickable link
//   5. User completes payment in mobile browser (Stripe handles MXN)
//   6. Stripe webhook hits our server -> activates subscription
//
// STRIPE SETUP:
//   - Currency: MXN
//   - Products: "Premium" ($99 MXN/mo), "VIP" ($299 MXN/mo)
//   - Business products: "Featured" ($999 MXN/mo), "Premium Business" ($2,999 MXN/mo)
//   - Payment methods: Cards (Visa/MC), OXXO (cash pay at convenience stores!)
//   - OXXO is critical for Mexico — many users don't have credit cards
//
// ENV VARS (add to config.ts):
//   STRIPE_SECRET_KEY: string
//   STRIPE_WEBHOOK_SECRET: string
//   STRIPE_PREMIUM_PRICE_ID: string
//   STRIPE_VIP_PRICE_ID: string
//   STRIPE_BIZ_FEATURED_PRICE_ID: string
//   STRIPE_BIZ_PREMIUM_PRICE_ID: string

export const paymentEvents = pgTable(
  "payment_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    phoneHash: text("phone_hash"),
    businessId: uuid("business_id"),

    // Stripe event data
    stripeEventId: text("stripe_event_id").notNull().unique(),
    stripeEventType: text("stripe_event_type").notNull(),
    // "checkout.session.completed", "invoice.paid", "customer.subscription.updated",
    // "customer.subscription.deleted", "invoice.payment_failed"

    // Payment details
    amountMxn: integer("amount_mxn"),
    currency: text("currency").default("mxn"),
    paymentMethod: text("payment_method"),  // "card", "oxxo"
    status: text("status").notNull(),       // "succeeded", "failed", "pending"

    rawPayload: jsonb("raw_payload"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_payment_events_phone").on(table.phoneHash),
    index("idx_payment_events_stripe").on(table.stripeEventId),
  ]
);

/**
 * STRIPE INTEGRATION — API ENDPOINTS
 *
 * POST /api/stripe/checkout
 *   Body: { phoneHash, tier: "premium" | "vip" }
 *   Returns: { checkoutUrl: "https://checkout.stripe.com/..." }
 *
 *   Implementation:
 *   ```typescript
 *   async function createCheckoutSession(phoneHash: string, tier: string) {
 *     const stripe = new Stripe(config.STRIPE_SECRET_KEY);
 *
 *     const priceId = tier === "vip"
 *       ? config.STRIPE_VIP_PRICE_ID
 *       : config.STRIPE_PREMIUM_PRICE_ID;
 *
 *     const session = await stripe.checkout.sessions.create({
 *       mode: "subscription",
 *       payment_method_types: ["card", "oxxo"],
 *       line_items: [{ price: priceId, quantity: 1 }],
 *       currency: "mxn",
 *       success_url: `https://whatsapplocal.com/success?session_id={CHECKOUT_SESSION_ID}`,
 *       cancel_url: `https://whatsapplocal.com/cancel`,
 *       metadata: { phoneHash },
 *       locale: "es",
 *     });
 *
 *     return session.url;
 *   }
 *   ```
 *
 * POST /api/stripe/webhook
 *   Stripe sends events here. Handles:
 *   - checkout.session.completed -> activate subscription
 *   - invoice.paid -> extend subscription period
 *   - invoice.payment_failed -> mark past_due, send WhatsApp reminder
 *   - customer.subscription.deleted -> mark canceled
 *
 *   Implementation:
 *   ```typescript
 *   async function handleStripeWebhook(event: Stripe.Event) {
 *     switch (event.type) {
 *       case "checkout.session.completed": {
 *         const session = event.data.object;
 *         const phoneHash = session.metadata.phoneHash;
 *         const subscriptionId = session.subscription;
 *
 *         await db.update(subscriptions).set({
 *           tier: determineTier(session),
 *           status: "active",
 *           stripeCustomerId: session.customer,
 *           stripeSubscriptionId: subscriptionId,
 *           currentPeriodStart: new Date(),
 *           currentPeriodEnd: addMonths(new Date(), 1),
 *         }).where(eq(subscriptions.phoneHash, phoneHash));
 *
 *         // Send confirmation via WhatsApp
 *         await sendTextMessage(phoneForHash, "Listo! Tu suscripcion Premium esta activa...");
 *         break;
 *       }
 *       // ... other cases
 *     }
 *   }
 *   ```
 *
 * OXXO PAYMENT FLOW (Mexico-specific):
 *   User selects OXXO at checkout -> Stripe generates a voucher with barcode.
 *   User screenshots the voucher, goes to any OXXO store, pays at register.
 *   Stripe receives payment confirmation (can take 1-3 days).
 *   Our webhook activates the subscription.
 *   Bot sends: "Tu pago en OXXO fue confirmado! Premium activo."
 *
 * PHONE HASH REVERSE LOOKUP:
 *   Currently, the system stores phone_hash (one-way) for privacy.
 *   For payment, we need the actual phone number to:
 *   a) Send WhatsApp confirmations
 *   b) Link Stripe checkout back to the user
 *
 *   SOLUTION: Store an encrypted phone number alongside the hash.
 *   Add to users table: `phone_encrypted TEXT` using AES-256-GCM
 *   with a separate PHONE_ENCRYPTION_KEY env var.
 *   The hash remains for indexing; the encrypted value for recovery.
 *
 *   Alternative: During checkout, the user provides their WhatsApp number
 *   on the Stripe checkout page (pre-filled from metadata).
 */


// ==========================================================================
// 7. NEW API ENDPOINTS SUMMARY
// ==========================================================================
//
// All endpoints are added as new Express routers, following the existing
// pattern (createAdminRouter, createWebhookRouter).
//
// USER / SUBSCRIPTION ENDPOINTS (for WhatsApp bot integration):
//   POST /api/stripe/checkout         -> create checkout session
//   POST /api/stripe/webhook          -> Stripe webhook handler
//   GET  /api/subscription/:phoneHash -> get subscription status (internal)
//
// BUSINESS DASHBOARD ENDPOINTS:
//   GET  /biz                         -> business dashboard HTML
//   POST /biz/api/register            -> register business
//   POST /biz/api/login               -> authenticate
//   GET  /biz/api/profile             -> get business profile
//   PUT  /biz/api/profile             -> update business profile
//   POST /biz/api/events              -> submit event
//   GET  /biz/api/events              -> list business events
//   PUT  /biz/api/events/:id          -> update event
//   GET  /biz/api/analytics           -> analytics data
//   GET  /biz/api/analytics/export    -> CSV export (Premium)
//   POST /biz/api/messages            -> send DM to users (Premium)
//   POST /biz/api/stripe/checkout     -> upgrade business tier
//
// ENGAGEMENT ENDPOINTS (internal, called by bot handlers):
//   GET  /api/engagement/:phoneHash   -> get points, badges, streak
//   GET  /api/leaderboard/:period     -> get leaderboard
//
// PLAN BUILDER (internal, called by plan handler):
//   POST /api/plans                   -> create plan (async)
//   GET  /api/plans/:id               -> get plan
//   POST /api/plans/:id/confirm       -> confirm plan
//   POST /api/plans/:id/modify        -> request modification
//
// NEW WHATSAPP INTENTS (add to classifier):
//   "plan_request"    -> triggers plan builder
//   "upgrade"         -> triggers subscription upsell
//   "my_points"       -> shows points and badges
//   "leaderboard"     -> shows leaderboard
//   "rate_event"      -> triggers event rating flow
//   "my_plan"         -> shows active plan
//   "referral_code"   -> generates referral code


// ==========================================================================
// 8. IMPLEMENTATION PRIORITY ORDER
// ==========================================================================
//
// Phase 1 — FOUNDATION (Weeks 1-2)
// ─────────────────────────────────
// Revenue: $0 (but enables everything else)
//
//   1a. Add phone_encrypted to users table (needed for payments + digest)
//   1b. Create subscriptions table + basic free tier rate limiting
//   1c. Add rate limit check in router.ts (before classifier call)
//   1d. Add upsell message when rate limit hit
//       "Has usado tus 5 consultas hoy. Desbloquea ilimitado por $99/mes"
//       [Suscribirme] button
//
// Phase 2 — PAYMENTS (Weeks 2-3)
// ──────────────────────────────
// Revenue: First paying users
//
//   2a. Stripe integration: checkout session creation + webhook handler
//   2b. Subscription management: activate/cancel/expire
//   2c. OXXO support for Mexico (comes with Stripe MXN)
//   2d. Success/cancellation landing pages
//   2e. Payment confirmation WhatsApp messages
//
// Phase 3 — ENGAGEMENT v1 (Weeks 3-4)
// ────────────────────────────────────
// Revenue: Increases retention -> more upgrades
//
//   3a. Streak tracking (simple, high-impact)
//   3b. Points system (ledger + basic actions: query, forward)
//   3c. Referral system (code generation, tracking, reward)
//   3d. Enhance invite handler to use referral codes
//
// Phase 4 — USER PROFILES (Weeks 4-5)
// ────────────────────────────────────
// Revenue: Better recommendations -> higher engagement -> more upgrades
//
//   4a. Create user_profiles + user_behaviors tables
//   4b. Enhance classifier to extract group_size, vibe, cuisine hints
//   4c. Record behavioral signals in router.ts
//   4d. Background job to aggregate behaviors into profiles
//   4e. Use profiles to boost event search results
//
// Phase 5 — PLAN BUILDER MVP (Weeks 5-7)
// ───────────────────────────────────────
// Revenue: The killer upgrade motivator (Premium-only feature)
//
//   5a. Parse request step (Haiku)
//   5b. Search & match step (DB queries)
//   5c. Plan generation step (Sonnet with structured output)
//   5d. WhatsApp formatting + interactive buttons
//   5e. Venue distance lookup table for SMA
//   5f. Group sharing via share codes
//
// Phase 6 — BUSINESS DASHBOARD (Weeks 7-10)
// ──────────────────────────────────────────
// Revenue: B2B recurring revenue ($49-$149/mo per business)
//
//   6a. Business registration + auth (Supabase Auth)
//   6b. Business dashboard HTML (server-rendered)
//   6c. Event submission + moderation
//   6d. Basic analytics (impressions, clicks)
//   6e. Featured event boosting in search results
//   6f. Stripe integration for business tiers
//   6g. Daily digest integration (featured events highlighted)
//
// Phase 7 — ENGAGEMENT v2 (Weeks 10-12)
// ──────────────────────────────────────
// Revenue: Viral growth through gamification
//
//   7a. Badge system (background job + notification)
//   7b. Leaderboard (hourly refresh + display)
//   7c. Event attendance tracking + reviews
//   7d. Points redemption (1 free premium week = 200 pts)
//   7e. Enhanced engagement scoring
//
// Phase 8 — ADVANCED FEATURES (Weeks 12+)
// ────────────────────────────────────────
// Revenue: VIP tier + advanced B2B
//
//   8a. Plan builder: reservation integration (WhatsApp Business)
//   8b. VIP concierge: human-in-the-loop for VIP users
//   8c. Business direct messaging to users
//   8d. Business monthly insight reports (AI-generated)
//   8e. Partner discount system
//   8f. Group planning in WhatsApp groups (VIP)
//
//
// ESTIMATED MONTHLY REVENUE AT SCALE (500 users, 20 businesses):
//
//   Consumer subscriptions:
//     50 Premium users x $99 MXN     = $4,950 MXN (~$250 USD)
//     10 VIP users x $299 MXN        = $2,990 MXN (~$150 USD)
//
//   Business subscriptions:
//     10 Featured x $999 MXN         = $9,990 MXN (~$500 USD)
//     5 Premium Business x $2,999 MXN = $14,995 MXN (~$750 USD)
//
//   Digest advertising (non-paying businesses):
//     Daily digest ad slots x 30 days = ~$3,000 MXN (~$150 USD)
//
//   TOTAL: ~$35,925 MXN/month (~$1,800 USD/month)
//
//   At 2000 users + 50 businesses (12 months):
//     ~$150,000 MXN/month (~$7,500 USD/month)
//
//
// COST STRUCTURE (monthly at 500 users):
//
//   Anthropic API:
//     Classifier (Haiku): 500 users x 5 queries/day x 30 = 75K calls
//       x $0.001/call = $75 USD
//     Responder (Sonnet): ~30K calls x $0.02/call = $600 USD
//     Plan builder (Sonnet): ~500 plans x $0.05/plan = $25 USD
//     Total: ~$700 USD/month
//
//   Supabase: Pro plan $25 USD/month
//   Railway hosting: ~$20 USD/month
//   Stripe fees: 3.6% + $3 MXN per transaction
//   Kapso WhatsApp: depends on message volume, ~$50 USD/month
//
//   TOTAL COST: ~$800 USD/month
//   NET MARGIN at 500 users: ~$1,000 USD/month (56%)
//   NET MARGIN at 2000 users: ~$6,200 USD/month (83%)


// ==========================================================================
// TYPE EXPORTS (for use in the codebase)
// ==========================================================================

export type UserProfile = typeof userProfiles.$inferSelect;
export type NewUserProfile = typeof userProfiles.$inferInsert;
export type UserBehavior = typeof userBehaviors.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type Business = typeof businesses.$inferSelect;
export type NewBusiness = typeof businesses.$inferInsert;
export type BusinessEvent = typeof businessEvents.$inferSelect;
export type BusinessAnalytic = typeof businessAnalytics.$inferSelect;
export type Plan = typeof plans.$inferSelect;
export type NewPlan = typeof plans.$inferInsert;
export type PlanStep = typeof planSteps.$inferSelect;
export type PointsEntry = typeof pointsLedger.$inferSelect;
export type UserBadge = typeof userBadges.$inferSelect;
export type UserStreak = typeof userStreaks.$inferSelect;
export type Referral = typeof referrals.$inferSelect;
export type EventAttendanceRecord = typeof eventAttendance.$inferSelect;
export type LeaderboardEntry = typeof leaderboard.$inferSelect;
export type PaymentEvent = typeof paymentEvents.$inferSelect;
