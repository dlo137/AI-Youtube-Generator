-- Add credits tracking columns to profiles table
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS credits_current INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS credits_max INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_credit_reset TIMESTAMP WITH TIME ZONE;

-- Update existing users to have correct credits based on their subscription
UPDATE profiles
SET
  credits_max = CASE
    WHEN subscription_plan = 'yearly' THEN 90
    WHEN subscription_plan = 'monthly' THEN 75
    WHEN subscription_plan = 'weekly' THEN 30
    ELSE 0
  END,
  credits_current = CASE
    WHEN subscription_plan = 'yearly' THEN 90
    WHEN subscription_plan = 'monthly' THEN 75
    WHEN subscription_plan = 'weekly' THEN 30
    ELSE 0
  END
WHERE credits_current IS NULL OR credits_max IS NULL;

-- Create an index on credits for faster queries
CREATE INDEX IF NOT EXISTS idx_profiles_credits ON profiles(credits_current);

-- Add a comment explaining the credits system
COMMENT ON COLUMN profiles.credits_current IS 'Current number of images/credits the user has available';
COMMENT ON COLUMN profiles.credits_max IS 'Maximum number of images/credits based on subscription plan';
COMMENT ON COLUMN profiles.last_credit_reset IS 'Last time credits were reset (for monthly/weekly plans)';
