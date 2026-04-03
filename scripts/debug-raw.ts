import { getDb, closeDb } from "../src/db/index.js";
import { sql } from "drizzle-orm";
import { loadConfig } from "../src/config.js";
loadConfig();

const db = getDb();

const query = `SELECT title, event_date, category FROM events WHERE city = 'San Miguel de Allende' AND (event_date >= '2026-04-03T00:00:00.000Z'::timestamptz OR event_date IS NULL) AND (event_date <= '2026-04-04T00:00:00.000Z'::timestamptz OR event_date IS NULL) ORDER BY event_date DESC NULLS LAST LIMIT 10`;

console.log("Query:", query.substring(0, 100) + "...");

const result = await db.execute(sql.raw(query));
console.log(`\nFound: ${result.length} rows`);
for (const r of result.slice(0, 5)) {
  console.log(`  ${(r as any).title} | ${(r as any).event_date}`);
}

await closeDb();
