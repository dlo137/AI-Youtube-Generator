import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from "../../../lib/supabase";

export type SubscriptionPlan = 'weekly' | 'monthly' | 'yearly';

export interface SubscriptionData {
  subscription_plan: SubscriptionPlan;
  subscription_id: string;
  price: number;
  purchase_time: string;
  is_pro_version: boolean;
  is_trial_version: boolean;
  trial_end_date: string | null;
  credits_current: number;
  credits_max: number;
  last_credit_reset: string | null;
  trial_credits: number;
  paid_credits: number;
}

// ─── Device ID ────────────────────────────────────────────────────────────────
// One stable ID per app install. Used server-side to detect cross-account trial
// abuse (same device, different email). Cleared on uninstall.
const DEVICE_ID_KEY = 'app_device_id';

export async function getDeviceId(): Promise<string> {
  let id = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    // Simple UUID v4-like generation without extra dependencies
    id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
    await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

// ─── Trial eligibility (backend decides) ─────────────────────────────────────
// Calls the SECURITY DEFINER DB function so the check spans all profiles,
// not just the current user's row. Frontend only asks; backend answers.
export async function checkTrialEligibility(): Promise<boolean> {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return false;

    const deviceId = await getDeviceId();
    const email = user.email ?? '';

    const { data, error } = await supabase.rpc('check_trial_eligibility', {
      p_user_id:   user.id,
      p_email:     email,
      p_device_id: deviceId,
    });

    if (error) {
      console.error('[Trial] Eligibility check error:', error.message);
      return false; // fail safe: deny trial on error
    }

    return data === true;
  } catch (error) {
    console.error('[Trial] checkTrialEligibility threw:', error);
    return false;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getPriceForPlan(plan: SubscriptionPlan): number {
  switch (plan) {
    case 'weekly':  return 2.99;
    case 'monthly': return 5.99;
    case 'yearly':  return 39.99;
    default:        return 0;
  }
}

function calculateTrialEndDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 3);
  return d.toISOString();
}

function getPlanFromProductId(productId: string): SubscriptionPlan {
  if (productId.includes('yearly'))  return 'yearly';
  if (productId.includes('monthly')) return 'monthly';
  if (productId.includes('weekly'))  return 'weekly';
  return 'weekly';
}

// ─── Update subscription in profile ──────────────────────────────────────────
/**
 * Called from the purchase flow after a successful receipt validation.
 * Trial eligibility is validated server-side in validate-receipt; this
 * function is a client-side mirror to update local state.
 */
export async function updateSubscriptionInProfile(
  productId: string,
  purchaseId: string,
  purchaseTime?: string
): Promise<void> {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new Error('User not authenticated');

    const plan = getPlanFromProductId(productId);
    const price = getPriceForPlan(plan);

    // Server-side check: ask the backend whether this user is still eligible
    const eligible = await checkTrialEligibility();
    const isTrial = plan === 'yearly' && eligible;

    const now = purchaseTime || new Date().toISOString();

    const subscriptionData: Record<string, unknown> = {
      subscription_plan:  plan,
      subscription_id:    purchaseId,
      price,
      purchase_time:      now,
      is_pro_version:     true,
      is_trial_version:   isTrial,
      trial_end_date:     isTrial ? calculateTrialEndDate() : null,
    };

    if (isTrial) {
      subscriptionData.has_used_trial     = true;
      subscriptionData.free_trial_used_at = now;
      // trial_credits / paid_credits are managed by validate-receipt edge function;
      // we don't touch them here to avoid a race condition.
    } else {
      subscriptionData.trial_credits = 0; // wipe leftover trial credits on paid purchase
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update(subscriptionData)
      .eq('id', user.id);

    if (updateError) {
      console.error('Error updating subscription in profile:', updateError);
      throw updateError;
    }

    console.log('Successfully updated subscription in profile:', subscriptionData);
  } catch (error) {
    console.error('Failed to update subscription:', error);
    throw error;
  }
}

// ─── Get subscription info ────────────────────────────────────────────────────
export async function getSubscriptionInfo(): Promise<SubscriptionData | null> {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError) {
      console.log('[Subscription] User error:', userError.message);
      return null;
    }
    if (!user) {
      console.log('[Subscription] No user logged in');
      return null;
    }

    const { data, error, status, statusText } = await supabase
      .from('profiles')
      .select(
        'subscription_plan, subscription_id, price, purchase_time, ' +
        'is_pro_version, is_trial_version, trial_end_date, ' +
        'credits_current, credits_max, last_credit_reset, ' +
        'trial_credits, paid_credits'
      )
      .eq('id', user.id)
      .maybeSingle();

    console.log('[Subscription] Query status:', status, statusText);

    if (error) {
      console.error('[Subscription] Error fetching subscription info:', error.message, error.code, error.details);
      return null;
    }

    console.log('[Subscription] Profile data:', data ? 'found' : 'null', 'credits:', data?.credits_current, '/', data?.credits_max);

    return data as SubscriptionData | null;
  } catch (error: any) {
    console.error('[Subscription] Failed to get subscription info:', error?.message || error);
    return null;
  }
}

// ─── Active subscription check ────────────────────────────────────────────────
export async function hasActiveSubscription(): Promise<boolean> {
  const subscriptionInfo = await getSubscriptionInfo();
  if (!subscriptionInfo) return false;

  if (subscriptionInfo.is_pro_version) {
    if (subscriptionInfo.is_trial_version && subscriptionInfo.trial_end_date) {
      return new Date() < new Date(subscriptionInfo.trial_end_date);
    }
    return true;
  }

  return false;
}

// ─── Change plan ──────────────────────────────────────────────────────────────
export async function changePlan(newPlan: SubscriptionPlan): Promise<void> {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new Error('User not authenticated');

    const currentSub = await getSubscriptionInfo();
    if (!currentSub) throw new Error('No active subscription found');

    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        subscription_plan: newPlan,
        price:             getPriceForPlan(newPlan),
        is_trial_version:  false,
        trial_end_date:    null,
        trial_credits:     0, // moving to a new plan clears any remaining trial credits
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('Error changing plan:', updateError);
      throw updateError;
    }

    console.log(`Successfully changed plan to ${newPlan}`);
  } catch (error) {
    console.error('Failed to change plan:', error);
    throw error;
  }
}

// ─── Cancel subscription ──────────────────────────────────────────────────────
/**
 * Cancels the subscription and wipes trial_credits to prevent users from
 * canceling and keeping unused trial credits indefinitely.
 * has_used_trial is NOT reset — that record is permanent.
 */
export async function cancelSubscription(): Promise<void> {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new Error('User not authenticated');

    const currentSub = await getSubscriptionInfo();
    if (!currentSub) throw new Error('No active subscription found');

    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        is_pro_version:   false,
        is_trial_version: false,
        trial_end_date:   null,
        // Wipe trial credits so the user cannot keep consuming them after canceling.
        // paid_credits are left intact in case the billing period hasn't ended yet.
        trial_credits: 0,
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('Error cancelling subscription:', updateError);
      throw updateError;
    }

    console.log('Successfully cancelled subscription');
  } catch (error) {
    console.error('Failed to cancel subscription:', error);
    throw error;
  }
}
