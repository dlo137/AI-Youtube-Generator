// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  decodeProtectedHeader,
  importX509,
  compactVerify,
} from 'https://esm.sh/jose@5.6.3'
import { sendTelegramAlert, IapEventType } from '../_shared/sendTelegramAlert.ts'

// ─────────────────────────────────────────────────────────────────────────────
// Notification type → internal event type mapping.
// null  = informational only (auto-renew toggle, price consent, etc.) — no alert.
// Absent key = unknown type — log and ignore.
// ─────────────────────────────────────────────────────────────────────────────
const NOTIFICATION_EVENT_MAP: Record<string, IapEventType | null> = {
  SUBSCRIBED:                'purchase',   // New subscription (overlap with client-side; dedup handles it)
  DID_RENEW:                 'renewal',    // Successful auto-renewal payment
  EXPIRED:                   'expired',    // No renewal before expiry date
  DID_FAIL_TO_RENEW:         'failed',     // Billing retry started (grace period active)
  GRACE_PERIOD_EXPIRED:      'expired',    // Grace period ended — subscription lapsed
  REFUND:                    'cancelled',  // Apple issued a refund
  REVOKE:                    'cancelled',  // Family-sharing member lost access
  OFFER_REDEEMED:            'discount',   // Promotional / offer code applied
  DID_CHANGE_RENEWAL_STATUS: null,         // User toggled auto-renew on/off
  PRICE_INCREASE:            null,         // Price increase consent request
  RENEWAL_EXTENDED:          null,         // Apple extended the renewal date
  CONSUMPTION_REQUEST:       null,         // Consumable info request
}

// Event types that should revoke the user's entitlement in the profiles table.
const REVOKE_ENTITLEMENT_EVENTS = new Set<IapEventType>(['expired', 'cancelled'])

// ─────────────────────────────────────────────────────────────────────────────
// JWS helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Decodes an Apple-signed JWS compact serialization and verifies its signature
 * using the leaf certificate embedded in the x5c header.
 *
 * This implementation verifies the signature but does not walk the full
 * certificate chain. For maximum hardening, also verify:
 *   - x5c[1] is the Apple Worldwide Developer Relations CA (WWDR G6/G3)
 *   - x5c[2] is the Apple Root CA - G3
 *   - Each certificate's notBefore / notAfter validity window
 * These checks would require a DER parser (e.g. https://deno.land/x/asn1).
 */
async function decodeAppleJws(jws: string): Promise<Record<string, unknown>> {
  const header = decodeProtectedHeader(jws)
  const x5c    = header.x5c as string[] | undefined

  if (!x5c || x5c.length === 0) {
    throw new Error('JWS x5c certificate chain is missing or empty')
  }

  const leafPem = [
    '-----BEGIN CERTIFICATE-----',
    x5c[0],  // x5c entries are standard base64, not base64url
    '-----END CERTIFICATE-----',
  ].join('\n')

  const publicKey          = await importX509(leafPem, 'ES256')
  const { payload: raw }   = await compactVerify(jws, publicKey)
  return JSON.parse(new TextDecoder().decode(raw))
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper
// ─────────────────────────────────────────────────────────────────────────────

function getPlanLabel(productId: string): string {
  if (productId.includes('yearly'))  return 'Yearly'
  if (productId.includes('monthly')) return 'Monthly'
  if (productId.includes('weekly'))  return 'Weekly'
  return productId
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

serve(async (req) => {
  // This endpoint is server-to-server (Apple → Supabase). No CORS needed.
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  // IMPORTANT: always return HTTP 200 to Apple, even when we encounter an
  // internal error. A non-2xx response causes Apple to retry the notification
  // up to ~180 days — which would cause duplicate alerts and duplicate revocations.
  // Errors are logged to Supabase edge function logs instead.

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')             ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  try {
    // ── 1. Parse body ────────────────────────────────────────────────────────
    const body = await req.json().catch(() => null)

    if (!body?.signedPayload || typeof body.signedPayload !== 'string') {
      console.error('[ASSN] Request body missing signedPayload')
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // ── 2. Verify and decode outer notification JWS ──────────────────────────
    const notification = await decodeAppleJws(body.signedPayload) as {
      notificationType: string
      subtype?:         string
      notificationUUID: string
      version:          string
      signedDate:       number
      data?: {
        environment:           string
        bundleId?:             string
        signedTransactionInfo: string
        signedRenewalInfo?:    string
      }
      summary?: unknown
    }

    const { notificationType, notificationUUID, data: notifData } = notification

    console.log('[ASSN] Received:', {
      notificationType,
      notificationUUID,
      environment: notifData?.environment,
      subtype:     notification.subtype,
    })

    // ── 3. Route by notification type ────────────────────────────────────────
    if (!(notificationType in NOTIFICATION_EVENT_MAP)) {
      console.log(`[ASSN] Unknown notificationType "${notificationType}" — ignoring`)
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const eventType = NOTIFICATION_EVENT_MAP[notificationType]

    if (eventType === null) {
      console.log(`[ASSN] Informational notification "${notificationType}" — no action needed`)
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // ── 4. Decode signed transaction info ────────────────────────────────────
    if (!notifData?.signedTransactionInfo) {
      console.error('[ASSN] Missing signedTransactionInfo for type:', notificationType)
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const txInfo = await decodeAppleJws(notifData.signedTransactionInfo) as {
      transactionId:         string
      originalTransactionId: string
      productId:             string
      type?:                 string
      environment?:          string
    }

    const { transactionId, originalTransactionId, productId } = txInfo

    console.log('[ASSN] Transaction:', { transactionId, originalTransactionId, productId, eventType })

    // ── 5. Idempotency check ─────────────────────────────────────────────────
    // notificationUUID is globally unique per Apple notification and is the
    // correct dedup key here. A DID_RENEW fires every renewal cycle — each
    // has a different UUID so each gets its own alert. Apple retries use the
    // same UUID so the ON CONFLICT DO NOTHING suppresses them.
    //
    // We store notificationUUID in transaction_id (the idempotency column).
    // The actual StoreKit transactionId is only used in the Telegram message.
    const { data: claimedSlot, error: insertError } = await supabaseAdmin
      .from('iap_events')
      .upsert(
        {
          transaction_id: notificationUUID,
          event_type:     eventType,
          product_id:     productId,
          source:         'assn_v2',
          store:          'apple',
          alert_sent:     false,
        },
        { onConflict: 'transaction_id,event_type', ignoreDuplicates: true }
      )
      .select('id')

    if (insertError) {
      // Non-fatal: log and continue so the revocation still runs
      console.error('[ASSN] iap_events insert error:', insertError)
    }

    const isNewEvent = claimedSlot && claimedSlot.length > 0

    if (!isNewEvent) {
      console.log(`[ASSN] Duplicate notification — skipping. uuid=${notificationUUID} type=${eventType}`)
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // ── 6. Profile lookup ────────────────────────────────────────────────────
    // Try to find the Supabase user associated with this Apple subscription.
    // The profiles table stores subscription_id = transactionId, which gets
    // overwritten on each renewal. So for the initial purchase it matches
    // originalTransactionId; for later renewals it may match the latest transactionId.
    //
    // TODO: for perfect lookup reliability, store original_transaction_id in
    // profiles during the SUBSCRIBED event (once ASSN V2 is live) and index it.
    let foundUserId: string | null = null

    const { data: profileRows } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .or(`subscription_id.eq.${originalTransactionId},subscription_id.eq.${transactionId}`)
      .limit(1)

    if (profileRows && profileRows.length > 0) {
      foundUserId = profileRows[0].id
    } else {
      console.warn('[ASSN] No profile matched for this subscription — alert will show userId: unknown', {
        originalTransactionId,
        transactionId,
      })
    }

    // ── 7. Revoke entitlement for EXPIRED / CANCELLED ────────────────────────
    if (REVOKE_ENTITLEMENT_EVENTS.has(eventType) && foundUserId) {
      const { error: revokeError } = await supabaseAdmin
        .from('profiles')
        .update({
          is_pro_version:   false,
          entitlement:      'free',
          is_trial_version: false,
          updated_at:       new Date().toISOString(),
        })
        .eq('id', foundUserId)

      if (revokeError) {
        console.error('[ASSN] Entitlement revocation failed:', revokeError)
      } else {
        console.log('[ASSN] Entitlement revoked for user:', foundUserId)
      }
    }

    // ── 8. Telegram alert (fire-and-forget) ──────────────────────────────────
    sendTelegramAlert({
      eventType,
      appName:       'AI Thumbnail Generator',
      plan:          getPlanLabel(productId),
      productId,
      transactionId,   // real StoreKit txId shown in the message
      userId:        foundUserId ?? 'unknown',
      store:         'Apple App Store',
      source:        'assn_v2',
    })
      .then(() =>
        supabaseAdmin
          .from('iap_events')
          .update({
            alert_sent: true,
            user_id:    foundUserId ?? null,
          })
          .eq('transaction_id', notificationUUID)  // use UUID — not txId — to match the inserted row
          .eq('event_type', eventType)
          .then(() => {})
      )
      .catch((err) => console.error('[Telegram] ASSN fire-and-forget error:', err))

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })

  } catch (err) {
    // Catch JWS verification failures, JSON parse errors, etc.
    // Still return 200 — Apple must not retry a notification we've received and logged.
    console.error('[ASSN] Unhandled error:', err instanceof Error ? err.message : String(err))
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
