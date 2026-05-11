ALTER TABLE profiles ADD COLUMN IF NOT EXISTS has_used_trial BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN profiles.has_used_trial IS 'Tracks whether the user has already consumed their one free trial. Set to true when a trial is first granted and never reset.';
