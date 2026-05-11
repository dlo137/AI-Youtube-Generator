-- Trial abuse prevention: cross-profile eligibility enforcement
-- Adds normalized_email, device_id, free_trial_used_at, trial_credits, paid_credits
-- and a server-side eligibility function so the decision never lives only on the client.

-- Step 1: New columns (has_used_trial already added in 20260402)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS normalized_email  TEXT,
  ADD COLUMN IF NOT EXISTS free_trial_used_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS device_id          TEXT,
  ADD COLUMN IF NOT EXISTS trial_credits      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paid_credits       INTEGER NOT NULL DEFAULT 0;

-- Step 2: Backfill normalized_email from auth.users for existing rows
UPDATE public.profiles p
SET normalized_email = LOWER(TRIM(u.email))
FROM auth.users u
WHERE p.id = u.id
  AND p.normalized_email IS NULL
  AND u.email IS NOT NULL;

-- Step 3: Backfill free_trial_used_at for users who already consumed a trial
UPDATE public.profiles
SET
  has_used_trial      = TRUE,
  free_trial_used_at  = COALESCE(purchase_time::TIMESTAMPTZ, NOW())
WHERE (is_trial_version = TRUE OR has_used_trial = TRUE)
  AND free_trial_used_at IS NULL;

-- Step 4: Indexes for fast cross-profile lookups
CREATE INDEX IF NOT EXISTS idx_profiles_normalized_email
  ON public.profiles (normalized_email)
  WHERE normalized_email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_device_id
  ON public.profiles (device_id)
  WHERE device_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_has_used_trial
  ON public.profiles (has_used_trial)
  WHERE has_used_trial = TRUE;

-- Step 5: Server-side eligibility function (SECURITY DEFINER — bypasses RLS)
-- Returns TRUE only when NO profile with the same email or device has already
-- consumed a free trial (including the caller's own row).
CREATE OR REPLACE FUNCTION public.check_trial_eligibility(
  p_user_id   UUID,
  p_email     TEXT,
  p_device_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_normalized TEXT;
  v_found      INTEGER;
BEGIN
  v_normalized := LOWER(TRIM(p_email));

  -- Check any profile (including the caller's own row) that already used the trial
  -- and shares the same email or device
  SELECT COUNT(*) INTO v_found
  FROM public.profiles
  WHERE has_used_trial = TRUE
    AND (
      (normalized_email IS NOT NULL AND normalized_email = v_normalized)
      OR
      (
        device_id IS NOT NULL
        AND p_device_id IS NOT NULL
        AND p_device_id <> ''
        AND device_id = p_device_id
      )
    )
  LIMIT 1;

  RETURN v_found = 0;
END;
$$;

COMMENT ON FUNCTION public.check_trial_eligibility IS
  'Returns TRUE only when no profile with the same normalized email or device ID '
  'has already consumed a free trial. Called by both the edge function and the '
  'frontend eligibility check. SECURITY DEFINER so it works across all rows.';

-- Column comments
COMMENT ON COLUMN public.profiles.normalized_email   IS 'Lowercase-trimmed email — used for cross-profile trial abuse detection';
COMMENT ON COLUMN public.profiles.free_trial_used_at IS 'Timestamp when the free trial was first granted; never reset';
COMMENT ON COLUMN public.profiles.device_id          IS 'Stable per-install device identifier for cross-account trial abuse detection';
COMMENT ON COLUMN public.profiles.trial_credits      IS 'Credits granted by the free trial. Wiped to 0 on trial cancel/expiry to close the "cancel and keep credits" loophole';
COMMENT ON COLUMN public.profiles.paid_credits       IS 'Credits from paid subscriptions; never wiped on trial cancellation';
