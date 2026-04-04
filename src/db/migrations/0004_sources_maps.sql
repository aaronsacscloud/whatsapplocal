-- Add geolocation and address columns to sources table for Google Maps deep links
ALTER TABLE sources ADD COLUMN IF NOT EXISTS latitude REAL;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS longitude REAL;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS google_maps_url TEXT;
