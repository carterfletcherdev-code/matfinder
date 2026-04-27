-- Add session_name and gym_name to checkins for richer session logs
ALTER TABLE checkins ADD COLUMN IF NOT EXISTS session_name TEXT;
ALTER TABLE checkins ADD COLUMN IF NOT EXISTS gym_name TEXT;
