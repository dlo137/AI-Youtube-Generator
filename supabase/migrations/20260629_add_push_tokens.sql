-- Push notification tokens — one row per (user, device) pair.
-- A user can have multiple devices; each device gets its own token.
-- UNIQUE(user_id, expo_push_token) prevents duplicate rows on re-registration.

CREATE TABLE IF NOT EXISTS public.push_tokens (
  id                   UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id              UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expo_push_token      TEXT        NOT NULL,
  platform             TEXT        NOT NULL,  -- 'ios' | 'android'
  notifications_enabled BOOLEAN    NOT NULL DEFAULT TRUE,
  marketing_opt_in     BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT push_tokens_unique UNIQUE (user_id, expo_push_token)
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_user_id
  ON public.push_tokens (user_id);

CREATE INDEX IF NOT EXISTS idx_push_tokens_enabled
  ON public.push_tokens (notifications_enabled)
  WHERE notifications_enabled = TRUE;

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

-- Users can read and update their own tokens
CREATE POLICY "users_own_tokens_select" ON public.push_tokens
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "users_own_tokens_insert" ON public.push_tokens
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_own_tokens_update" ON public.push_tokens
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE  public.push_tokens                        IS 'Expo push tokens per user device. Sending notifications uses service role — client only reads/writes its own rows.';
COMMENT ON COLUMN public.push_tokens.expo_push_token        IS 'ExponentPushToken[...] string from expo-notifications.';
COMMENT ON COLUMN public.push_tokens.notifications_enabled  IS 'Mirrors the OS-level permission; set to FALSE when the user revokes permission.';
COMMENT ON COLUMN public.push_tokens.marketing_opt_in       IS 'Explicit opt-in for marketing/promotional notifications (separate from transactional).';
