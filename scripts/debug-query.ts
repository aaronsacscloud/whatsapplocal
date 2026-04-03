import { searchEvents } from "../src/events/repository.js";
import { loadConfig } from "../src/config.js";
import { closeDb } from "../src/db/index.js";
loadConfig();

// Test with query filter (what the classifier generates)
const r1 = await searchEvents({
  city: "San Miguel de Allende",
  dateFrom: new Date("2026-04-03T00:00:00Z"),
  dateTo: new Date("2026-04-04T00:00:00Z"),
  query: "que hay esta noche",
  limit: 5,
});
console.log("With query filter:", r1.length, "events");

// Test WITHOUT query filter
const r2 = await searchEvents({
  city: "San Miguel de Allende",
  dateFrom: new Date("2026-04-03T00:00:00Z"),
  dateTo: new Date("2026-04-04T00:00:00Z"),
  limit: 5,
});
console.log("Without query filter:", r2.length, "events");

await closeDb();
