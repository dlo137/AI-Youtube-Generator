-- ─────────────────────────────────────────────────────────────────────────────
-- Notification support additions
-- ─────────────────────────────────────────────────────────────────────────────

-- Track when the user last opened the app (any device).
-- Used by the re-engagement eligibility query.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_opened_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_profiles_last_opened_at
  ON public.profiles (last_opened_at)
  WHERE last_opened_at IS NOT NULL;

COMMENT ON COLUMN public.profiles.last_opened_at IS
  'Updated on every app foreground. Used to gate re-engagement push notifications.';

-- Track when we last sent a push to each specific token.
-- Prevents hammering the same device within 72 hours.
ALTER TABLE public.push_tokens
  ADD COLUMN IF NOT EXISTS last_push_sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_push_tokens_last_push_sent_at
  ON public.push_tokens (last_push_sent_at)
  WHERE last_push_sent_at IS NOT NULL;

COMMENT ON COLUMN public.push_tokens.last_push_sent_at IS
  'Timestamp of the most recent push sent to this token. Enforces the 72-hour send cooldown.';

-- ─────────────────────────────────────────────────────────────────────────────
-- notification_logs — append-only audit trail of every push attempt.
-- Never deleted; useful for debugging delivery and measuring engagement.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notification_logs (
  id                UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  push_token_id     UUID        REFERENCES public.push_tokens(id) ON DELETE SET NULL,
  notification_type TEXT        NOT NULL,  -- 're_engagement' | 'credit_reset' | 'unused_credits' | 'announcement'
  title             TEXT        NOT NULL,
  body              TEXT        NOT NULL,
  status            TEXT        NOT NULL,  -- 'sent' | 'failed' | 'invalid_token'
  expo_receipt_id   TEXT,                  -- ticket ID returned by Expo, for receipt polling
  error_message     TEXT,
  sent_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_logs_user_id
  ON public.notification_logs (user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notification_logs_sent_at
  ON public.notification_logs (sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_logs_type
  ON public.notification_logs (notification_type, sent_at DESC);

-- Service role only — no client access
ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_all_client_access" ON public.notification_logs
  AS RESTRICTIVE
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE  public.notification_logs                   IS 'Append-only log of every push notification attempt. Write via service role only.';
COMMENT ON COLUMN public.notification_logs.notification_type IS 're_engagement | credit_reset | unused_credits | announcement';
COMMENT ON COLUMN public.notification_logs.status            IS 'sent | failed | invalid_token';
COMMENT ON COLUMN public.notification_logs.expo_receipt_id   IS 'Expo push ticket ID — use with /--/api/v2/push/getReceipts to confirm delivery.';
