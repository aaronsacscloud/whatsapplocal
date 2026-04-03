import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getConfig } from "../config.js";
import * as schema from "./schema.js";

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let _client: ReturnType<typeof postgres> | null = null;

export function getDb() {
  if (_db) return _db;

  const config = getConfig();

  _client = postgres(config.DATABASE_URL, {
    prepare: false, // Required for Supabase Transaction pooler
    max: 10,
    idle_timeout: 20,
  });

  _db = drizzle(_client, { schema });
  return _db;
}

export async function closeDb(): Promise<void> {
  if (_client) {
    await _client.end();
    _client = null;
    _db = null;
  }
}

export { schema };
