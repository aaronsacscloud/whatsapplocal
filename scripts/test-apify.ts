import { scrapeSource } from "../src/scraper/apify.js";
import { normalizeApifyPosts } from "../src/scraper/normalizer.js";
import { loadConfig } from "../src/config.js";
loadConfig();

console.log("Scraping Raindog Lounge via Apify...\n");

const posts = await scrapeSource("https://www.facebook.com/RaindogLounge/");
console.log(`Raw posts: ${posts.length}`);

const events = normalizeApifyPosts(posts, "San Miguel de Allende", "https://www.facebook.com/RaindogLounge/");
console.log(`Events (confidence >= 0.5): ${events.length}\n`);

for (const e of events.slice(0, 5)) {
  console.log(`  ${e.title?.substring(0, 60)}`);
  console.log(`    Venue: ${e.venueName} | Conf: ${e.confidence} | Cat: ${e.category}`);
  console.log(`    Date: ${e.eventDate}`);
  console.log();
}

process.exit(0);
