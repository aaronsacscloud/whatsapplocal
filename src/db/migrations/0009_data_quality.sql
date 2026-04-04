-- Data quality: freshness tracking and cross-source deduplication support
ALTER TABLE events ADD COLUMN IF NOT EXISTS scraped_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE events ADD COLUMN IF NOT EXISTS freshness_score REAL DEFAULT 1.0;
ALTER TABLE events ADD COLUMN IF NOT EXISTS source_count INTEGER DEFAULT 1;

-- Index for freshness-based queries
CREATE INDEX IF NOT EXISTS idx_events_freshness ON events(freshness_score DESC) WHERE freshness_score IS NOT NULL;
