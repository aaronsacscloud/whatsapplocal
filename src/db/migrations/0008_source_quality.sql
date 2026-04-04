-- Source quality tracking: learn which Facebook pages produce useful events
-- quality_score formula weights image-based events higher than text-only
ALTER TABLE sources ADD COLUMN IF NOT EXISTS events_found INTEGER DEFAULT 0;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS events_from_images INTEGER DEFAULT 0;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS last_useful_event_at TIMESTAMPTZ;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS quality_score REAL DEFAULT 0.5;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS total_scrapes INTEGER DEFAULT 0;

-- Index for efficient quality-sorted queries
CREATE INDEX IF NOT EXISTS idx_sources_quality ON sources(quality_score DESC) WHERE is_active = true;
