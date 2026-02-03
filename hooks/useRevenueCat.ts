import { useState, useEffect, useCallback } from 'react';
import Purchases, { CustomerInfo, PurchasesOfferings } from 'react-native-purchases';
import {
  getCustomerInfo,
  isPro,
  getOfferings,
  showPaywall,
  showCustomerCenter,
  restorePurchases,
} from '../lib/revenuecat';

/**
 * Custom hook for using RevenueCat in your components
 *
 * Example usage:
 * ```tsx
 * const { isProUser, loading, offerings, presentPaywall, presentCustomerCenter } = useRevenueCat();
 *
 * if (isProUser) {
 *   // Show premium features
 * } else {
 *   // Show upgrade button
 *   <Button onPress={presentPaywall} title="Upgrade to Pro" />
 * }
 * ```
 */
export const useRevenueCat = () => {
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [offerings, setOfferings] = useState<PurchasesOfferings | null>(null);
  const [isProUser, setIsProUser] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Load customer info and offerings on mount
  useEffect(() => {
    loadData();

    // Listen for customer info updates
    const customerInfoListener = Purchases.addCustomerInfoUpdateListener((info) => {
      console.log('[useRevenueCat] Customer info updated');
      setCustomerInfo(info);
      checkProStatus(info);
    });

    return () => {
      customerInfoListener.remove();
    };
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load customer info and offerings in parallel
      const [info, offers, proStatus] = await Promise.all([
        getCustomerInfo(),
        getOfferings(),
        isPro(),
      ]);

      setCustomerInfo(info);
      setOfferings(offers);
      setIsProUser(proStatus);
    } catch (err: any) {
      console.error('[useRevenueCat] Failed to load data:', err);
      setError(err.message || 'Failed to load subscription data');
    } finally {
      setLoading(false);
    }
  };

  const checkProStatus = useCallback((info: CustomerInfo) => {
    const hasPro = info.entitlements.active['AI Thumbnail Generator Pro'] !== undefined;
    setIsProUser(hasPro);
  }, []);

  const presentPaywall = useCallback(async () => {
    try {
      await showPaywall();
      // Refresh customer info after paywall is dismissed
      await loadData();
    } catch (err: any) {
      console.error('[useRevenueCat] Failed to present paywall:', err);
      setError(err.message || 'Failed to show paywall');
    }
  }, []);

  const presentCustomerCenter = useCallback(async () => {
    try {
      await showCustomerCenter();
      // Refresh customer info after customer center is dismissed
      await loadData();
    } catch (err: any) {
      console.error('[useRevenueCat] Failed to present customer center:', err);
      setError(err.message || 'Failed to show customer center');
    }
  }, []);

  const restore = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const info = await restorePurchases();
      setCustomerInfo(info);
      checkProStatus(info);
      return true;
    } catch (err: any) {
      console.error('[useRevenueCat] Failed to restore purchases:', err);
      setError(err.message || 'Failed to restore purchases');
      return false;
    } finally {
      setLoading(false);
    }
  }, [checkProStatus]);

  const refresh = useCallback(async () => {
    await loadData();
  }, []);

  return {
    // State
    customerInfo,
    offerings,
    isProUser,
    loading,
    error,

    // Actions
    presentPaywall,
    presentCustomerCenter,
    restore,
    refresh,
  };
};

export default useRevenueCat;
