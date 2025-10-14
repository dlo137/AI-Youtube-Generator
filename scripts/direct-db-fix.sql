-- First, let's see what's in the profiles table
SELECT id, subscription_plan, is_pro_version, credits_current, credits_max
FROM profiles
LIMIT 10;

-- Update all users with yearly plan to have 90 credits
UPDATE profiles
SET
  credits_current = 90,
  credits_max = 90
WHERE subscription_plan = 'yearly' AND is_pro_version = true;

-- Update all users with monthly plan to have 75 credits
UPDATE profiles
SET
  credits_current = 75,
  credits_max = 75
WHERE subscription_plan = 'monthly' AND is_pro_version = true;

-- Update all users with weekly plan to have 30 credits
UPDATE profiles
SET
  credits_current = 30,
  credits_max = 30
WHERE subscription_plan = 'weekly' AND is_pro_version = true;

-- Show updated results
SELECT id, subscription_plan, is_pro_version, credits_current, credits_max
FROM profiles
WHERE is_pro_version = true;
