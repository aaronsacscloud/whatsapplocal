/**
 * Seed script: adds experience/activity sources to the DB
 * Platforms (Airbnb, TripAdvisor, etc.) + local businesses
 * (yoga, cooking, tours, dance, holistic, adventure, sports)
 *
 * Usage: npx tsx scripts/seed-experiences.ts
 */
import { loadConfig } from "../src/config.js";
import { getDb, closeDb } from "../src/db/index.js";
import { sources } from "../src/db/schema.js";
import { sql } from "drizzle-orm";

loadConfig();
const db = getDb();

interface Source {
  name: string;
  url: string;
  type: "facebook_page" | "instagram" | "website" | "platform";
  priority: "high" | "medium" | "low";
}

const PLATFORMS: Source[] = [
  { name: "Airbnb Experiences SMA", url: "https://www.airbnb.com/san-miguel-de-allende-mexico/things-to-do", type: "platform", priority: "high" },
  { name: "TripAdvisor Things To Do SMA", url: "https://www.tripadvisor.com/Attractions-g151932-Activities-San_Miguel_de_Allende_Central_Mexico_and_Gulf_Coast.html", type: "platform", priority: "high" },
  { name: "GetYourGuide SMA", url: "https://www.getyourguide.com/san-miguel-de-allende-l2515/", type: "platform", priority: "high" },
  { name: "Viator SMA", url: "https://www.viator.com/San-Miguel-de-Allende/d26115-ttd", type: "platform", priority: "high" },
  { name: "Eventbrite SMA", url: "https://www.eventbrite.com/d/mexico--san-miguel-de-allende/events/", type: "platform", priority: "high" },
  { name: "Bandsintown SMA", url: "https://www.bandsintown.com/c/san-miguel-de-allende-mexico", type: "platform", priority: "high" },
  { name: "Meetup SMA", url: "https://www.meetup.com/cities/mx/san_miguel_de_allende/", type: "platform", priority: "medium" },
  { name: "Civitatis SMA", url: "https://www.civitatis.com/en/san-miguel-de-allende/", type: "platform", priority: "medium" },
  { name: "AllEvents SMA", url: "https://allevents.in/san%20miguel%20de%20allende/calendar", type: "platform", priority: "medium" },
];

// Local businesses organized by category
const BUSINESSES: Array<{ name: string; category: string; facebook?: string; instagram?: string; website?: string }> = [
  // Yoga & Fitness
  { name: "The Now Yoga and Wellness Studio", category: "yoga", facebook: "https://www.facebook.com/p/The-Now-Yoga-and-Wellness-studio-61578235210751/", instagram: "@thenowyogastudio" },
  { name: "Esencia Yoga Spa", category: "yoga", facebook: "https://www.facebook.com/EsenciaYogaSpaRetreat/", instagram: "@esenciayogaspa" },
  { name: "Fabienne's Yoga", category: "yoga", facebook: "https://www.facebook.com/fabiennesyogastudio/" },
  { name: "Casa Shala", category: "yoga", facebook: "https://www.facebook.com/dhyanayogashala/", instagram: "@casashalamexico" },
  { name: "Hot Yoga San Miguel", category: "yoga", instagram: "@hotyogasanmiguel" },
  { name: "SMA Pilates + Barre + Yoga", category: "yoga", instagram: "@smapilates" },
  { name: "Pilates Strong SMA", category: "yoga", facebook: "https://www.facebook.com/pilatesstrongsma/" },
  { name: "Reformer Lab SMA", category: "yoga", instagram: "@reformerlabsma" },
  { name: "JADA Fit", category: "yoga", facebook: "https://www.facebook.com/jadasanmigueldeallende/" },

  // Cooking Schools & Food Experiences
  { name: "Pura Vida Kitchen", category: "cooking", facebook: "https://www.facebook.com/PURAVIDAKITCHEN/" },
  { name: "Taste of San Miguel Food Tours", category: "cooking", facebook: "https://www.facebook.com/tasteofsanmiguel/", instagram: "@tasteofsanmiguel" },
  { name: "Delicious Expeditions", category: "cooking", facebook: "https://www.facebook.com/DeliciousExpeditions/" },

  // Tour Operators
  { name: "Catrina Tours", category: "tour", facebook: "https://www.facebook.com/catrinatoursmx/", instagram: "@catrinatoursmx" },
  { name: "Coyote Canyon Adventures", category: "tour", facebook: "https://www.facebook.com/Coyotecanyonadventuressma/", instagram: "@coyotecanyonadventures" },
  { name: "Bici-Burro Bike Tours", category: "tour", facebook: "https://www.facebook.com/BiciBurro/" },

  // Dance Schools
  { name: "Ritmo y Sabor SMA", category: "dance", facebook: "https://www.facebook.com/ritmoysabor2021/", instagram: "@ritmoysaborofficial" },
  { name: "Nova Rumba Dance Studio", category: "dance", facebook: "https://www.facebook.com/NovaRumbaSMA/" },

  // Temazcal & Holistic
  { name: "Sagrada Holistic Ranch", category: "holistic", facebook: "https://www.facebook.com/SagradaSMA/", instagram: "@sagrada.holistic.ranch" },

  // Hot Air Balloon & Adventure
  { name: "Globo San Miguel", category: "adventure", facebook: "https://www.facebook.com/GloboSanMiguel/", instagram: "@globosanmiguel" },
  { name: "Vuela en Globo SMA", category: "adventure", facebook: "https://www.facebook.com/vuelaenglobosanmiguel/" },
  { name: "Rancho Sol Dorado (Horseback)", category: "adventure", facebook: "https://www.facebook.com/delsoldorado/" },

  // Sports
  { name: "San Miguel Tennis", category: "sports", facebook: "https://www.facebook.com/webertennis1/" },
  { name: "SMA Pickleball", category: "sports", facebook: "https://www.facebook.com/smapickleball/" },
  { name: "Ciclistas San Miguel", category: "sports", instagram: "@csm_ciclistassanmiguel" },
  { name: "Escarabajo Bicicleteria", category: "sports", facebook: "https://www.facebook.com/escarabajobicicleteria/" },
];

const PRIORITY_MAP: Record<string, "high" | "medium" | "low"> = {
  yoga: "medium",
  cooking: "high",
  tour: "high",
  dance: "medium",
  holistic: "medium",
  adventure: "high",
  sports: "medium",
};

async function addSource(s: Source): Promise<boolean> {
  const existing = await db.select().from(sources).where(sql`url = ${s.url}`).limit(1);
  if (existing.length > 0) return false;

  await db.insert(sources).values({
    name: s.name,
    url: s.url,
    type: s.type as any,
    pollPriority: s.priority,
  });
  return true;
}

async function seed() {
  let added = 0;
  let skipped = 0;

  // Add platforms
  console.log("=== Platforms ===");
  for (const p of PLATFORMS) {
    if (await addSource(p)) {
      added++;
      console.log(`  + ${p.name} (${p.type})`);
    } else {
      skipped++;
    }
  }

  // Add business Facebook + Instagram
  console.log("\n=== Local Businesses ===");
  for (const biz of BUSINESSES) {
    const priority = PRIORITY_MAP[biz.category] || "medium";

    if (biz.facebook) {
      if (await addSource({ name: `${biz.name} (FB)`, url: biz.facebook, type: "facebook_page", priority })) {
        added++;
        console.log(`  + [FB] ${biz.name} (${biz.category})`);
      } else { skipped++; }
    }

    if (biz.instagram) {
      const igUrl = `https://www.instagram.com/${biz.instagram.replace("@", "")}/`;
      if (await addSource({ name: `${biz.name} (IG)`, url: igUrl, type: "instagram", priority: "low" })) {
        added++;
        console.log(`  + [IG] ${biz.name}`);
      } else { skipped++; }
    }
  }

  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(sources);
  console.log(`\nDone! Added: ${added} | Skipped: ${skipped} | Total sources: ${count}`);
  await closeDb();
}

seed();
