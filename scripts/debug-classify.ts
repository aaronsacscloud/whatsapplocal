import { searchFromClassification } from "../src/events/search.js";
import { loadConfig } from "../src/config.js";
import { closeDb } from "../src/db/index.js";
loadConfig();

// Simulate what the classifier returns
const cls = {
  intent: "event_query" as const,
  city: null,
  neighborhood: null,
  date: "today",
  category: null,
  query: null,
};

console.log("DEFAULT_CITY:", process.env.DEFAULT_CITY);
console.log("Classification:", JSON.stringify(cls));

const events = await searchFromClassification(cls);
console.log(`\nEvents: ${events.length}`);
for (const e of events.slice(0, 3)) {
  console.log(`  ${(e as any).title}`);
}

await closeDb();
