import { searchEvents } from "../src/events/repository.js";
import { loadConfig } from "../src/config.js";
import { closeDb } from "../src/db/index.js";
loadConfig();

// Simulate what searchFromClassification does
const dateFrom = new Date(Date.UTC(2026, 3, 3)); // April 3
const dateTo = new Date(Date.UTC(2026, 3, 4));   // April 4

console.log("Calling searchEvents with:");
console.log("  city:", "San Miguel de Allende");
console.log("  dateFrom:", dateFrom.toISOString());
console.log("  dateTo:", dateTo.toISOString());

const events = await searchEvents({
  city: "San Miguel de Allende",
  dateFrom,
  dateTo,
  limit: 10,
});

console.log(`\nResult: ${events.length} events`);
for (const e of events.slice(0, 5)) {
  console.log(`  ${(e as any).title}`);
}

await closeDb();
