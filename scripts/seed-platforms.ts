import { scrapeBandsintown } from "../src/scraper/platform-scraper.js";
import { deduplicateEvents } from "../src/scraper/dedup.js";
import { upsertEvent } from "../src/events/repository.js";
import { loadConfig } from "../src/config.js";
import { closeDb } from "../src/db/index.js";
loadConfig();

console.log("Scraping Bandsintown concerts...");
const concerts = await scrapeBandsintown();
console.log(`Found: ${concerts.length} concerts`);

const { unique, duplicates } = await deduplicateEvents(concerts);
console.log(`After dedup: ${unique.length} unique, ${duplicates} dups`);

let inserted = 0;
for (const e of unique) {
  try {
    await upsertEvent(e);
    inserted++;
  } catch (err: any) {
    console.error(`  x ${e.title}: ${err.message?.substring(0, 50)}`);
  }
}

console.log(`Inserted: ${inserted} concerts`);
await closeDb();
