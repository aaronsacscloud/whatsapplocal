-- Self-learning knowledge cache
-- Stores answers learned from web searches triggered by user queries.
-- When a user asks something the bot doesn't know, it searches the web,
-- synthesizes an answer, and stores it here for future queries.

CREATE TABLE IF NOT EXISTS learned_knowledge (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  query_key TEXT NOT NULL,           -- normalized query (sorted words, lowercase)
  original_query TEXT NOT NULL,       -- what the user actually asked
  answer TEXT NOT NULL,               -- synthesized answer
  source TEXT,                        -- where we found it (URL)
  category TEXT,                      -- topic category
  city TEXT NOT NULL DEFAULT 'San Miguel de Allende',
  hit_count INTEGER DEFAULT 0,        -- times this answer was served
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  UNIQUE(query_key, city)
);

CREATE INDEX IF NOT EXISTS idx_learned_knowledge_city ON learned_knowledge(city);
CREATE INDEX IF NOT EXISTS idx_learned_knowledge_expires ON learned_knowledge(expires_at);
CREATE INDEX IF NOT EXISTS idx_learned_knowledge_hits ON learned_knowledge(hit_count DESC);

-- Enable trigram extension for fuzzy matching (similar queries)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_learned_knowledge_trgm ON learned_knowledge USING gin(query_key gin_trgm_ops);
