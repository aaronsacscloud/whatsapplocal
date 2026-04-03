DO $$ BEGIN CREATE TYPE category AS ENUM ('music', 'food', 'nightlife', 'culture', 'sports', 'popup', 'other'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE source_type AS ENUM ('facebook_page', 'instagram', 'tiktok', 'user_forwarded'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE poll_priority AS ENUM ('high', 'medium', 'low'); EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  venue_name TEXT,
  venue_address TEXT,
  neighborhood TEXT,
  city TEXT NOT NULL,
  event_date TIMESTAMPTZ,
  event_end_date TIMESTAMPTZ,
  category category DEFAULT 'other',
  description TEXT,
  source_url TEXT,
  source_type source_type,
  confidence REAL,
  raw_content TEXT,
  image_url TEXT,
  dedup_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_events_city_date ON events(city, event_date);
CREATE INDEX IF NOT EXISTS idx_events_neighborhood_date ON events(neighborhood, event_date);
CREATE INDEX IF NOT EXISTS idx_events_dedup_hash ON events(dedup_hash);

CREATE TABLE IF NOT EXISTS sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  type source_type NOT NULL,
  poll_priority poll_priority DEFAULT 'medium',
  last_scraped_at TIMESTAMPTZ,
  success_rate REAL DEFAULT 1.0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_hash TEXT NOT NULL UNIQUE,
  city TEXT,
  neighborhood TEXT,
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_active_at TIMESTAMPTZ DEFAULT NOW(),
  query_count INTEGER DEFAULT 0,
  forward_count INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS processed_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id TEXT NOT NULL UNIQUE,
  processed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS job_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name TEXT NOT NULL UNIQUE,
  last_run_at TIMESTAMPTZ,
  status TEXT DEFAULT 'idle'
);

CREATE TABLE IF NOT EXISTS message_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_hash TEXT NOT NULL,
  message_body TEXT NOT NULL,
  message_id TEXT NOT NULL,
  attempts INTEGER DEFAULT 0,
  next_retry_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'pending'
);
