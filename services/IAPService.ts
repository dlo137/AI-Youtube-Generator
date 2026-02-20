import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Platform } from 'react-native';
import { supabase } from '../lib/supabase';

// Conditionally import react-native-iap to avoid crashes in Expo Go
let RNIap: any = null;

// Suppress the error completely by wrapping in try-catch
try {
  // Try to load the module - will fail silently in Expo Go
  RNIap = require('react-native-iap');
} catch (error) {
  // Silently ignore the error - this is expected in Expo Go
  console.log('[IAP-SERVICE] Running in Expo Go - IAP features disabled');
}

// Platform-specific product IDs
const IOS_PRODUCT_IDS = [
  'thumbnail.yearly',
  'thumbnail.monthly',
  'thumbnail.weekly',
  'discounted.weekly'
];

const ANDROID_PRODUCT_IDS = [
  'ai.thumbnail.pro:yearly',
  'ai.thumbnail.pro:monthly',
  'ai.thumbnail.pro:weekly',
  'discounted.weekly'
];

const INFLIGHT_KEY = 'iapPurchaseInFlight';

class IAPService {
  private static instance: IAPService;
  private isConnected: boolean = false;
  private hasListener: boolean = false;
  private processedIds: Set<string> = new Set();
  private lastPurchaseResult: any = null;
  private debugCallback: ((info: any) => void) | null = null;
  private currentPurchaseStartTime: number | null = null;
  private currentPurchaseProductId: string | null = null;
  private purchasePromiseResolve: ((value: void) => void) | null = null;
  private purchasePromiseReject: ((reason?: any) => void) | null = null;
  private purchaseUpdateSubscription: any = null;
  private purchaseErrorSubscription: any = null;

  private constructor() {}

  static getInstance(): IAPService {
    if (!IAPService.instance) {
      IAPService.instance = new IAPService();
    }
    return IAPService.instance;
  }

  isAvailable(): boolean {
    return RNIap !== null;
  }

  async initialize(): Promise<boolean> {
    if (!this.isAvailable()) {
      console.log('[IAP-SERVICE] IAP not available in this environment (Expo Go)');
      return false;
    }

    try {
      console.log('[IAP-SERVICE] Initializing react-native-iap...');

      if (!this.isConnected) {
        const result = await RNIap.initConnection();
        console.log('[IAP-SERVICE] Connection result:', result);
        this.isConnected = true;
      }

      // Set up purchase listeners
      if (!this.hasListener) {
        console.log('[IAP-SERVICE] Setting up purchase listeners...');
        this.setupPurchaseListeners();
        this.hasListener = true;
      }

      // Clear any pending transactions on iOS
      if (Platform.OS === 'ios') {
        await RNIap.clearTransactionIOS();
      }

      // Check for unfinished transactions (important for Android)
      await this.checkForPendingPurchases();

      return true;
    } catch (error) {
      console.error('[IAP-SERVICE] Failed to initialize:', error);
      return false;
    }
  }

  private setupPurchaseListeners() {
    if (!this.isAvailable()) {
      console.log('[IAP-SERVICE] Cannot setup listeners - IAP not available');
      return;
    }

    // Purchase update listener
    this.purchaseUpdateSubscription = RNIap.purchaseUpdatedListener(
      async (purchase: any) => {
        console.log('[IAP-SERVICE] 🎉 Purchase updated:', purchase);
        this.lastPurchaseResult = purchase;

        if (this.debugCallback) {
          this.debugCallback({
            lastPurchase: purchase,
            listenerStatus: 'PURCHASE RECEIVED ✅'
          });
        }

        await this.handlePurchaseUpdate(purchase);
      }
    );

    // Purchase error listener
    this.purchaseErrorSubscription = RNIap.purchaseErrorListener(
      (error: any) => {
        console.error('[IAP-SERVICE] Purchase error:', error);

        if (this.debugCallback) {
          this.debugCallback({
            listenerStatus: `PURCHASE ERROR ❌: ${error.message}`
          });
        }

        // Clear purchase tracking
        this.currentPurchaseStartTime = null;
        this.currentPurchaseProductId = null;
        AsyncStorage.setItem(INFLIGHT_KEY, 'false');

        // Reject the purchase promise
        if (this.purchasePromiseReject) {
          this.purchasePromiseReject(new Error(error.message));
          this.purchasePromiseResolve = null;
          this.purchasePromiseReject = null;
        }
      }
    );

    console.log('[IAP-SERVICE] Purchase listeners set up successfully');
  }

  private async handlePurchaseUpdate(purchase: any) {
    if (!this.isAvailable()) {
      console.log('[IAP-SERVICE] Cannot handle purchase update - IAP not available');
      return;
    }

    try {
      console.log('[IAP-SERVICE] Processing purchase update:', {
        productId: purchase.productId,
        transactionId: purchase.transactionId,
        purchaseToken: purchase.purchaseToken
      });

      await this.processPurchase(purchase, 'listener');

      // Resolve the purchase promise
      if (this.purchasePromiseResolve) {
        console.log('[IAP-SERVICE] Resolving purchase promise (success)');
        this.purchasePromiseResolve();
        this.purchasePromiseResolve = null;
        this.purchasePromiseReject = null;
      }

    } catch (error) {
      console.error('[IAP-SERVICE] Error handling purchase update:', error);

      if (this.purchasePromiseReject) {
        this.purchasePromiseReject(error);
        this.purchasePromiseResolve = null;
        this.purchasePromiseReject = null;
      }
    }
  }

  private async checkForPendingPurchases() {
    if (!this.isAvailable()) {
      console.log('[IAP-SERVICE] Cannot check pending purchases - IAP not available');
      return;
    }

    try {
      console.log('[IAP-SERVICE] Checking for pending purchases...');
      const purchases = await RNIap.getAvailablePurchases();

      if (purchases && purchases.length > 0) {
        console.log(`[IAP-SERVICE] ⚠️ PRODUCTION LOG: Found ${purchases.length} pending/orphaned purchases`);
        console.log('[IAP-SERVICE] ⚠️ This may cause auto-navigation if not handled properly');
        console.log('[IAP-SERVICE] Orphaned purchases:', purchases.map((p: any) => ({
          productId: p.productId,
          transactionId: p.transactionId,
          purchaseTime: p.transactionDate
        })));

        for (const purchase of purchases) {
          const txId = purchase.transactionId;
          if (!this.processedIds.has(txId)) {
            console.log('[IAP-SERVICE] ⚠️ PRODUCTION LOG: Processing orphaned purchase:', purchase.productId);
            console.log('[IAP-SERVICE] This will grant entitlement but should NOT auto-navigate');
            await this.processPurchase(purchase, 'orphan');
          }
        }
      } else {
        console.log('[IAP-SERVICE] No pending purchases found');
      }
    } catch (error) {
      console.error('[IAP-SERVICE] Error checking pending purchases:', error);
    }
  }

  private async processPurchase(
    purchase: any,
    source: 'listener' | 'restore' | 'orphan'
  ) {
    if (!this.isAvailable()) {
      console.log('[IAP-SERVICE] Cannot process purchase - IAP not available');
      return;
    }

    const txId = purchase.transactionId;
    console.log(`[IAP-SERVICE] Processing purchase from ${source}:`, {
      productId: purchase.productId,
      transactionId: txId,
    });

    if (!txId || this.processedIds.has(txId)) {
      console.log(`[IAP-SERVICE] Skipping already processed transaction: ${txId}`);
      return;
    }

    this.processedIds.add(txId);

    try {
      // Map productId to plan
      let planToUse: 'yearly' | 'monthly' | 'weekly' = 'yearly';
      const productId = purchase.productId.toLowerCase();

      if (productId.includes('monthly')) {
        planToUse = 'monthly';
      } else if (productId.includes('weekly')) {
        planToUse = 'weekly';
      }

      const subscriptionId = `${purchase.productId}_${Date.now()}`;
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;

      console.log(`[IAP-SERVICE] Purchase details:`, {
        planToUse,
        subscriptionId,
        userId: userId ? 'found' : 'missing',
        source
      });

      // Determine if we should grant entitlement
      const inFlight = (await AsyncStorage.getItem(INFLIGHT_KEY)) === 'true';
      const shouldEntitle =
        (source === 'listener' && inFlight) ||
        source === 'restore' ||
        source === 'orphan';

      console.log(`[IAP-SERVICE] ⚠️ PRODUCTION LOG: Entitlement decision:`, {
        source,
        inFlight,
        shouldEntitle,
        transactionId: purchase.transactionId
      });

      // CRITICAL SAFEGUARD: Warn if listener purchase without in-flight flag
      if (source === 'listener' && !inFlight) {
        console.error('[IAP-SERVICE] ⚠️⚠️⚠️ CRITICAL WARNING: Purchase received from listener but no in-flight flag!');
        console.error('[IAP-SERVICE] This indicates a purchase that was NOT initiated in this session');
        console.error('[IAP-SERVICE] This should be treated as an orphaned transaction, not a new purchase');
        // Don't entitle to prevent potential exploitation
        return;
      }

      if (shouldEntitle && userId) {
        console.log('[IAP-SERVICE] Granting entitlement...');

        // Determine credits based on plan
        let credits_max = 0;
        switch (planToUse) {
          case 'yearly': credits_max = 90; break;
          case 'monthly': credits_max = 75; break;
          case 'weekly': credits_max = 10; break;
        }

        // Update Supabase profile
        const now = new Date().toISOString();
        const updateData = {
          subscription_plan: planToUse,
          subscription_id: subscriptionId,
          is_pro_version: true,
          product_id: purchase.productId,
          purchase_time: now,
          credits_current: credits_max,
          credits_max: credits_max,
          subscription_start_date: now,
          last_credit_reset: now
        };

        console.log('[IAP-SERVICE] Updating profile with data:', updateData);

        const { error: supabaseError } = await supabase.from('profiles')
          .update(updateData)
          .eq('id', userId);

        if (supabaseError) {
          console.error('[IAP-SERVICE] Supabase update error:', supabaseError);
          throw supabaseError;
        }

        // Update AsyncStorage
        await AsyncStorage.multiSet([
          ['profile.subscription_plan', planToUse],
          ['profile.subscription_id', subscriptionId],
          ['profile.is_pro_version', 'true'],
        ]);

        console.log('[IAP-SERVICE] Entitlement granted successfully');
      }

      // Acknowledge/finish the purchase
      console.log('[IAP-SERVICE] Finishing transaction...');
      if (Platform.OS === 'android') {
        // On Android, acknowledge the purchase
        await RNIap.acknowledgePurchaseAndroid(purchase.purchaseToken);
      } else {
        // On iOS, finish the transaction
        await RNIap.finishTransaction({ purchase, isConsumable: false });
      }

      // Navigate and clear flag for deliberate purchases
      if (shouldEntitle) {
        console.log('[IAP-SERVICE] Clearing in-flight flag...');
        await AsyncStorage.setItem(INFLIGHT_KEY, 'false');

        // Clear purchase session tracking on success
        this.currentPurchaseStartTime = null;
        this.currentPurchaseProductId = null;

        console.log(`[IAP-SERVICE] ✅ Purchase complete from ${source}!`);

        if (this.debugCallback) {
          this.debugCallback({
            listenerStatus: 'PURCHASE SUCCESS! ✅',
            shouldNavigate: true,
            purchaseComplete: true,
            purchaseSource: source, // Add source to distinguish orphaned vs new purchases
            isOrphanedPurchase: source === 'orphan'
          });
        }
      }

    } catch (error) {
      console.error(`[IAP-SERVICE] Error processing purchase:`, error);
      await AsyncStorage.setItem(INFLIGHT_KEY, 'false');
      throw error;
    }
  }

  async getProducts(): Promise<any[]> {
    if (!this.isAvailable()) {
      console.log('[IAP-SERVICE] IAP not available');
      return [];
    }

    if (!this.isConnected) {
      console.log('[IAP-SERVICE] Not connected, initializing first...');
      const initResult = await this.initialize();
      console.log('[IAP-SERVICE] Initialize result:', initResult);
    }

    try {
      const productIds = Platform.OS === 'ios' ? IOS_PRODUCT_IDS : ANDROID_PRODUCT_IDS;
      console.log('[IAP-SERVICE] ========== PRODUCT FETCH DEBUG ==========');
      console.log('[IAP-SERVICE] Platform:', Platform.OS);
      console.log('[IAP-SERVICE] isConnected:', this.isConnected);
      console.log('[IAP-SERVICE] Product IDs to fetch:', JSON.stringify(productIds));
      console.log('[IAP-SERVICE] RNIap module loaded:', !!RNIap);
      console.log('[IAP-SERVICE] RNIap.getSubscriptions exists:', typeof RNIap?.getSubscriptions);

      // Log available RNIap methods for debugging
      if (RNIap) {
        const methods = Object.keys(RNIap).filter(k => typeof RNIap[k] === 'function');
        console.log('[IAP-SERVICE] Available RNIap methods:', methods.slice(0, 15).join(', '));
      }

      console.log('[IAP-SERVICE] Calling RNIap.getSubscriptions...');
      const startTime = Date.now();
      
      // Get subscriptions using the v14+ API format
      // In react-native-iap v12+, we need to pass skus as an object
      const products = await RNIap.getSubscriptions({ skus: productIds });
      
      const elapsed = Date.now() - startTime;
      console.log('[IAP-SERVICE] getSubscriptions completed in', elapsed, 'ms');
      console.log('[IAP-SERVICE] Products loaded:', products?.length ?? 'null/undefined');
      console.log('[IAP-SERVICE] Raw products response:', JSON.stringify(products, null, 2));
      
      if (products.length === 0) {
        console.log('[IAP-SERVICE] ❌ NO PRODUCTS RETURNED - Possible causes:');
        console.log('[IAP-SERVICE]   1. Products not in "Ready to Submit" status in App Store Connect');
        console.log('[IAP-SERVICE]   2. Paid Apps agreement expired or not signed');
        console.log('[IAP-SERVICE]   3. Bundle ID mismatch (check app.config.ts ios.bundleIdentifier)');
        console.log('[IAP-SERVICE]   4. Build not installed from TestFlight');
        console.log('[IAP-SERVICE]   5. Sandbox account issues');
        console.log('[IAP-SERVICE]   6. Product IDs have typos or wrong format');
        
        // Try alternative API call for older versions
        console.log('[IAP-SERVICE] Attempting alternative getProducts call...');
        try {
          const altProducts = await RNIap.getProducts({ skus: productIds });
          console.log('[IAP-SERVICE] Alternative getProducts result:', altProducts?.length ?? 'null');
          if (altProducts?.length > 0) {
            console.log('[IAP-SERVICE] ✅ Found products via getProducts (non-subscription):', JSON.stringify(altProducts, null, 2));
            return altProducts;
          }
        } catch (altErr) {
          console.log('[IAP-SERVICE] Alternative getProducts failed:', altErr);
        }
      }
      
      console.log('[IAP-SERVICE] ========== END PRODUCT FETCH DEBUG ==========');

      return products;
    } catch (err: any) {
      console.error('[IAP-SERVICE] ❌ Error fetching products:', err);
      console.error('[IAP-SERVICE] Error name:', err?.name);
      console.error('[IAP-SERVICE] Error message:', err?.message);
      console.error('[IAP-SERVICE] Error code:', err?.code);
      console.error('[IAP-SERVICE] Error stack:', err?.stack);
      return [];
    }
  }

  async purchaseProduct(productId: string): Promise<void> {
    if (!this.isAvailable()) {
      throw new Error('IAP not available in this environment');
    }

    if (!this.isConnected) {
      console.log('[IAP-SERVICE] Not connected, initializing...');
      await this.initialize();
    }

    // Track current purchase session
    this.currentPurchaseStartTime = Date.now();
    this.currentPurchaseProductId = productId;

    console.log(`[IAP-SERVICE] Setting in-flight flag and attempting purchase: ${productId}`);
    await AsyncStorage.setItem(INFLIGHT_KEY, 'true');

    // Create a promise that will be resolved/rejected by the purchase listener
    const purchasePromise = new Promise<void>((resolve, reject) => {
      this.purchasePromiseResolve = resolve;
      this.purchasePromiseReject = reject;

      // Set a timeout
      setTimeout(() => {
        if (this.purchasePromiseReject) {
          this.purchasePromiseReject(new Error('Purchase timeout'));
          this.purchasePromiseResolve = null;
          this.purchasePromiseReject = null;
        }
      }, 60000); // 60 second timeout
    });

    try {
      console.log('[IAP-SERVICE] ⚠️ PRODUCTION LOG: Requesting subscription purchase...');
      console.log('[IAP-SERVICE] Product ID:', productId);
      console.log('[IAP-SERVICE] Platform:', Platform.OS);
      console.log('[IAP-SERVICE] Connection status:', this.isConnected);
      console.log('[IAP-SERVICE] ⚠️ CRITICAL: About to call RNIap.requestSubscription - IAP modal should appear now');

      // Use the v14+ API format - pass sku in an object for both platforms
      await RNIap.requestSubscription({ sku: productId });

      console.log('[IAP-SERVICE] ⚠️ PRODUCTION LOG: requestSubscription() called successfully - IAP modal should now be visible to user');

      if (this.debugCallback) {
        this.debugCallback({
          listenerStatus: 'PURCHASE INITIATED - WAITING... ⏳',
          productId: productId
        });
      }

      // Wait for the purchase to complete via listener
      console.log('[IAP-SERVICE] Waiting for purchase completion...');
      await purchasePromise;
      console.log('[IAP-SERVICE] ⚠️ PRODUCTION LOG: Purchase completed successfully!');

    } catch (error: any) {
      console.error('[IAP-SERVICE] Purchase failed:', error);
      await AsyncStorage.setItem(INFLIGHT_KEY, 'false');

      // Clear session tracking on error
      this.currentPurchaseStartTime = null;
      this.currentPurchaseProductId = null;

      // Clear promise handlers
      this.purchasePromiseResolve = null;
      this.purchasePromiseReject = null;

      if (this.debugCallback) {
        this.debugCallback({
          listenerStatus: 'PURCHASE FAILED ❌'
        });
      }

      // Check if user cancelled
      if (error?.code === 'E_USER_CANCELLED' || error?.message?.includes('cancel')) {
        console.log('[IAP-SERVICE] User cancelled purchase');
        throw new Error('User cancelled purchase');
      }

      throw error;
    }
  }

  async restorePurchases(): Promise<any[]> {
    if (!this.isAvailable()) {
      throw new Error('IAP not available in this environment');
    }

    if (!this.isConnected) {
      await this.initialize();
    }

    try {
      await AsyncStorage.setItem(INFLIGHT_KEY, 'true');
      console.log('[IAP-SERVICE] Restoring purchases...');

      const purchases = await RNIap.getAvailablePurchases();

      if (!purchases || purchases.length === 0) {
        await AsyncStorage.setItem(INFLIGHT_KEY, 'false');
        throw new Error('No previous purchases found');
      }

      console.log(`[IAP-SERVICE] Found ${purchases.length} purchases to restore`);

      for (const purchase of purchases) {
        await this.processPurchase(purchase, 'restore');
      }

      await AsyncStorage.setItem(INFLIGHT_KEY, 'false');
      return purchases;
    } catch (error) {
      await AsyncStorage.setItem(INFLIGHT_KEY, 'false');
      throw error;
    }
  }

  async checkForOrphanedTransactions(): Promise<void> {
    if (!this.isAvailable()) {
      console.log('[IAP-SERVICE] IAP not available, skipping orphaned transaction check');
      return;
    }

    if (!this.isConnected) {
      await this.initialize();
    }

    await this.checkForPendingPurchases();
  }

  setDebugCallback(callback: (info: any) => void) {
    this.debugCallback = callback;
  }

  getLastPurchaseResult() {
    return this.lastPurchaseResult;
  }

  getConnectionStatus() {
    return {
      isConnected: this.isConnected,
      hasListener: this.hasListener,
    };
  }

  async cleanup() {
    if (!this.isAvailable()) {
      return;
    }

    if (this.purchaseUpdateSubscription) {
      this.purchaseUpdateSubscription.remove();
      this.purchaseUpdateSubscription = null;
    }

    if (this.purchaseErrorSubscription) {
      this.purchaseErrorSubscription.remove();
      this.purchaseErrorSubscription = null;
    }

    if (this.isConnected) {
      await RNIap.endConnection();
      this.isConnected = false;
    }

    this.hasListener = false;
  }
}

export default IAPService.getInstance();
