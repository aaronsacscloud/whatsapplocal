/**
 * Seed script: populates the sources table with ALL SMA venues
 * from sma-social-media.jsonl (Facebook + Instagram accounts)
 *
 * Usage: npx tsx scripts/seed-sma-venues.ts
 */
import { readFileSync } from "fs";
import { loadConfig } from "../src/config.js";
import { getDb, closeDb } from "../src/db/index.js";
import { sources } from "../src/db/schema.js";
import { sql } from "drizzle-orm";

loadConfig();
const db = getDb();

interface VenueData {
  name: string;
  category: string;
  facebook: string | null;
  instagram: string | null;
  tiktok: string | null;
}

// Map venue categories to scraping priority
const PRIORITY_MAP: Record<string, "high" | "medium" | "low"> = {
  bar: "high",       // Bars post events frequently
  restaurant: "high", // Restaurants post events/specials
  cafe: "medium",
  gallery: "high",    // Galleries have exhibitions/openings
  hotel: "low",
  shop: "low",
};

async function seed() {
  const lines = readFileSync("sma-social-media.jsonl", "utf-8")
    .split("\n")
    .filter(Boolean);

  console.log(`Loading ${lines.length} venues from sma-social-media.jsonl...\n`);

  let added = 0;
  let skipped = 0;

  for (const line of lines) {
    const venue: VenueData = JSON.parse(line);
    const priority = PRIORITY_MAP[venue.category] || "medium";

    // Add Facebook page as source
    if (venue.facebook) {
      try {
        // Check if already exists by URL
        const existing = await db
          .select()
          .from(sources)
          .where(sql`url = ${venue.facebook}`)
          .limit(1);

        if (existing.length > 0) {
          skipped++;
        } else {
          await db.insert(sources).values({
            name: `${venue.name} (FB)`,
            url: venue.facebook,
            type: "facebook_page",
            pollPriority: priority,
          });
          added++;
          console.log(`  + [FB] ${venue.name} (${priority})`);
        }
      } catch (e: any) {
        console.error(`  x [FB] ${venue.name}: ${e.message?.substring(0, 60)}`);
      }
    }

    // Add Instagram as source
    if (venue.instagram) {
      const igUrl = `https://www.instagram.com/${venue.instagram.replace("@", "")}/`;
      try {
        const existing = await db
          .select()
          .from(sources)
          .where(sql`url = ${igUrl}`)
          .limit(1);

        if (existing.length > 0) {
          skipped++;
        } else {
          await db.insert(sources).values({
            name: `${venue.name} (IG)`,
            url: igUrl,
            type: "instagram",
            pollPriority: priority === "high" ? "medium" : "low", // IG is secondary
          });
          added++;
          console.log(`  + [IG] ${venue.name}`);
        }
      } catch (e: any) {
        console.error(`  x [IG] ${venue.name}: ${e.message?.substring(0, 60)}`);
      }
    }
  }

  // Count totals
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(sources);

  console.log(`\nDone! Added: ${added} | Skipped (already exist): ${skipped}`);
  console.log(`Total sources in DB: ${count}`);

  await closeDb();
}

seed();
