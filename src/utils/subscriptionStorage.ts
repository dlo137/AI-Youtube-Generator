import AsyncStorage from '@react-native-async-storage/async-storage';

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

// Credits Management Functions
export const getCredits = async (): Promise<CreditsInfo> => {
  try {
    const stored = await AsyncStorage.getItem(CREDITS_KEY);
    if (stored) {
      return JSON.parse(stored);
    }

    // Initialize with free plan credits if not found
    const initialCredits: CreditsInfo = { current: 10, max: 10 };
    await saveCredits(initialCredits);
    return initialCredits;
  } catch (error) {
    console.error('Error getting credits:', error);
    return { current: 10, max: 10 };
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

export const deductCredit = async (): Promise<boolean> => {
  try {
    const credits = await getCredits();
    if (credits.current <= 0) {
      return false; // No credits left
    }

    credits.current -= 1;
    await saveCredits(credits);
    return true;
  } catch (error) {
    console.error('Error deducting credit:', error);
    return false;
  }
};

export const resetCredits = async (): Promise<void> => {
  try {
    const subscriptionInfo = await getSubscriptionInfo();
    let maxCredits = 10; // Default free plan

    if (subscriptionInfo && subscriptionInfo.isActive) {
      if (subscriptionInfo.productId === 'thumbnail.pro.yearly') {
        maxCredits = 300;
      } else if (subscriptionInfo.productId === 'thumbnail.pro.monthly') {
        maxCredits = 200;
      } else if (subscriptionInfo.productId === 'thumbnail.pro.weekly') {
        maxCredits = 100;
      }
    }

    const credits: CreditsInfo = {
      current: maxCredits,
      max: maxCredits,
      lastResetDate: new Date().toISOString()
    };

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
    }
  } catch (error) {
    console.error('Error initializing credits:', error);
  }
};