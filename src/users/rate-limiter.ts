import { eq, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { users } from "../db/schema.js";

/** Free tier daily query limit */
const FREE_TIER_DAILY_LIMIT = 12;

/**
 * Get the start of today in SMA time (UTC-6).
 * SMA (San Miguel de Allende) is in Central Standard Time (UTC-6).
 * We use a fixed offset to avoid timezone library dependencies.
 */
function getSmaDayStart(now: Date): Date {
  // Shift to SMA local time by subtracting 6 hours
  const smaLocal = new Date(now.getTime() - 6 * 3600000);
  // Get start of that SMA day (midnight SMA = 06:00 UTC)
  const dayStart = new Date(smaLocal);
  dayStart.setUTCHours(0, 0, 0, 0);
  // Shift back to UTC: midnight SMA = UTC+6h
  return new Date(dayStart.getTime() + 6 * 3600000);
}

export async function checkRateLimit(phoneHash: string): Promise<{
  allowed: boolean;
  remaining: number;
  tier: "free" | "premium" | "vip";
}> {
  const db = getDb();
  const now = new Date();
  const smaDayStart = getSmaDayStart(now);

  // For now, all users are "free" tier (no subscriptions table yet)
  const tier = "free" as const;

  const [user] = await db
    .select({
      dailyQueryCount: users.dailyQueryCount,
      dailyQueryResetAt: users.dailyQueryResetAt,
    })
    .from(users)
    .where(eq(users.phoneHash, phoneHash))
    .limit(1);

  if (!user) {
    // User not found — allow (will be created by upsertUser)
    return { allowed: true, remaining: FREE_TIER_DAILY_LIMIT, tier };
  }

  // Check if we need to reset the daily counter (new SMA day)
  if (!user.dailyQueryResetAt || user.dailyQueryResetAt < smaDayStart) {
    // Reset counter and set the reset timestamp to start of current SMA day
    await db
      .update(users)
      .set({
        dailyQueryCount: 1,
        dailyQueryResetAt: smaDayStart,
      })
      .where(eq(users.phoneHash, phoneHash));

    return { allowed: true, remaining: FREE_TIER_DAILY_LIMIT - 1, tier };
  }

  const currentCount = user.dailyQueryCount ?? 0;

  // Check if limit exceeded
  if (currentCount >= FREE_TIER_DAILY_LIMIT) {
    return { allowed: false, remaining: 0, tier };
  }

  // Increment counter
  await db
    .update(users)
    .set({
      dailyQueryCount: sql`${users.dailyQueryCount} + 1`,
    })
    .where(eq(users.phoneHash, phoneHash));

  return {
    allowed: true,
    remaining: FREE_TIER_DAILY_LIMIT - currentCount - 1,
    tier,
  };
}
