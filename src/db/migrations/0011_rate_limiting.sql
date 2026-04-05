-- Add daily rate limiting columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_query_count INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_query_reset_at TIMESTAMPTZ;
