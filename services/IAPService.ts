import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Platform } from 'react-native';
import { supabase } from '../lib/supabase';

// Conditionally import react-native-iap to avoid crashes in Expo Go
let RNIap: any = null;
let RNIapModule: any = null;

// Suppress the error completely by wrapping in try-catch
try {
  // Try to load the module - will fail silently in Expo Go
  RNIapModule = require('react-native-iap');
  
  // Handle different module formats (ESM vs CommonJS)
  // react-native-iap v14+ may export differently
  if (RNIapModule && typeof RNIapModule === 'object') {
    // Check if it's a default export wrapped module
    if (RNIapModule.default) {
      console.log('[IAP-SERVICE] Using RNIapModule.default');
      RNIap = RNIapModule.default;
    } else {
      console.log('[IAP-SERVICE] Using RNIapModule directly');
      RNIap = RNIapModule;
    }
    
    // Log what we got
    console.log('[IAP-SERVICE] RNIap keys:', Object.keys(RNIap || {}).slice(0, 20).join(', '));
  }
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
      console.log('[IAP-SERVICE] Platform:', Platform.OS);

      // For iOS with react-native-iap v14+, try to use setup() to configure StoreKit mode
      if (Platform.OS === 'ios' && typeof RNIap.setup === 'function') {
        console.log('[IAP-SERVICE] Calling RNIap.setup() to configure StoreKit mode...');
        try {
          // Try StoreKit 1 mode first for better compatibility with sandbox
          await RNIap.setup({ storekitMode: 'STOREKIT1_MODE' });
          console.log('[IAP-SERVICE] ✅ Configured for StoreKit 1 mode');
        } catch (setupErr: any) {
          console.log('[IAP-SERVICE] setup() failed (may not be needed):', setupErr?.message);
        }
      }

      if (!this.isConnected) {
        console.log('[IAP-SERVICE] Calling initConnection...');
        const result = await RNIap.initConnection();
        console.log('[IAP-SERVICE] Connection result:', result);
        console.log('[IAP-SERVICE] Connection result type:', typeof result);
        this.isConnected = true;
      }

      // Set up purchase listeners
      if (!this.hasListener) {
        console.log('[IAP-SERVICE] Setting up purchase listeners...');
        this.setupPurchaseListeners();
        this.hasListener = true;
      }

      // NOTE: clearTransactionIOS() was removed in react-native-iap v12+.
      // Do NOT call it here — it will throw and break initialization.
      // Pending transactions are handled automatically by the purchase listener
      // and finishTransaction() calls in processPurchase().

      // Check for unfinished transactions (important for Android)
      await this.checkForPendingPurchases();

      return true;
    } catch (error: any) {
      console.error('[IAP-SERVICE] Failed to initialize:', error);
      console.error('[IAP-SERVICE] Error details:', {
        name: error?.name,
        message: error?.message,
        code: error?.code
      });
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

  // Debug logs that can be retrieved by UI
  private productFetchLogs: string[] = [];

  private addProductLog(message: string) {
    const timestamp = new Date().toLocaleTimeString();
    this.productFetchLogs.push(`[${timestamp}] ${message}`);
    console.log('[IAP-SERVICE]', message);
  }

  getProductFetchLogs(): string[] {
    return [...this.productFetchLogs];
  }

  clearProductFetchLogs() {
    this.productFetchLogs = [];
  }

  async getProducts(): Promise<any[]> {
    // Clear previous logs
    this.productFetchLogs = [];
    
    if (!this.isAvailable()) {
      this.addProductLog('❌ IAP not available');
      return [];
    }

    if (!this.isConnected) {
      this.addProductLog('Not connected, initializing first...');
      const initResult = await this.initialize();
      this.addProductLog(`Initialize result: ${initResult}`);
    }

    try {
      const productIds = Platform.OS === 'ios' ? IOS_PRODUCT_IDS : ANDROID_PRODUCT_IDS;
      this.addProductLog('========== PRODUCT FETCH DEBUG ==========');
      this.addProductLog(`Platform: ${Platform.OS}`);
      this.addProductLog(`isConnected: ${this.isConnected}`);
      this.addProductLog(`Product IDs: ${productIds.join(', ')}`);
      this.addProductLog(`RNIap loaded: ${!!RNIap}`);

      // Log ALL available RNIap methods for debugging
      if (RNIap) {
        const allKeys = Object.keys(RNIap);
        this.addProductLog(`RNIap has ${allKeys.length} exports`);
        // Log each export and its type
        allKeys.forEach(key => {
          const type = typeof RNIap[key];
          if (type === 'function') {
            this.addProductLog(`  ✅ ${key}: function`);
          }
        });
        
        // Also check module-level exports
        if (RNIapModule && RNIapModule !== RNIap) {
          this.addProductLog('RNIapModule exports:');
          Object.keys(RNIapModule).forEach(key => {
            this.addProductLog(`  ${key}: ${typeof RNIapModule[key]}`);
          });
        }
      } else {
        this.addProductLog('❌ RNIap is null/undefined!');
      }

      // Guard: ensure connection before fetching
      if (!this.isConnected) {
        this.addProductLog('⚠️ Re-initializing connection...');
        await this.initialize();
      }
      
      // Longer delay to ensure StoreKit is fully ready
      this.addProductLog('Waiting 1s for StoreKit...');
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Determine which API to use based on what's available
      const getSubsFn = RNIap.getSubscriptions || RNIap.default?.getSubscriptions;
      const getProdFn = RNIap.getProducts || RNIap.default?.getProducts;
      
      this.addProductLog(`Using getSubscriptions: ${typeof getSubsFn}`);
      this.addProductLog(`Using getProducts: ${typeof getProdFn}`);

      // ============ ATTEMPT 1: Standard getSubscriptions with object format ============
      if (typeof getSubsFn === 'function') {
        this.addProductLog('ATTEMPT 1: getSubscriptions({ skus })');
        let products: any[] = [];
        try {
          const startTime = Date.now();
          products = await getSubsFn({ skus: productIds });
          const elapsed = Date.now() - startTime;
          this.addProductLog(`Attempt 1: ${products?.length ?? 0} products in ${elapsed}ms`);
          if (products?.length > 0) {
            this.addProductLog('✅ SUCCESS with attempt 1');
            return products;
          }
        } catch (err: any) {
          this.addProductLog(`❌ Attempt 1 failed: ${err?.message || err}`);
        }

        // ============ ATTEMPT 2: getSubscriptions with array directly ============
        this.addProductLog('ATTEMPT 2: getSubscriptions([skus])');
        try {
          const startTime = Date.now();
          products = await getSubsFn(productIds);
          const elapsed = Date.now() - startTime;
          this.addProductLog(`Attempt 2: ${products?.length ?? 0} products in ${elapsed}ms`);
          if (products?.length > 0) {
            this.addProductLog('✅ SUCCESS with attempt 2');
            return products;
          }
        } catch (err: any) {
          this.addProductLog(`❌ Attempt 2 failed: ${err?.message || err}`);
        }
      } else {
        this.addProductLog('❌ getSubscriptions not available!');
      }

      // ============ ATTEMPT 3: getProducts (non-subscription API) ============
      if (typeof getProdFn === 'function') {
        this.addProductLog('ATTEMPT 3: getProducts({ skus })');
        let products: any[] = [];
        try {
          const startTime = Date.now();
          products = await getProdFn({ skus: productIds });
          const elapsed = Date.now() - startTime;
          this.addProductLog(`Attempt 3: ${products?.length ?? 0} products in ${elapsed}ms`);
          if (products?.length > 0) {
            this.addProductLog('✅ SUCCESS with attempt 3');
            return products;
          }
        } catch (err: any) {
          this.addProductLog(`❌ Attempt 3 failed: ${err?.message || err}`);
        }

        // Try array format
        this.addProductLog('ATTEMPT 3b: getProducts([skus])');
        try {
          const products = await getProdFn(productIds);
          this.addProductLog(`Attempt 3b: ${products?.length ?? 0} products`);
          if (products?.length > 0) {
            this.addProductLog('✅ SUCCESS with attempt 3b');
            return products;
          }
        } catch (err: any) {
          this.addProductLog(`❌ Attempt 3b failed: ${err?.message || err}`);
        }
      } else {
        this.addProductLog('❌ getProducts not available!');
      }

      // ============ ATTEMPT 4: Try alternative APIs with different signatures ============
      this.addProductLog('ATTEMPT 4: Checking for alternative APIs...');
      try {
        // Some versions use different method names
        const alternativeMethods = ['fetchProducts', 'loadProducts', 'getItems', 'getAvailableProducts'];
        for (const methodName of alternativeMethods) {
          const method = RNIap[methodName] || RNIap.default?.[methodName];
          if (typeof method === 'function') {
            this.addProductLog(`Found alternative: ${methodName}`);
            
            // Try different parameter formats
            const paramFormats = [
              { skus: productIds },  // Object with skus key
              productIds,            // Direct array
              { productIds },        // Object with productIds key
              { ids: productIds },   // Object with ids key
            ];
            
            for (let i = 0; i < paramFormats.length; i++) {
              try {
                this.addProductLog(`  Trying format ${i + 1}...`);
                const result = await method(paramFormats[i]);
                if (result?.length > 0) {
                  this.addProductLog(`✅ SUCCESS with ${methodName} format ${i + 1}`);
                  return result;
                } else {
                  this.addProductLog(`  Format ${i + 1}: 0 products`);
                }
              } catch (e: any) {
                this.addProductLog(`  Format ${i + 1} failed: ${e?.message?.slice(0, 50)}`);
              }
            }
          }
        }
      } catch (err: any) {
        this.addProductLog(`Attempt 4 failed: ${err?.message || err}`);
      }

      // ============ ATTEMPT 5: Direct native module call ============
      this.addProductLog('ATTEMPT 5: Trying direct module calls...');
      try {
        // Try to access the native module directly
        const NativeModules = require('react-native').NativeModules;
        const nativeIap = NativeModules.RNIapIos || NativeModules.RNIapModule || NativeModules.RNIap;
        
        if (nativeIap) {
          this.addProductLog(`Found native module: ${Object.keys(nativeIap).join(', ')}`);
          
          if (typeof nativeIap.getItems === 'function') {
            this.addProductLog('Trying nativeIap.getItems...');
            const items = await nativeIap.getItems(productIds);
            if (items?.length > 0) {
              this.addProductLog(`✅ SUCCESS with native getItems`);
              return items;
            }
          }
          
          if (typeof nativeIap.getSubscriptions === 'function') {
            this.addProductLog('Trying nativeIap.getSubscriptions...');
            const subs = await nativeIap.getSubscriptions(productIds);
            if (subs?.length > 0) {
              this.addProductLog(`✅ SUCCESS with native getSubscriptions`);
              return subs;
            }
          }
        } else {
          this.addProductLog('❌ No native IAP module found');
          this.addProductLog(`Available NativeModules: ${Object.keys(NativeModules).filter(k => k.toLowerCase().includes('iap') || k.toLowerCase().includes('purchase')).join(', ') || 'none related to IAP'}`);
        }
      } catch (err: any) {
        this.addProductLog(`Attempt 5 failed: ${err?.message || err}`);
      }

      // ============ ATTEMPT 6: StoreKit mode check ============
      this.addProductLog('ATTEMPT 6: Checking StoreKit mode...');
      const isStoreKit2Fn = RNIap.isIosStorekit2 || RNIap.default?.isIosStorekit2;
      try {
        if (typeof isStoreKit2Fn === 'function') {
          const isStoreKit2 = await isStoreKit2Fn();
          this.addProductLog(`Using StoreKit 2: ${isStoreKit2}`);
        } else {
          this.addProductLog('isIosStorekit2 not available');
        }
      } catch (err: any) {
        this.addProductLog(`StoreKit check failed: ${err?.message || err}`);
      }

      // ============ ALL ATTEMPTS FAILED ============
      this.addProductLog('❌❌❌ ALL ATTEMPTS FAILED ❌❌❌');
      this.addProductLog('CRITICAL: getSubscriptions is undefined!');
      this.addProductLog('This means react-native-iap native module');
      this.addProductLog('is not properly linked. Try:');
      this.addProductLog('  1. Rebuild with: eas build --clear-cache');
      this.addProductLog('  2. Check react-native-iap version');
      this.addProductLog('  3. Verify plugin in app.config.ts');
      
      this.addProductLog('========== END DEBUG ==========');

      return [];
    } catch (err: any) {
      this.addProductLog(`❌ CRITICAL ERROR: ${err?.message || err}`);
      this.addProductLog(`Error code: ${err?.code || 'none'}`);
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
