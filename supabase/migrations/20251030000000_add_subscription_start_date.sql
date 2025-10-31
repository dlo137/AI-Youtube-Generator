-- Add subscription_start_date to track when user's current subscription period began
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS subscription_start_date TIMESTAMP WITH TIME ZONE;

-- For existing users with active subscriptions, set their start date to now
-- This ensures they get a full billing cycle from this migration forward
UPDATE profiles
SET subscription_start_date = NOW()
WHERE is_pro_version = true AND subscription_plan IS NOT NULL AND subscription_start_date IS NULL;

-- Add a comment explaining the column
COMMENT ON COLUMN profiles.subscription_start_date IS 'Start date of current subscription period, used to calculate when credits should reset';
