-- Add content_type column to events table
-- Values: 'event' (has specific date/time), 'activity' (permanent/recurring), 'post' (FB post, info only)
ALTER TABLE events ADD COLUMN IF NOT EXISTS content_type TEXT DEFAULT 'event';

-- Index for filtering by content_type
CREATE INDEX IF NOT EXISTS idx_events_content_type ON events(content_type);
