import { Platform } from 'react-native';
import Purchases, {
  LOG_LEVEL,
  CustomerInfo,
  PurchasesOfferings,
  PurchasesPackage,
  PURCHASES_ERROR_CODE
} from 'react-native-purchases';
import { presentPaywall, presentCustomerCenter } from 'react-native-purchases-ui';

// Constants
const IOS_API_KEY = 'test_XGgtiLlQgfeebRJFuytyZNWrXNS';
const ANDROID_API_KEY = 'test_XGgtiLlQgfeebRJFuytyZNWrXNS';
const ENTITLEMENT_ID = 'AI Thumbnail Generator Pro';

/**
 * Initialize RevenueCat SDK
 * Call this once when your app starts
 */
export const initializeRevenueCat = async (): Promise<void> => {
  try {
    // Set log level for debugging
    Purchases.setLogLevel(LOG_LEVEL.VERBOSE);

    // Configure with platform-specific API key
    if (Platform.OS === 'ios') {
      await Purchases.configure({ apiKey: IOS_API_KEY });
    } else if (Platform.OS === 'android') {
      await Purchases.configure({ apiKey: ANDROID_API_KEY });
    }

    console.log('[RevenueCat] SDK initialized successfully');
  } catch (error) {
    console.error('[RevenueCat] Failed to initialize:', error);
    throw error;
  }
};

/**
 * Get current customer info
 * This includes all active subscriptions and entitlements
 */
export const getCustomerInfo = async (): Promise<CustomerInfo> => {
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    console.log('[RevenueCat] Customer info retrieved:', {
      activeSubscriptions: customerInfo.activeSubscriptions,
      allPurchasedProductIdentifiers: customerInfo.allPurchasedProductIdentifiers,
      entitlements: Object.keys(customerInfo.entitlements.active),
    });
    return customerInfo;
  } catch (error) {
    console.error('[RevenueCat] Failed to get customer info:', error);
    throw error;
  }
};

/**
 * Check if user has the Pro entitlement
 * @returns true if user has active Pro subscription
 */
export const isPro = async (): Promise<boolean> => {
  try {
    const customerInfo = await getCustomerInfo();
    const hasProEntitlement = customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;

    console.log('[RevenueCat] Pro status:', hasProEntitlement);
    return hasProEntitlement;
  } catch (error) {
    console.error('[RevenueCat] Failed to check Pro status:', error);
    return false;
  }
};

/**
 * Get available offerings and packages
 * This includes your configured products (monthly, yearly, weekly)
 */
export const getOfferings = async (): Promise<PurchasesOfferings | null> => {
  try {
    const offerings = await Purchases.getOfferings();

    if (offerings.current !== null) {
      console.log('[RevenueCat] Current offering:', {
        identifier: offerings.current.identifier,
        packages: offerings.current.availablePackages.map(pkg => ({
          identifier: pkg.identifier,
          product: pkg.product.identifier,
          price: pkg.product.priceString,
        })),
      });
    } else {
      console.log('[RevenueCat] No current offering available');
    }

    return offerings;
  } catch (error) {
    console.error('[RevenueCat] Failed to get offerings:', error);
    return null;
  }
};

/**
 * Purchase a package
 * @param packageToPurchase - The package to purchase
 * @returns CustomerInfo after successful purchase
 */
export const purchasePackage = async (
  packageToPurchase: PurchasesPackage
): Promise<{ customerInfo: CustomerInfo; userCancelled: boolean }> => {
  try {
    console.log('[RevenueCat] Attempting purchase:', packageToPurchase.identifier);

    const { customerInfo } = await Purchases.purchasePackage(packageToPurchase);

    console.log('[RevenueCat] Purchase successful:', {
      activeSubscriptions: customerInfo.activeSubscriptions,
      entitlements: Object.keys(customerInfo.entitlements.active),
    });

    return { customerInfo, userCancelled: false };
  } catch (error: any) {
    if (error.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) {
      console.log('[RevenueCat] Purchase cancelled by user');
      return { customerInfo: await getCustomerInfo(), userCancelled: true };
    }

    console.error('[RevenueCat] Purchase failed:', error);
    throw error;
  }
};

/**
 * Restore purchases
 * Call this to restore previous purchases
 */
export const restorePurchases = async (): Promise<CustomerInfo> => {
  try {
    console.log('[RevenueCat] Restoring purchases...');
    const customerInfo = await Purchases.restorePurchases();

    console.log('[RevenueCat] Purchases restored:', {
      activeSubscriptions: customerInfo.activeSubscriptions,
      entitlements: Object.keys(customerInfo.entitlements.active),
    });

    return customerInfo;
  } catch (error) {
    console.error('[RevenueCat] Failed to restore purchases:', error);
    throw error;
  }
};

/**
 * Present the RevenueCat Paywall
 * This shows a pre-built subscription screen
 * @param requiredEntitlementIdentifier - Optional entitlement to check
 */
export const showPaywall = async (
  requiredEntitlementIdentifier?: string
): Promise<void> => {
  try {
    console.log('[RevenueCat] Presenting paywall...');

    const result = await presentPaywall({
      requiredEntitlementIdentifier: requiredEntitlementIdentifier || ENTITLEMENT_ID,
    });

    if (result === 'PURCHASED' || result === 'RESTORED') {
      console.log('[RevenueCat] Paywall completed with:', result);
    } else {
      console.log('[RevenueCat] Paywall closed without purchase');
    }
  } catch (error) {
    console.error('[RevenueCat] Failed to present paywall:', error);
    throw error;
  }
};

/**
 * Present the Customer Center
 * This shows a screen where users can manage their subscriptions
 */
export const showCustomerCenter = async (): Promise<void> => {
  try {
    console.log('[RevenueCat] Presenting customer center...');
    await presentCustomerCenter();
  } catch (error) {
    console.error('[RevenueCat] Failed to present customer center:', error);
    throw error;
  }
};

/**
 * Set user ID for RevenueCat
 * Call this after user logs in
 * @param userId - Your app's user ID
 */
export const identifyUser = async (userId: string): Promise<void> => {
  try {
    console.log('[RevenueCat] Identifying user:', userId);
    await Purchases.logIn(userId);
    console.log('[RevenueCat] User identified successfully');
  } catch (error) {
    console.error('[RevenueCat] Failed to identify user:', error);
    throw error;
  }
};

/**
 * Clear user identity
 * Call this when user logs out
 */
export const logoutUser = async (): Promise<void> => {
  try {
    console.log('[RevenueCat] Logging out user...');
    await Purchases.logOut();
    console.log('[RevenueCat] User logged out successfully');
  } catch (error) {
    console.error('[RevenueCat] Failed to logout user:', error);
    throw error;
  }
};

/**
 * Set user attributes
 * Useful for analytics and targeting
 */
export const setUserAttributes = async (attributes: Record<string, string | null>): Promise<void> => {
  try {
    await Purchases.setAttributes(attributes);
    console.log('[RevenueCat] User attributes set');
  } catch (error) {
    console.error('[RevenueCat] Failed to set attributes:', error);
  }
};

export default {
  initializeRevenueCat,
  getCustomerInfo,
  isPro,
  getOfferings,
  purchasePackage,
  restorePurchases,
  showPaywall,
  showCustomerCenter,
  identifyUser,
  logoutUser,
  setUserAttributes,
};
