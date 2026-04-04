-- Add columns for recurring events and workshops
-- content_type values now include: 'event', 'recurring', 'workshop', 'activity', 'post'
-- recurrence_day: 0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday
ALTER TABLE events ADD COLUMN IF NOT EXISTS recurrence_day INTEGER; -- 0=Sunday, 1=Monday... 6=Saturday
ALTER TABLE events ADD COLUMN IF NOT EXISTS recurrence_time TEXT; -- "10:00" in 24h format
ALTER TABLE events ADD COLUMN IF NOT EXISTS recurrence_end_date TIMESTAMPTZ; -- when the recurring event stops
ALTER TABLE events ADD COLUMN IF NOT EXISTS workshop_start_date TIMESTAMPTZ;
ALTER TABLE events ADD COLUMN IF NOT EXISTS workshop_end_date TIMESTAMPTZ;
ALTER TABLE events ADD COLUMN IF NOT EXISTS price TEXT; -- "$100", "Gratis", "$500 USD"
ALTER TABLE events ADD COLUMN IF NOT EXISTS duration TEXT; -- "2 hours", "3 dias"

-- Index for content_type already exists from 0006
-- Add index for recurrence queries
CREATE INDEX IF NOT EXISTS idx_events_recurrence ON events(recurrence_day) WHERE recurrence_day IS NOT NULL;
