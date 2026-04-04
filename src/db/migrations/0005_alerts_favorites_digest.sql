-- Feature 1: Daily Digest opt-out
ALTER TABLE users ADD COLUMN IF NOT EXISTS digest_enabled BOOLEAN DEFAULT TRUE;

-- Feature 3: User alerts (category subscriptions)
CREATE TABLE IF NOT EXISTS user_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_hash TEXT NOT NULL,
  category TEXT NOT NULL,
  query TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_alerts_phone ON user_alerts(phone_hash, active);
CREATE INDEX IF NOT EXISTS idx_user_alerts_category ON user_alerts(category, active);

-- Feature 3: Track notified events to avoid spam
CREATE TABLE IF NOT EXISTS alert_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id UUID NOT NULL REFERENCES user_alerts(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  notified_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(alert_id, event_id)
);

-- Feature 4: Favorites
CREATE TABLE IF NOT EXISTS favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_hash TEXT NOT NULL,
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(phone_hash, event_id)
);
CREATE INDEX IF NOT EXISTS idx_favorites_phone ON favorites(phone_hash);
