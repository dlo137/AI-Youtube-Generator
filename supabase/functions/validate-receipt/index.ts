// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function normalizeEmail(email?: string | null): string | null {
  return email ? email.trim().toLowerCase() : null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    // User-scoped client — only used to verify the caller's JWT identity
    const supabaseUserClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: req.headers.get('Authorization')! },
      },
    })

    // Admin client — uses service role key to bypass RLS for profile updates
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    // Verify the caller is authenticated
    const { data: { user } } = await supabaseUserClient.auth.getUser()

    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    const { receipt, productId, transactionId, source, deviceId } = await req.json()

    console.log('Validating receipt:', { userId: user.id, productId, transactionId, source, deviceId })

    // Determine plan and credits based on productId
    let plan: 'yearly' | 'monthly' | 'weekly' = 'yearly'
    let credits_max = 0

    if (productId.includes('yearly')) {
      plan = 'yearly'
      credits_max = 90
    } else if (productId.includes('monthly')) {
      plan = 'monthly'
      credits_max = 75
    } else if (productId.includes('weekly')) {
      plan = 'weekly'
      credits_max = 10
    }

    const now = new Date().toISOString()

    // A restore/orphan source means auto-renewal (paid subscriber) — never grant a new trial
    const isRestore = source === 'restore' || source === 'orphan'

    // ── Trial eligibility: cross-profile check ──────────────────────────────
    // Even if the current profile has never used a trial, block it if another
    // profile with the same email or device has already consumed one.
    const userEmail = user.email ?? null
    const normalizedEmail = normalizeEmail(userEmail)

    let isTrial = false

    if (!isRestore) {
      // Use the SECURITY DEFINER DB function so RLS never filters out other rows
      const { data: eligibleResult, error: eligibilityError } = await supabaseAdmin
        .rpc('check_trial_eligibility', {
          p_user_id:   user.id,
          p_email:     normalizedEmail ?? '',
          p_device_id: deviceId ?? '',
        })

      if (eligibilityError) {
        console.error('Error checking trial eligibility:', eligibilityError)
        // Fail safe: deny trial on error
        isTrial = false
      } else {
        isTrial = eligibleResult === true
      }
    }

    const trialEndDate = isTrial
      ? new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
      : null

    // ── Build profile update ────────────────────────────────────────────────
    // Trial credits and paid credits are tracked separately so we can wipe
    // trial_credits on cancellation without affecting paid credits.
    const profileUpdate: Record<string, unknown> = {
      id:                    user.id,
      subscription_plan:     plan,
      subscription_id:       transactionId,
      is_pro_version:        true,
      entitlement:           'pro',
      is_trial_version:      isTrial,
      trial_end_date:        trialEndDate,
      product_id:            productId,
      purchase_time:         now,
      credits_current:       credits_max,
      credits_max:           credits_max,
      subscription_start_date: now,
      last_credit_reset:     now,
      updated_at:            now,
    }

    if (isTrial) {
      // Mark trial consumed — permanent, never reset
      profileUpdate.has_used_trial      = true
      profileUpdate.free_trial_used_at  = now
      profileUpdate.trial_credits       = credits_max
      profileUpdate.paid_credits        = 0

      // Store identity fields for future cross-profile checks
      if (normalizedEmail) profileUpdate.normalized_email = normalizedEmail
      if (deviceId)        profileUpdate.device_id        = deviceId
    } else {
      // Paid / restore purchase: wipe any remaining trial credits
      profileUpdate.trial_credits = 0
      profileUpdate.paid_credits  = credits_max

      // Still keep identity fields up-to-date
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

    console.log('Receipt validated successfully for user:', user.id, '| trial:', isTrial)

    return new Response(
      JSON.stringify({ success: true, plan, credits_max, isTrial }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error) {
    console.error('Error in validate-receipt function:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
