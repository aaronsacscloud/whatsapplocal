-- Add language detection and onboarding fields to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'es';
ALTER TABLE users ADD COLUMN IF NOT EXISTS interests TEXT[];
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_tourist BOOLEAN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_complete BOOLEAN DEFAULT FALSE;
