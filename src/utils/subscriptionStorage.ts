import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSubscriptionInfo as getSupabaseSubscriptionInfo } from '../features/subscription/api';
import { supabase } from '../../lib/supabase';

const SUBSCRIPTION_KEY = 'user_subscription';
const CREDITS_KEY = 'user_credits';

export interface SubscriptionInfo {
  isActive: boolean;
  productId: string;
  purchaseDate: string;
  expiryDate?: string;
}

export interface CreditsInfo {
  current: number;
  max: number;
  lastResetDate?: string;
}

export const saveSubscriptionInfo = async (subscriptionInfo: SubscriptionInfo): Promise<void> => {
  try {
    await AsyncStorage.setItem(SUBSCRIPTION_KEY, JSON.stringify(subscriptionInfo));
  } catch (error) {
    console.error('Error saving subscription info:', error);
    throw error;
  }
};

export const getSubscriptionInfo = async (): Promise<SubscriptionInfo | null> => {
  try {
    const stored = await AsyncStorage.getItem(SUBSCRIPTION_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch (error) {
    console.error('Error getting subscription info:', error);
    return null;
  }
};

export const clearSubscriptionInfo = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(SUBSCRIPTION_KEY);
  } catch (error) {
    console.error('Error clearing subscription info:', error);
    throw error;
  }
};

export const isUserSubscribed = async (): Promise<boolean> => {
  try {
    const subscriptionInfo = await getSubscriptionInfo();
    if (!subscriptionInfo) return false;

    // For auto-renewable subscriptions, you would validate with App Store/Play Store
    // For now, we'll just check if active
    return subscriptionInfo.isActive;
  } catch (error) {
    console.error('Error checking subscription status:', error);
    return false;
  }
};

// Track if we're currently resetting to prevent loops
let isResetting = false;

// Credits Management Functions - Uses Supabase profile as single source of truth
export const getCredits = async (): Promise<CreditsInfo> => {
  try {
    // ALWAYS fetch from Supabase profile first - this is the source of truth
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      // Get credits directly from Supabase profile
      const supabaseSubInfo = await getSupabaseSubscriptionInfo();

      if (supabaseSubInfo) {
        const credits: CreditsInfo = {
          current: supabaseSubInfo.credits_current || 0,
          max: supabaseSubInfo.credits_max || 0,
          lastResetDate: supabaseSubInfo.last_credit_reset || undefined
        };

        // Cache locally for offline access only
        await saveCredits(credits);
        console.log('[CREDITS] Fetched from Supabase:', credits);
        return credits;
      }
    }

    // Fallback to local cache ONLY if offline or not logged in
    console.log('[CREDITS] No Supabase data, using local cache');
    const stored = await AsyncStorage.getItem(CREDITS_KEY);
    if (stored) {
      return JSON.parse(stored);
    }

    // No data available
    const noCredits: CreditsInfo = { current: 0, max: 0 };
    await saveCredits(noCredits);
    return noCredits;
  } catch (error) {
    console.error('[CREDITS] Error getting credits:', error);

    // Try local cache on error
    try {
      const stored = await AsyncStorage.getItem(CREDITS_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (cacheError) {
      console.error('[CREDITS] Cache error:', cacheError);
    }

    return { current: 0, max: 0 };
  }
};

export const saveCredits = async (credits: CreditsInfo): Promise<void> => {
  try {
    await AsyncStorage.setItem(CREDITS_KEY, JSON.stringify(credits));
  } catch (error) {
    console.error('Error saving credits:', error);
    throw error;
  }
};

export const deductCredit = async (amount: number = 1): Promise<boolean> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      console.error('[CREDITS] Cannot deduct - user not authenticated');
      return false;
    }

    // Get current credits from Supabase
    const currentCredits = await getCredits();

    if (currentCredits.current < amount) {
      console.error('[CREDITS] Not enough credits:', currentCredits.current, '<', amount);
      return false;
    }

    // Calculate new credits
    const newCurrent = currentCredits.current - amount;

    // Update Supabase profile directly
    const { error } = await supabase
      .from('profiles')
      .update({ credits_current: newCurrent })
      .eq('id', user.id);

    if (error) {
      console.error('[CREDITS] Error deducting from Supabase:', error);
      return false;
    }

    // Update local cache
    const updatedCredits: CreditsInfo = {
      current: newCurrent,
      max: currentCredits.max,
      lastResetDate: currentCredits.lastResetDate
    };
    await saveCredits(updatedCredits);

    console.log('[CREDITS] Deducted', amount, '- new balance:', newCurrent);
    return true;
  } catch (error) {
    console.error('[CREDITS] Error deducting credit:', error);
    return false;
  }
};

export const resetCredits = async (): Promise<void> => {
  try {
    let maxCredits = 0; // No free plan - requires subscription

    // First check Supabase subscription info
    try {
      const supabaseSubInfo = await getSupabaseSubscriptionInfo();
      if (supabaseSubInfo && supabaseSubInfo.is_pro_version) {
        if (supabaseSubInfo.subscription_plan === 'yearly') {
          maxCredits = 90;
        } else if (supabaseSubInfo.subscription_plan === 'monthly') {
          maxCredits = 75;
        } else if (supabaseSubInfo.subscription_plan === 'weekly') {
          maxCredits = 10;
        } else if (supabaseSubInfo.subscription_plan === 'discounted_weekly') {
          maxCredits = 10;
        }
      }
    } catch (error) {
      console.log('Could not fetch Supabase subscription, checking local storage');
    }

    // Fallback to local storage if Supabase didn't provide info
    if (maxCredits === 0) {
      const subscriptionInfo = await getSubscriptionInfo();
      if (subscriptionInfo && subscriptionInfo.isActive) {
        if (subscriptionInfo.productId === 'thumbnail.yearly') {
          maxCredits = 90;
        } else if (subscriptionInfo.productId === 'thumbnail.monthly') {
          maxCredits = 75;
        } else if (subscriptionInfo.productId === 'thumbnail.weekly') {
          maxCredits = 10;
        }
      }
    }

    const credits: CreditsInfo = {
      current: maxCredits,
      max: maxCredits,
      lastResetDate: new Date().toISOString()
    };

    // Try to reset in Supabase first
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        await supabase.functions.invoke('manage-credits', {
          body: { action: 'reset' }
        });
      }
    } catch (supabaseError) {
      console.log('Could not reset in Supabase, updating locally only:', supabaseError);
    }

    await saveCredits(credits);
  } catch (error) {
    console.error('Error resetting credits:', error);
    throw error;
  }
};

export const initializeCredits = async (): Promise<void> => {
  try {
    const existingCredits = await AsyncStorage.getItem(CREDITS_KEY);
    if (!existingCredits) {
      await resetCredits();
    } else {
      // Migration: Remove old free plan credits
      const credits = JSON.parse(existingCredits);
      if (credits.max === 10 || credits.max === 10000 || credits.max === 100) {
        // User has old free plan, remove free credits
        await resetCredits();
      }
    }
  } catch (error) {
    console.error('Error initializing credits:', error);
  }
};