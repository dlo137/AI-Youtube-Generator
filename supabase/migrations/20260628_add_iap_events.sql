-- IAP events log — used for idempotent Telegram alert delivery.
-- The UNIQUE constraint on (transaction_id, event_type) is the dedup lock:
-- only the first INSERT succeeds; all retries and duplicate calls are silently ignored.

CREATE TABLE IF NOT EXISTS public.iap_events (
  id             UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_id TEXT        NOT NULL,
  event_type     TEXT        NOT NULL,  -- purchase | renewal | restore | discount | failed | expired | cancelled
  user_id        UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  product_id     TEXT,
  source         TEXT,                  -- listener | restore | orphan | direct | assn_v2
  store          TEXT        NOT NULL DEFAULT 'apple',  -- apple | google_play
  alert_sent     BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT iap_events_unique UNIQUE (transaction_id, event_type)
);

CREATE INDEX IF NOT EXISTS idx_iap_events_user_id
  ON public.iap_events (user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_iap_events_created_at
  ON public.iap_events (created_at DESC);

-- No client access — service role only (bypasses RLS by default).
ALTER TABLE public.iap_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_all_client_access" ON public.iap_events
  AS RESTRICTIVE
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE  public.iap_events                  IS 'Append-only log of IAP events; UNIQUE(transaction_id, event_type) prevents duplicate Telegram alerts.';
COMMENT ON COLUMN public.iap_events.transaction_id   IS 'StoreKit transactionId (iOS) or orderId (Android).';
COMMENT ON COLUMN public.iap_events.event_type       IS 'One of: purchase, renewal, restore, discount, failed, expired, cancelled.';
COMMENT ON COLUMN public.iap_events.source           IS 'Call origin: listener, restore, orphan, direct (SubscriptionScreen fallback), assn_v2.';
COMMENT ON COLUMN public.iap_events.alert_sent       IS 'Flipped to TRUE after the Telegram sendMessage call succeeds.';
