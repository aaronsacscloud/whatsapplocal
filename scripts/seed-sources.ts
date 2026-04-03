/**
 * Seed script: populates the sources table with Facebook pages and
 * event sources for San Miguel de Allende.
 *
 * Usage: npx tsx scripts/seed-sources.ts
 */
import { loadConfig } from "../src/config.js";
import { getDb, closeDb } from "../src/db/index.js";
import { sources } from "../src/db/schema.js";

loadConfig();
const db = getDb();

const SMA_SOURCES = [
  // === Bars & Restaurants with live music/events ===
  {
    name: "Raindog Lounge & Terraza",
    url: "https://www.facebook.com/RaindogLounge/",
    type: "facebook_page" as const,
    pollPriority: "high" as const,
  },
  {
    name: "Los Milagros Rest-Bar",
    url: "https://www.facebook.com/LosMilagrosSMA/",
    type: "facebook_page" as const,
    pollPriority: "high" as const,
  },
  {
    name: "CENTRO BAR SMA",
    url: "https://www.facebook.com/centrobarsma/",
    type: "facebook_page" as const,
    pollPriority: "high" as const,
  },
  {
    name: "ALTAR Terraza",
    url: "https://www.facebook.com/altarterraza/",
    type: "facebook_page" as const,
    pollPriority: "high" as const,
  },
  {
    name: "TENÉ Kitchen & Bar",
    url: "https://www.facebook.com/tene1810sma/",
    type: "facebook_page" as const,
    pollPriority: "medium" as const,
  },
  {
    name: "Centanni Restaurante & Piano Bar",
    url: "https://www.facebook.com/centannirestaurantesma/",
    type: "facebook_page" as const,
    pollPriority: "high" as const,
  },
  {
    name: "Bastardo Restaurante & Beer Garden",
    url: "https://www.facebook.com/bastardo.sma/",
    type: "facebook_page" as const,
    pollPriority: "medium" as const,
  },
  {
    name: "Loma Lagartija",
    url: "https://www.facebook.com/p/Loma-Lagartija-100071570893751/",
    type: "facebook_page" as const,
    pollPriority: "medium" as const,
  },
  // === Event aggregators & cultural venues ===
  {
    name: "San Miguel Live! (Events)",
    url: "https://sanmiguellive.com/",
    type: "facebook_page" as const, // Will scrape website instead
    pollPriority: "high" as const,
  },
  {
    name: "Discover SMA Events",
    url: "https://discoversma.com/events/events/",
    type: "facebook_page" as const, // Will scrape website instead
    pollPriority: "high" as const,
  },
  {
    name: "El Sindicato Centro Cultural",
    url: "https://www.facebook.com/ElSindicatoSMA/",
    type: "facebook_page" as const,
    pollPriority: "high" as const,
  },
  {
    name: "San Miguel Gourmet",
    url: "https://www.facebook.com/sanmiguelgourmet",
    type: "facebook_page" as const,
    pollPriority: "low" as const,
  },
  {
    name: "Cafetería SMA",
    url: "https://www.facebook.com/CafeteriaSMA/",
    type: "facebook_page" as const,
    pollPriority: "low" as const,
  },
];

async function seed() {
  console.log(`Seeding ${SMA_SOURCES.length} sources for San Miguel de Allende...\n`);

  for (const source of SMA_SOURCES) {
    try {
      await db.insert(sources).values(source).onConflictDoNothing();
      console.log(`  + ${source.name} (${source.pollPriority})`);
    } catch (error: any) {
      console.error(`  x ${source.name}: ${error.message}`);
    }
  }

  console.log(`\nDone! ${SMA_SOURCES.length} sources seeded.`);
  await closeDb();
}

seed();
