CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  intent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_conversations_phone ON conversations(phone_hash, created_at DESC);

CREATE TABLE IF NOT EXISTS analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_hash TEXT,
  intent TEXT NOT NULL,
  query TEXT,
  category TEXT,
  city TEXT,
  results_count INTEGER DEFAULT 0,
  response_time_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_analytics_intent ON analytics(intent, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_created ON analytics(created_at DESC);
