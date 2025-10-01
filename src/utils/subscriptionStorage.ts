import AsyncStorage from '@react-native-async-storage/async-storage';

const SUBSCRIPTION_KEY = 'user_subscription';

export interface SubscriptionInfo {
  isActive: boolean;
  productId: string;
  purchaseDate: string;
  expiryDate?: string;
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