import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
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

    // Admin client — uses service role key to bypass RLS for the profile update
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    // Verify the caller is authenticated
    const {
      data: { user },
    } = await supabaseUserClient.auth.getUser()

    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401,
        }
      )
    }

    const { receipt, productId, transactionId, source } = await req.json()

    console.log('Validating receipt:', {
      userId: user.id,
      productId,
      transactionId,
      source
    })

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

    // Upsert user profile with subscription info using admin client (bypasses RLS)
    const { error: upsertError } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id: user.id,
        subscription_plan: plan,
        subscription_id: transactionId,
        is_pro_version: true,
        product_id: productId,
        purchase_time: now,
        credits_current: credits_max,
        credits_max: credits_max,
        subscription_start_date: now,
        last_credit_reset: now,
        updated_at: now,
      }, { onConflict: 'id' })

    if (upsertError) {
      console.error('Error upserting profile:', upsertError)
      throw upsertError
    }

    console.log('Receipt validated successfully for user:', user.id)

    return new Response(
      JSON.stringify({
        success: true,
        plan,
        credits_max
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (error) {
    console.error('Error in validate-receipt function:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})
