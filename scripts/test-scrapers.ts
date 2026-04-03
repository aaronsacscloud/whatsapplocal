import { scrapeSanMiguelLive, scrapeDiscoverSMA } from "../src/scraper/web-scraper.js";
import { loadConfig } from "../src/config.js";
loadConfig();

console.log("=== sanmiguellive.com ===");
const sml = await scrapeSanMiguelLive();
console.log(`  Events: ${sml.length}`);
for (const e of sml.slice(0, 3)) {
  console.log(`  - ${e.title} @ ${e.venueName || "?"} (${e.category})`);
}

console.log("\n=== discoversma.com (RSS) ===");
const dsm = await scrapeDiscoverSMA();
console.log(`  Events: ${dsm.length}`);
for (const e of dsm.slice(0, 5)) {
  console.log(`  - ${e.title} @ ${e.venueName || "?"} (${e.category})`);
}

console.log(`\nTotal: ${sml.length + dsm.length} events from 2 sources`);
process.exit(0);
