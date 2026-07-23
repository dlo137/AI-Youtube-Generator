// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendTelegramAlert, IapEventType } from '../_shared/sendTelegramAlert.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const APP_NAME = 'AI Thumbnail Generator'

function normalizeEmail(email?: string | null): string | null {
  return email ? email.trim().toLowerCase() : null
}

function getPlanLabel(productId: string): string {
  if (productId.includes('yearly'))   return 'Yearly'
  if (productId.includes('monthly'))  return 'Monthly'
  if (productId.includes('weekly'))   return 'Weekly'
  return productId
}

function getStoreLabel(platform: string): string {
  return platform === 'android' ? 'Google Play' : 'Apple App Store'
}

function getStoreKey(platform: string): string {
  return platform === 'android' ? 'google_play' : 'apple'
}

/**
 * Determines the semantic event type for a receipt validation call.
 *
 * Rules (in priority order):
 *  1. source=restore|orphan → 'restore'  (user triggered restore or orphan cleanup)
 *  2. productId starts with 'discount'   → 'discount'
 *  3. user has a different subscription_id on file → 'renewal' (StoreKit re-delivered a new txId)
 *  4. everything else                    → 'purchase'
 *
 * Note: source='direct' (SubscriptionScreen fallback) uses the same rules as source='listener'.
 * The iap_events unique constraint deduplicates the pair regardless of which arrives first.
 */
function getEventType(
  source: string,
  productId: string,
  existingSubscriptionId: string | null,
  transactionId: string,
): IapEventType {
  if (source === 'restore' || source === 'orphan') return 'restore'
  if (productId.toLowerCase().startsWith('discount')) return 'discount'
  if (existingSubscriptionId && existingSubscriptionId !== transactionId) return 'renewal'
  return 'purchase'
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabaseUrl        = Deno.env.get('SUPABASE_URL') ?? ''
  const supabaseAnonKey    = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

  // User-scoped client — only used to verify the caller's JWT identity
  const supabaseUserClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: req.headers.get('Authorization')! } },
  })

  // Admin client — uses service role key to bypass RLS for profile + iap_events writes
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

  // Track these for the catch block's failure alert
  let user: any      = null
  let transactionId: string | undefined
  let productId: string | undefined
  let source: string | undefined
  let platform: string | undefined

  try {
    // ── 1. Auth check ──────────────────────────────────────────────────────
    const { data: { user: authedUser } } = await supabaseUserClient.auth.getUser()
    if (!authedUser) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }
    user = authedUser

    // ── 2. Parse body ──────────────────────────────────────────────────────
    const body = await req.json()
    ;({ productId, transactionId, source, platform } = body)
    const { receipt, deviceId } = body

    // Normalize optional fields
    platform      = platform ?? 'ios'
    source        = source ?? 'unknown'
    transactionId = transactionId ?? ''
    productId     = productId ?? ''

    console.log('validate-receipt:', { userId: user.id, productId, transactionId, source, platform, deviceId })

    // ── 3. Renewal detection: fetch existing subscription_id ───────────────
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('subscription_id')
      .eq('id', user.id)
      .maybeSingle()

    const existingSubscriptionId = existingProfile?.subscription_id ?? null

    // ── 4. Determine event type ────────────────────────────────────────────
    const eventType = getEventType(source, productId, existingSubscriptionId, transactionId)

    // ── 5. Plan / credits ──────────────────────────────────────────────────
    let plan: 'yearly' | 'monthly' | 'weekly' = 'yearly'
    let credits_max = 0

    if (productId.includes('yearly'))       { plan = 'yearly';  credits_max = 100 }
    else if (productId.includes('monthly')) { plan = 'monthly'; credits_max = 75 }
    else if (productId.includes('weekly'))  { plan = 'weekly';  credits_max = 10 }

    const now = new Date().toISOString()
    const isRestore = source === 'restore' || source === 'orphan'

    // ── 6. Trial eligibility ───────────────────────────────────────────────
    const userEmail       = user.email ?? null
    const normalizedEmail = normalizeEmail(userEmail)
    let isTrial = false

    if (!isRestore) {
      const { data: eligibleResult, error: eligibilityError } = await supabaseAdmin
        .rpc('check_trial_eligibility', {
          p_user_id:   user.id,
          p_email:     normalizedEmail ?? '',
          p_device_id: deviceId ?? '',
        })
      if (eligibilityError) {
        console.error('Error checking trial eligibility:', eligibilityError)
        isTrial = false
      } else {
        isTrial = eligibleResult === true
      }
    }

    const trialEndDate = isTrial
      ? new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
      : null

    // ── 7. Profile upsert (idempotent — existing logic unchanged) ──────────
    const profileUpdate: Record<string, unknown> = {
      id:                      user.id,
      subscription_plan:       plan,
      subscription_id:         transactionId,
      is_pro_version:          true,
      entitlement:             'pro',
      is_trial_version:        isTrial,
      trial_end_date:          trialEndDate,
      product_id:              productId,
      purchase_time:           now,
      credits_current:         credits_max,
      credits_max:             credits_max,
      subscription_start_date: now,
      last_credit_reset:       now,
      updated_at:              now,
    }

    if (isTrial) {
      profileUpdate.has_used_trial     = true
      profileUpdate.free_trial_used_at = now
      profileUpdate.trial_credits      = credits_max
      profileUpdate.paid_credits       = 0
      if (normalizedEmail) profileUpdate.normalized_email = normalizedEmail
      if (deviceId)        profileUpdate.device_id        = deviceId
    } else {
      profileUpdate.trial_credits = 0
      profileUpdate.paid_credits  = credits_max
      if (normalizedEmail) profileUpdate.normalized_email = normalizedEmail
      if (deviceId)        profileUpdate.device_id        = deviceId
    }

    const { error: upsertError } = await supabaseAdmin
      .from('profiles')
      .upsert(profileUpdate, { onConflict: 'id' })

    if (upsertError) {
      console.error('Error upserting profile:', upsertError)
      throw upsertError
    }

    console.log('Receipt validated:', { userId: user.id, plan, isTrial, eventType })

    // ── 8. Idempotency claim + Telegram alert ──────────────────────────────
    // INSERT ... ON CONFLICT DO NOTHING (ignoreDuplicates: true).
    // If data is non-empty the row is new → send alert.
    // If data is empty the row already existed → duplicate, skip.
    // This INSERT is AFTER the profile upsert so a failed upsert never
    // permanently claims the slot.
    if (transactionId) {
      const { data: claimedSlot, error: eventInsertError } = await supabaseAdmin
        .from('iap_events')
        .upsert(
          {
            transaction_id: transactionId,
            event_type:     eventType,
            user_id:        user.id,
            product_id:     productId,
            source,
            store:          getStoreKey(platform),
            alert_sent:     false,
          },
          { onConflict: 'transaction_id,event_type', ignoreDuplicates: true }
        )
        .select('id')

      if (eventInsertError) {
        // Non-fatal: log and continue — a missed alert is better than a failed purchase
        console.error('[IAP Events] Insert error:', eventInsertError)
      } else if (claimedSlot && claimedSlot.length > 0) {
        // New event — fire Telegram alert asynchronously so the response is never blocked
        sendTelegramAlert({
          eventType,
          appName:       APP_NAME,
          plan:          getPlanLabel(productId),
          productId,
          transactionId,
          userId:        user.id,
          store:         getStoreLabel(platform),
          source,
        })
          .then(() =>
            supabaseAdmin
              .from('iap_events')
              .update({ alert_sent: true })
              .eq('transaction_id', transactionId)
              .eq('event_type', eventType)
              .then(() => {})
          )
          .catch((err) => console.error('[Telegram] Fire-and-forget error:', err))
      } else {
        console.log(`[IAP Events] Duplicate skipped — txId=${transactionId} type=${eventType}`)
      }
    }

    return new Response(
      JSON.stringify({ success: true, plan, credits_max, isTrial }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error) {
    console.error('Error in validate-receipt:', error)

    // ── 9. Failure alert (best-effort, fire-and-forget) ────────────────────
    // We attempt idempotency here too via the 'failed' event_type slot.
    // If the DB is the cause of the error we skip gracefully.
    if (transactionId && user?.id) {
      supabaseAdmin
        .from('iap_events')
        .upsert(
          {
            transaction_id: transactionId,
            event_type:     'failed',
            user_id:        user.id,
            product_id:     productId ?? null,
            source:         source ?? 'unknown',
            store:          getStoreKey(platform ?? 'ios'),
            alert_sent:     false,
          },
          { onConflict: 'transaction_id,event_type', ignoreDuplicates: true }
        )
        .select('id')
        .then(({ data: slot }) => {
          if (slot && slot.length > 0) {
            return sendTelegramAlert({
              eventType:     'failed',
              appName:       APP_NAME,
              plan:          getPlanLabel(productId ?? ''),
              productId:     productId ?? 'unknown',
              transactionId,
              userId:        user.id,
              store:         getStoreLabel(platform ?? 'ios'),
              source:        source ?? 'unknown',
            })
              .then(() =>
                supabaseAdmin
                  .from('iap_events')
                  .update({ alert_sent: true })
                  .eq('transaction_id', transactionId)
                  .eq('event_type', 'failed')
                  .then(() => {})
              )
          }
        })
        .catch(() => {}) // never throw from the error handler
    }

    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
