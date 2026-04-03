import { eq, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { users, type User } from "../db/schema.js";
import { hashPhone } from "../utils/hash.js";

export async function upsertUser(
  phone: string,
  city?: string
): Promise<User> {
  const db = getDb();
  const phoneHash = hashPhone(phone);

  const [user] = await db
    .insert(users)
    .values({
      phoneHash,
      city,
      lastActiveAt: new Date(),
    })
    .onConflictDoUpdate({
      target: users.phoneHash,
      set: {
        lastActiveAt: new Date(),
        city: city ?? sql`${users.city}`,
      },
    })
    .returning();

  return user;
}

export async function incrementQueryCount(phoneHash: string): Promise<void> {
  const db = getDb();
  await db
    .update(users)
    .set({ queryCount: sql`${users.queryCount} + 1` })
    .where(eq(users.phoneHash, phoneHash));
}

export async function incrementForwardCount(phoneHash: string): Promise<void> {
  const db = getDb();
  await db
    .update(users)
    .set({ forwardCount: sql`${users.forwardCount} + 1` })
    .where(eq(users.phoneHash, phoneHash));
}

export async function findUserByPhone(phone: string): Promise<User | undefined> {
  const db = getDb();
  const phoneHash = hashPhone(phone);
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.phoneHash, phoneHash))
    .limit(1);

  return user;
}
