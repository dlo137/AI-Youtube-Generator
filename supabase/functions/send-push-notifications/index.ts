// @ts-nocheck
// send-push-notifications
//
// Fetches eligible users, sends re-engagement pushes via the Expo Push API,
// logs every attempt to notification_logs, and invalidates dead tokens.
//
// Designed to be called by:
//   - Supabase cron (pg_cron / Supabase Scheduled Functions)
//   - External scheduler (GitHub Actions, etc.)
//   - Manual HTTP POST for testing
//
// Always returns HTTP 200 — callers should read the JSON body for errors.
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'
const EXPO_BATCH_SIZE = 100  // Expo's documented maximum per request

// ─────────────────────────────────────────────────────────────────────────────
// Notification catalogue
//
// Add new notification types here. Each entry is self-contained so the
// eligibility query and message copy stay co-located.
// ─────────────────────────────────────────────────────────────────────────────
type NotificationType = 're_engagement' | 'credit_reset' | 'unused_credits' | 'announcement'

interface NotificationConfig {
  title: string
  body:  string
  data?: Record<string, unknown>
}

const NOTIFICATIONS: Record<NotificationType, NotificationConfig> = {
  re_engagement: {
    title: 'Still creating? 🎬',
    body:  'Still need a thumbnail for your next video? Generate 3 options now.',
    data:  { screen: 'generate' },
  },
  credit_reset: {
    title: 'Your credits just reset! 🔄',
    body:  'Your thumbnail credits are ready. Go generate something great.',
    data:  { screen: 'generate' },
  },
  unused_credits: {
    title: 'You have unused credits 🎨',
    body:  "You haven't generated a thumbnail yet this week. Don't let them go to waste!",
    data:  { screen: 'generate' },
  },
  announcement: {
    title: 'New styles available ✨',
    body:  'Check out the latest thumbnail styles — just added to the generator.',
    data:  { screen: 'generate' },
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface EligibleToken {
  id:               string  // push_tokens.id
  user_id:          string
  expo_push_token:  string
  platform:         string
}

interface ExpoMessage {
  to:    string
  title: string
  body:  string
  data?: Record<string, unknown>
  sound?: 'default' | null
  badge?: number
  channelId?: string
}

interface ExpoTicket {
  status:  'ok' | 'error'
  id?:     string   // receipt ID when status === 'ok'
  message?: string
  details?: { error?: string }
}

interface SendResult {
  token_id:        string
  user_id:         string
  expo_push_token: string
  status:          'sent' | 'failed' | 'invalid_token'
  expo_receipt_id?: string
  error_message?:  string
}

// ─────────────────────────────────────────────────────────────────────────────
// Expo Push API
// ─────────────────────────────────────────────────────────────────────────────
async function sendExpoBatch(messages: ExpoMessage[]): Promise<ExpoTicket[]> {
  const res = await fetch(EXPO_PUSH_URL, {
    method:  'POST',
    headers: {
      'Content-Type':    'application/json',
      'Accept':          'application/json',
      'Accept-encoding': 'gzip, deflate',
    },
    body: JSON.stringify(messages),
  })

  if (!res.ok) {
    throw new Error(`Expo Push API HTTP ${res.status}: ${await res.text()}`)
  }

  const json = await res.json()
  return json.data as ExpoTicket[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Main handler
// ─────────────────────────────────────────────────────────────────────────────
serve(async (req) => {
  // ── Security ───────────────────────────────────────────────────────────────
  // Require CRON_SECRET header to prevent unauthorized invocations.
  // Set this in Supabase secrets: supabase secrets set CRON_SECRET=<random>
  const cronSecret = Deno.env.get('CRON_SECRET')
  if (cronSecret) {
    const provided = req.headers.get('x-cron-secret')
    if (provided !== cronSecret) {
      return new Response(
        JSON.stringify({ error: 'Forbidden' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      )
    }
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')             ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  const stats = {
    eligible: 0,
    sent:     0,
    failed:   0,
    invalid:  0,
    errors:   [] as string[],
  }

  try {
    // ── Parse request ────────────────────────────────────────────────────────
    const body = await req.json().catch(() => ({}))
    const notificationType: NotificationType = body.notification_type ?? 're_engagement'

    const config = NOTIFICATIONS[notificationType]
    if (!config) {
      return new Response(
        JSON.stringify({ error: `Unknown notification_type: ${notificationType}` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[Push] Starting send — type: ${notificationType}`)

    // ── Step 1: Query push_tokens directly ───────────────────────────────────
    // Eligibility rules applied here:
    //   - notifications_enabled = true
    //   - marketing_opt_in = true
    //   - expo_push_token is not null
    //   - last_push_sent_at older than 72 hours, or never sent
    const seventyTwoHoursAgo = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString()

    const { data: tokens, error: queryError } = await supabaseAdmin
      .from('push_tokens')
      .select('id, user_id, expo_push_token, platform')
      .eq('notifications_enabled', true)
      .eq('marketing_opt_in', true)
      .not('expo_push_token', 'is', null)
      .or(`last_push_sent_at.is.null,last_push_sent_at.lt.${seventyTwoHoursAgo}`)

    if (queryError) {
      throw new Error(`push_tokens query failed: ${queryError.message}`)
    }

    if (!tokens || tokens.length === 0) {
      return new Response(
        JSON.stringify({ ...stats, message: 'No tokens passed initial filter' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // ── Step 2: Fetch profiles for those user IDs ─────────────────────────────
    const userIds = [...new Set(tokens.map((t: any) => t.user_id))]

    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from('profiles')
      .select('id, last_opened_at')
      .in('id', userIds)

    if (profilesError) {
      throw new Error(`profiles query failed: ${profilesError.message}`)
    }

    // ── Step 3: Merge and apply last_opened_at gate ───────────────────────────
    // A user opening the app on any device updates profiles.last_opened_at,
    // so this suppresses pushes to ALL their devices — preventing multi-device spam.
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
    const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]))

    const eligible: EligibleToken[] = (tokens as any[]).filter((t) => {
      const profile = profileMap.get(t.user_id)
      const lastOpened = profile?.last_opened_at
      if (!lastOpened) return true  // never opened = definitely eligible
      return new Date(lastOpened) < threeDaysAgo
    })

    stats.eligible = eligible.length
    console.log(`[Push] Eligible tokens: ${stats.eligible}`)

    if (eligible.length === 0) {
      return new Response(
        JSON.stringify({ ...stats, message: 'No eligible users' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // ── Build messages ───────────────────────────────────────────────────────
    const messages: ExpoMessage[] = eligible.map((t) => ({
      to:        t.expo_push_token,
      title:     config.title,
      body:      config.body,
      data:      { ...config.data, userId: t.user_id },
      sound:     'default',
      channelId: 'default',  // Android channel created by the app
    }))

    // ── Send in batches of 100 ───────────────────────────────────────────────
    const results: SendResult[] = []
    const invalidTokenIds: string[] = []
    const now = new Date().toISOString()

    for (let i = 0; i < messages.length; i += EXPO_BATCH_SIZE) {
      const batchMessages  = messages.slice(i, i + EXPO_BATCH_SIZE)
      const batchTokens    = eligible.slice(i, i + EXPO_BATCH_SIZE)

      let tickets: ExpoTicket[] = []
      try {
        tickets = await sendExpoBatch(batchMessages)
      } catch (batchErr: any) {
        // Batch-level failure — log every token in this batch as failed
        console.error('[Push] Batch send error:', batchErr.message)
        stats.errors.push(batchErr.message)
        for (const t of batchTokens) {
          results.push({
            token_id:        t.id,
            user_id:         t.user_id,
            expo_push_token: t.expo_push_token,
            status:          'failed',
            error_message:   batchErr.message,
          })
          stats.failed++
        }
        continue
      }

      // Map tickets back to tokens (same order guaranteed by Expo)
      for (let j = 0; j < tickets.length; j++) {
        const ticket = tickets[j]
        const token  = batchTokens[j]

        if (ticket.status === 'ok') {
          results.push({
            token_id:        token.id,
            user_id:         token.user_id,
            expo_push_token: token.expo_push_token,
            status:          'sent',
            expo_receipt_id: ticket.id,
          })
          stats.sent++
        } else {
          const isInvalid = ticket.details?.error === 'DeviceNotRegistered'
          results.push({
            token_id:        token.id,
            user_id:         token.user_id,
            expo_push_token: token.expo_push_token,
            status:          isInvalid ? 'invalid_token' : 'failed',
            error_message:   ticket.message,
          })
          if (isInvalid) {
            invalidTokenIds.push(token.id)
            stats.invalid++
          } else {
            stats.failed++
          }
        }
      }
    }

    // ── Invalidate dead tokens ───────────────────────────────────────────────
    if (invalidTokenIds.length > 0) {
      const { error: invalidateError } = await supabaseAdmin
        .from('push_tokens')
        .update({ notifications_enabled: false, updated_at: now })
        .in('id', invalidTokenIds)

      if (invalidateError) {
        console.error('[Push] Failed to invalidate tokens:', invalidateError.message)
        stats.errors.push(`Token invalidation: ${invalidateError.message}`)
      } else {
        console.log(`[Push] Invalidated ${invalidTokenIds.length} dead token(s)`)
      }
    }

    // ── Update last_push_sent_at for sent tokens ─────────────────────────────
    const sentTokenIds = results
      .filter((r) => r.status === 'sent')
      .map((r) => r.token_id)

    if (sentTokenIds.length > 0) {
      const { error: updateError } = await supabaseAdmin
        .from('push_tokens')
        .update({ last_push_sent_at: now, updated_at: now })
        .in('id', sentTokenIds)

      if (updateError) {
        console.error('[Push] Failed to update last_push_sent_at:', updateError.message)
        stats.errors.push(`last_push_sent_at update: ${updateError.message}`)
      }
    }

    // ── Write notification_logs ───────────────────────────────────────────────
    if (results.length > 0) {
      const logRows = results.map((r) => ({
        user_id:           r.user_id,
        push_token_id:     r.token_id,
        notification_type: notificationType,
        title:             config.title,
        body:              config.body,
        status:            r.status,
        expo_receipt_id:   r.expo_receipt_id ?? null,
        error_message:     r.error_message ?? null,
        sent_at:           now,
      }))

      const { error: logError } = await supabaseAdmin
        .from('notification_logs')
        .insert(logRows)

      if (logError) {
        console.error('[Push] Failed to write notification_logs:', logError.message)
        stats.errors.push(`notification_logs: ${logError.message}`)
      }
    }

    console.log('[Push] Done —', JSON.stringify(stats))

    return new Response(JSON.stringify(stats), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })

  } catch (err: any) {
    // Top-level catch — log and return 200 so schedulers don't retry infinitely
    const message = err instanceof Error ? err.message : String(err)
    console.error('[Push] Unhandled error:', message)
    stats.errors.push(message)

    return new Response(
      JSON.stringify({ ...stats, fatal_error: message }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
