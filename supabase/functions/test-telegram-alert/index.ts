// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// test-telegram-alert — DEV / admin only
//
// Fires a test Telegram purchase notification without touching the real
// purchase flow, validate-receipt, or iap_events table.
// Completely isolated from production logic by design.
// ─────────────────────────────────────────────────────────────────────────────
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function formatTimestamp(): string {
  try {
    return new Date().toLocaleString('en-US', {
      timeZone: 'America/New_York',
      year:     'numeric',
      month:    '2-digit',
      day:      '2-digit',
      hour:     '2-digit',
      minute:   '2-digit',
      hour12:   false,
    }) + ' EST'
  } catch {
    return new Date().toISOString()
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders })
  }

  const supabaseUrl     = Deno.env.get('SUPABASE_URL')     ?? ''
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const appEnv          = Deno.env.get('APP_ENV')           ?? 'production'
  const adminUserId     = Deno.env.get('ADMIN_USER_ID')     ?? ''
  const botToken        = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? ''
  const chatId          = Deno.env.get('TELEGRAM_CHAT_ID')  ?? ''

  // ── 1. Auth ────────────────────────────────────────────────────────────────
  const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: req.headers.get('Authorization')! } },
  })

  const { data: { user }, error: authError } = await supabaseClient.auth.getUser()

  if (authError || !user) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // ── 2. Environment guard ───────────────────────────────────────────────────
  // Allow if:  APP_ENV is anything other than "production"
  //       OR:  the caller is the designated admin user
  const isNonProduction = appEnv !== 'production'
  const isAdmin         = adminUserId.length > 0 && user.id === adminUserId

  if (!isNonProduction && !isAdmin) {
    console.warn('[test-telegram-alert] Blocked — production env and non-admin caller:', user.id)
    return new Response(
      JSON.stringify({ error: 'Forbidden: test functions are disabled in production' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // ── 3. Telegram credential check ──────────────────────────────────────────
  if (!botToken || !chatId) {
    console.error('[test-telegram-alert] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set')
    return new Response(
      JSON.stringify({ error: 'Telegram credentials are not configured' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // ── 4. Build message ───────────────────────────────────────────────────────
  // Uses its own format instead of sendTelegramAlert() so this file stays
  // 100% isolated from production event routing and never needs a 'test'
  // entry added to the shared LABEL/EMOJI maps.
  const testTransactionId = `expo_test_${Date.now()}`
  const timestamp         = formatTimestamp()

  const text = [
    '🚨 TEST PURCHASE ALERT',
    '',
    'App: AI Thumbnail Generator',
    'Plan: Weekly',
    'Product ID: thumbnail.weekly',
    `Transaction ID: ${testTransactionId}`,
    `User ID: ${user.id}`,
    'Source: expo_go_test',
    `Timestamp: ${timestamp}`,
  ].join('\n')

  // ── 5. Send ────────────────────────────────────────────────────────────────
  console.log('[test-telegram-alert] Sending test alert for user:', user.id, '| env:', appEnv)

  const telegramRes = await fetch(
    `https://api.telegram.org/bot${botToken}/sendMessage`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ chat_id: chatId, text }),
    }
  )

  if (!telegramRes.ok) {
    const body = await telegramRes.text().catch(() => '(unreadable)')
    console.error('[test-telegram-alert] Telegram API error:', telegramRes.status, body)
    return new Response(
      JSON.stringify({ error: `Telegram API returned ${telegramRes.status}` }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  console.log('[test-telegram-alert] ✅ Alert delivered. txId:', testTransactionId)

  return new Response(
    JSON.stringify({ success: true, transactionId: testTransactionId }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
