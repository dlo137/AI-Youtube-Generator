-- Add status column to profiles table to track payment status
-- Possible values: 'active', 'canceled', 'free trial', 'free trial (canceled)'

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'free trial';

-- Optionally, backfill status for existing users based on their subscription and payment state
-- Example logic (customize as needed):
-- UPDATE profiles SET status = 'active' WHERE is_pro_version = true AND subscription_plan IS NOT NULL;
-- UPDATE profiles SET status = 'canceled' WHERE is_pro_version = false AND subscription_plan IS NOT NULL;
-- UPDATE profiles SET status = 'free trial' WHERE is_pro_version = false AND subscription_plan IS NULL;
-- UPDATE profiles SET status = 'free trial (canceled)' WHERE is_pro_version = false AND subscription_plan IS NULL AND credits_current = 0;

-- Add a comment explaining the status column
COMMENT ON COLUMN profiles.status IS 'Tracks user payment status: active, canceled, free trial, free trial (canceled)';
