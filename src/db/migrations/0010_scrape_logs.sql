-- Scrape logs table for tracking each scrape run
CREATE TABLE IF NOT EXISTS scrape_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  sources_processed INTEGER DEFAULT 0,
  events_inserted INTEGER DEFAULT 0,
  events_rejected INTEGER DEFAULT 0,
  duplicates_merged INTEGER DEFAULT 0,
  errors INTEGER DEFAULT 0,
  trigger TEXT DEFAULT 'cron',
  details JSONB
);

CREATE INDEX IF NOT EXISTS idx_scrape_logs_started ON scrape_logs(started_at DESC);
