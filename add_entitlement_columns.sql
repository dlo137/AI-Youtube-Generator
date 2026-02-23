-- Add has_seen_paywall and entitlement columns to profiles table
-- Run this in Supabase SQL Editor

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS has_seen_paywall boolean DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS entitlement text DEFAULT 'free';

-- Backfill existing pro users
UPDATE profiles SET entitlement = 'pro' WHERE is_pro_version = true;

-- Backfill has_seen_paywall for all existing users (they've already been through onboarding)
UPDATE profiles SET has_seen_paywall = true WHERE created_at < NOW() - INTERVAL '5 minutes';
