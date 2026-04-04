import { scrapeEventbrite, scrapeBandsintown } from "../src/scraper/platform-scraper.js";
import { loadConfig } from "../src/config.js";
loadConfig();

console.log("=== Eventbrite ===");
const eb = await scrapeEventbrite();
console.log(`  Events: ${eb.length}`);
for (const e of eb.slice(0, 3)) {
  console.log(`  - ${e.title} @ ${e.venueName || "?"} (${e.category})`);
}

console.log("\n=== Bandsintown ===");
const bit = await scrapeBandsintown();
console.log(`  Events: ${bit.length}`);
for (const e of bit.slice(0, 3)) {
  console.log(`  - ${e.title} @ ${e.venueName || "?"} (${e.category})`);
}

console.log(`\nTotal from platforms: ${eb.length + bit.length}`);
process.exit(0);
