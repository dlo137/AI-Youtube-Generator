import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, NativeModules } from 'react-native';
import { supabase } from '../lib/supabase';

// ─────────────────────────────────────────────────────────────────────────────
// react-native-iap v14 (Nitro) no longer exports getSubscriptions / getProducts
// as standalone functions. They live inside hooks/context. However the native
// module (RNIapIos on iOS, RNIapModule on Android) is still registered and
// exposes getItems() directly. We call that instead and keep every other call
// (initConnection, requestSubscription, finishTransaction, listeners) via the
// JS named exports that still exist in v14.
// ─────────────────────────────────────────────────────────────────────────────

let iapAvailable = false;
let iapModule: any = null;
let nativeIapModule: any = null; // direct NativeModules reference for getItems

// Diagnostic info surfaced to the debug panel
let iapDiagnostics = {
  requireSucceeded: false,
  requireError: null as string | null,
  allExports: [] as string[],
  functionExports: [] as string[],
  hasInitConnection: false,
  hasGetSubscriptions: false,   // will be false in v14 - that's expected
  hasNativeModule: false,
  nativeModuleKey: null as string | null,
  nativeModuleExports: [] as string[],
};

try {
  iapModule = require('react-native-iap');
  iapDiagnostics.requireSucceeded = true;

  const allKeys = Object.keys(iapModule);
  iapDiagnostics.allExports = allKeys;
  iapDiagnostics.functionExports = allKeys.filter(k => typeof iapModule[k] === 'function');
  iapDiagnostics.hasInitConnection = typeof iapModule.initConnection === 'function';
  iapDiagnostics.hasGetSubscriptions = typeof iapModule.getSubscriptions === 'function';

  console.log('[IAP] Module loaded. exports:', iapDiagnostics.functionExports.join(', '));
  console.log('[IAP] initConnection:', iapDiagnostics.hasInitConnection);
  console.log('[IAP] getSubscriptions (v14 removed this - expected false):', iapDiagnostics.hasGetSubscriptions);

  // ── Find the native module ────────────────────────────────────────────────
  // iOS registers as RNIapIos, Android as RNIapModule. Check both.
  const nativeKey = Object.keys(NativeModules).find(k =>
    k === 'RNIapIos' || k === 'RNIapModule' || k === 'RNIap' ||
    k.toLowerCase().includes('rniap')
  ) || null;

  iapDiagnostics.nativeModuleKey = nativeKey;

  if (nativeKey) {
    nativeIapModule = NativeModules[nativeKey];
    iapDiagnostics.hasNativeModule = true;
    iapDiagnostics.nativeModuleExports = Object.keys(nativeIapModule);
    console.log('[IAP] ✅ Native module found:', nativeKey);
    console.log('[IAP] Native exports:', iapDiagnostics.nativeModuleExports.join(', '));
  } else {
    console.log('[IAP] ⚠️ No native module found in NativeModules');
    console.log('[IAP] All NativeModule keys:', Object.keys(NativeModules).join(', '));
  }

  // Mark available if we have initConnection (the JS layer) regardless of
  // whether getSubscriptions exists - v14 removed it intentionally.
  if (iapDiagnostics.hasInitConnection) {
    iapAvailable = true;
    console.log('[IAP] ✅ IAP marked as available');
  } else {
    console.log('[IAP] ❌ initConnection missing - module may not be linked');
  }

} catch (e: any) {
  iapDiagnostics.requireError = e?.message ?? 'unknown';
  console.log('[IAP] require failed:', e?.message);
}

// ─────────────────────────────────────────────────────────────────────────────
// Product ID constants
// ─────────────────────────────────────────────────────────────────────────────
const IOS_PRODUCT_IDS = [
  'thumbnail.yearly',
  'thumbnail.monthly',
  'thumbnail.weekly',
  'discounted.weekly',
];

const ANDROID_PRODUCT_IDS = [
  'ai.thumbnail.pro:yearly',
  'ai.thumbnail.pro:monthly',
  'ai.thumbnail.pro:weekly',
  'discounted.weekly',
];

const INFLIGHT_KEY = 'iapPurchaseInFlight';

// ─────────────────────────────────────────────────────────────────────────────
// IAPService singleton
// ─────────────────────────────────────────────────────────────────────────────
class IAPService {
  private static instance: IAPService;
  private isConnected = false;
  private hasListener = false;
  private processedIds = new Set<string>();
  private lastPurchaseResult: any = null;
  private debugCallback: ((info: any) => void) | null = null;
  private currentPurchaseStartTime: number | null = null;
  private currentPurchaseProductId: string | null = null;
  private purchasePromiseResolve: ((value: void) => void) | null = null;
  private purchasePromiseReject: ((reason?: any) => void) | null = null;
  private purchaseUpdateSubscription: any = null;
  private purchaseErrorSubscription: any = null;
  private productFetchLogs: string[] = [];

  private constructor() {}

  static getInstance(): IAPService {
    if (!IAPService.instance) IAPService.instance = new IAPService();
    return IAPService.instance;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  isAvailable(): boolean {
    return iapAvailable && iapModule !== null;
  }

  getDiagnostics() {
    return { ...iapDiagnostics, iapAvailable };
  }

  getConnectionStatus() {
    return { isConnected: this.isConnected, hasListener: this.hasListener };
  }

  getLastPurchaseResult() {
    return this.lastPurchaseResult;
  }

  setDebugCallback(cb: (info: any) => void) {
    this.debugCallback = cb;
  }

  getProductFetchLogs(): string[] {
    return [...this.productFetchLogs];
  }

  clearProductFetchLogs() {
    this.productFetchLogs = [];
  }

  // ── Initialization ─────────────────────────────────────────────────────────

  async initialize(): Promise<boolean> {
    if (!this.isAvailable()) {
      console.log('[IAP] Not available - skipping init');
      return false;
    }

    try {
      console.log('[IAP] Initializing... platform:', Platform.OS);

      // setup() for StoreKit mode (iOS only, v14+)
      if (Platform.OS === 'ios' && typeof iapModule.setup === 'function') {
        try {
          // Use the enum if present, otherwise fall back to the string literal
          const StorekitMode = iapModule.StorekitMode;
          const mode = StorekitMode?.STOREKIT_MODE
            ?? StorekitMode?.STOREKIT1_MODE
            ?? 'STOREKIT1_MODE';
          console.log('[IAP] setup() with storekitMode:', mode);
          await iapModule.setup({ storekitMode: mode });
          console.log('[IAP] ✅ StoreKit configured');
        } catch (e: any) {
          console.log('[IAP] setup() failed (non-fatal):', e?.message);
        }
      }

      if (!this.isConnected) {
        console.log('[IAP] Calling initConnection...');
        const result = await iapModule.initConnection();
        console.log('[IAP] initConnection result:', result);
        this.isConnected = true;
      }

      if (!this.hasListener) {
        this.setupPurchaseListeners();
        this.hasListener = true;
      }

      await this.checkForPendingPurchases();
      return true;
    } catch (e: any) {
      console.error('[IAP] initialize failed:', e?.message);
      return false;
    }
  }

  // ── Product fetching ───────────────────────────────────────────────────────
  // v14 removed getSubscriptions/getProducts from named exports.
  // Strategy:
  //   1. Try iapModule.getSubscriptions if it somehow exists (future-proof)
  //   2. Call nativeIapModule.getItems() directly (iOS: RNIapIos.getItems,
  //      Android: RNIapModule.getItemsByType)
  //   3. Fall back to iapModule.getAvailablePurchases shape-checking

  async getProducts(): Promise<any[]> {
    this.productFetchLogs = [];
    this.log('========== PRODUCT FETCH ==========');
    this.log(`Platform: ${Platform.OS}`);

    if (!this.isAvailable()) {
      this.log('❌ IAP not available');
      return [];
    }

    if (!this.isConnected) {
      this.log('Not connected - initializing...');
      const ok = await this.initialize();
      if (!ok) {
        this.log('❌ Initialization failed');
        return [];
      }
    }

    // Brief pause to let StoreKit settle after connection
    await new Promise(r => setTimeout(r, 500));

    const productIds = Platform.OS === 'ios' ? IOS_PRODUCT_IDS : ANDROID_PRODUCT_IDS;
    this.log(`Product IDs: ${productIds.join(', ')}`);

    // ── Attempt 1: JS named export (v11/v12 style, present if somehow available)
    if (typeof iapModule.getSubscriptions === 'function') {
      this.log('ATTEMPT 1: iapModule.getSubscriptions({ skus })');
      try {
        const result = await iapModule.getSubscriptions({ skus: productIds });
        if (result?.length > 0) {
          this.log(`✅ Got ${result.length} products via getSubscriptions`);
          return result;
        }
        this.log(`getSubscriptions returned 0 products`);
      } catch (e: any) {
        this.log(`❌ getSubscriptions failed: ${e?.message}`);
      }
    } else {
      this.log('getSubscriptions not in JS exports (expected for v14 Nitro)');
    }

    // ── Attempt 2: Direct native module call (works across all versions)
    if (nativeIapModule) {
      this.log(`ATTEMPT 2: Direct native call via ${iapDiagnostics.nativeModuleKey}`);
      this.log(`Native exports: ${iapDiagnostics.nativeModuleExports.join(', ')}`);

      // iOS: getItems(skus, forSubscriptions)
      if (Platform.OS === 'ios' && typeof nativeIapModule.getItems === 'function') {
        this.log('Trying nativeIapModule.getItems(skus, true)...');
        try {
          const raw = await nativeIapModule.getItems(productIds, true);
          this.log(`getItems returned ${raw?.length ?? 0} items`);
          if (raw?.length > 0) {
            // v14 may return raw native objects - convert if helper exists
            const convert = iapModule.convertNitroProductToProduct
              ?? iapModule.enhanceProductWithType
              ?? ((x: any) => x);
            const products = raw.map(convert);
            this.log(`✅ Got ${products.length} products via native getItems`);
            return products;
          }
        } catch (e: any) {
          this.log(`❌ native getItems failed: ${e?.message}`);
        }

        // iOS fallback: getItems with false (non-subscription products)
        this.log('Trying nativeIapModule.getItems(skus, false)...');
        try {
          const raw = await nativeIapModule.getItems(productIds, false);
          this.log(`getItems(false) returned ${raw?.length ?? 0} items`);
          if (raw?.length > 0) {
            const convert = iapModule.convertNitroProductToProduct ?? ((x: any) => x);
            const products = raw.map(convert);
            this.log(`✅ Got ${products.length} products (non-sub) via native getItems`);
            return products;
          }
        } catch (e: any) {
          this.log(`❌ native getItems(false) failed: ${e?.message}`);
        }
      }

      // Android: getItemsByType
      if (Platform.OS === 'android') {
        for (const type of ['subs', 'inapp']) {
          if (typeof nativeIapModule.getItemsByType === 'function') {
            this.log(`Trying nativeIapModule.getItemsByType('${type}', skus)...`);
            try {
              const raw = await nativeIapModule.getItemsByType(type, productIds);
              this.log(`getItemsByType(${type}) returned ${raw?.length ?? 0} items`);
              if (raw?.length > 0) {
                this.log(`✅ Got ${raw.length} products via getItemsByType(${type})`);
                return raw;
              }
            } catch (e: any) {
              this.log(`❌ getItemsByType(${type}) failed: ${e?.message}`);
            }
          }
        }
      }
    } else {
      this.log('No native module available for direct call');
    }

    // ── Attempt 3: getProducts JS export (some v14 builds keep this)
    if (typeof iapModule.getProducts === 'function') {
      this.log('ATTEMPT 3: iapModule.getProducts({ skus })');
      try {
        const result = await iapModule.getProducts({ skus: productIds });
        if (result?.length > 0) {
          this.log(`✅ Got ${result.length} products via getProducts`);
          return result;
        }
        this.log('getProducts returned 0 products');
      } catch (e: any) {
        this.log(`❌ getProducts failed: ${e?.message}`);
      }
    }

    // ── All attempts failed ────────────────────────────────────────────────
    this.log('========== ALL ATTEMPTS FAILED ==========');
    this.log('Native module present: ' + (!!nativeIapModule));
    this.log('Native key: ' + (iapDiagnostics.nativeModuleKey ?? 'none'));
    this.log('Possible causes:');
    this.log('  1. Product IDs do not match App Store Connect exactly');
    this.log('  2. Products not in "Ready to Submit" state');
    this.log('  3. Sandbox Apple ID not signed in on device');
    this.log('  4. Bundle ID mismatch in provisioning profile');
    this.log(`  Requested: ${productIds.join(', ')}`);
    return [];
  }

  // ── Purchase flow ──────────────────────────────────────────────────────────

  async purchaseProduct(productId: string): Promise<void> {
    if (!this.isAvailable()) throw new Error('IAP not available');

    if (!this.isConnected) await this.initialize();

    this.currentPurchaseStartTime = Date.now();
    this.currentPurchaseProductId = productId;
    await AsyncStorage.setItem(INFLIGHT_KEY, 'true');

    const purchasePromise = new Promise<void>((resolve, reject) => {
      this.purchasePromiseResolve = resolve;
      this.purchasePromiseReject = reject;
      setTimeout(async () => {
        if (this.purchasePromiseReject) {
          await AsyncStorage.setItem(INFLIGHT_KEY, 'false');
          this.purchasePromiseReject(new Error('Purchase timeout'));
          this.purchasePromiseResolve = null;
          this.purchasePromiseReject = null;
        }
      }, 60000);
    });

    try {
      console.log('[IAP] requestSubscription:', productId);
      // v14 API: pass sku as object property
      await iapModule.requestSubscription({ sku: productId });

      this.debugCallback?.({ listenerStatus: 'PURCHASE INITIATED - WAITING... ⏳', productId });

      await purchasePromise;
      console.log('[IAP] ✅ Purchase complete');
    } catch (e: any) {
      console.error('[IAP] purchaseProduct error:', e?.message);
      await AsyncStorage.setItem(INFLIGHT_KEY, 'false');
      this.currentPurchaseStartTime = null;
      this.currentPurchaseProductId = null;
      this.purchasePromiseResolve = null;
      this.purchasePromiseReject = null;
      this.debugCallback?.({ listenerStatus: 'PURCHASE FAILED ❌' });

      if (e?.code === 'E_USER_CANCELLED' || e?.message?.includes('cancel')) {
        throw new Error('User cancelled purchase');
      }
      throw e;
    }
  }

  // ── Restore ────────────────────────────────────────────────────────────────

  async restorePurchases(): Promise<any[]> {
    if (!this.isAvailable()) throw new Error('IAP not available');
    if (!this.isConnected) await this.initialize();

    await AsyncStorage.setItem(INFLIGHT_KEY, 'true');
    try {
      const purchases = await iapModule.getAvailablePurchases();
      if (!purchases?.length) {
        await AsyncStorage.setItem(INFLIGHT_KEY, 'false');
        throw new Error('No previous purchases found');
      }
      for (const p of purchases) await this.processPurchase(p, 'restore');
      await AsyncStorage.setItem(INFLIGHT_KEY, 'false');
      return purchases;
    } catch (e) {
      await AsyncStorage.setItem(INFLIGHT_KEY, 'false');
      throw e;
    }
  }

  // ── Orphan check ───────────────────────────────────────────────────────────

  async checkForOrphanedTransactions(): Promise<void> {
    if (!this.isAvailable()) return;
    if (!this.isConnected) await this.initialize();
    await this.checkForPendingPurchases();
  }

  // ── Cleanup ────────────────────────────────────────────────────────────────

  async cleanup() {
    if (!this.isAvailable()) return;
    this.purchaseUpdateSubscription?.remove();
    this.purchaseUpdateSubscription = null;
    this.purchaseErrorSubscription?.remove();
    this.purchaseErrorSubscription = null;
    if (this.isConnected) {
      await iapModule.endConnection();
      this.isConnected = false;
    }
    this.hasListener = false;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private log(msg: string) {
    const ts = new Date().toLocaleTimeString();
    this.productFetchLogs.push(`[${ts}] ${msg}`);
    console.log('[IAP]', msg);
  }

  private setupPurchaseListeners() {
    if (!this.isAvailable()) return;

    this.purchaseUpdateSubscription = iapModule.purchaseUpdatedListener(
      async (purchase: any) => {
        console.log('[IAP] 🎉 purchaseUpdated:', purchase?.productId);
        this.lastPurchaseResult = purchase;
        this.debugCallback?.({ lastPurchase: purchase, listenerStatus: 'PURCHASE RECEIVED ✅' });
        await this.handlePurchaseUpdate(purchase);
      }
    );

    this.purchaseErrorSubscription = iapModule.purchaseErrorListener(
      (error: any) => {
        console.error('[IAP] purchaseError:', error?.message);
        this.debugCallback?.({ listenerStatus: `PURCHASE ERROR ❌: ${error.message}` });
        this.currentPurchaseStartTime = null;
        this.currentPurchaseProductId = null;
        AsyncStorage.setItem(INFLIGHT_KEY, 'false');
        if (this.purchasePromiseReject) {
          this.purchasePromiseReject(new Error(error.message));
          this.purchasePromiseResolve = null;
          this.purchasePromiseReject = null;
        }
      }
    );

    console.log('[IAP] Purchase listeners registered');
  }

  private async handlePurchaseUpdate(purchase: any) {
    try {
      await this.processPurchase(purchase, 'listener');
      if (this.purchasePromiseResolve) {
        this.purchasePromiseResolve();
        this.purchasePromiseResolve = null;
        this.purchasePromiseReject = null;
      }
    } catch (e) {
      console.error('[IAP] handlePurchaseUpdate error:', e);
      if (this.purchasePromiseReject) {
        this.purchasePromiseReject(e);
        this.purchasePromiseResolve = null;
        this.purchasePromiseReject = null;
      }
    }
  }

  private async checkForPendingPurchases() {
    try {
      const purchases = await iapModule.getAvailablePurchases();
      if (purchases?.length > 0) {
        console.log(`[IAP] Found ${purchases.length} pending purchase(s)`);
        for (const p of purchases) {
          if (!this.processedIds.has(p.transactionId)) {
            await this.processPurchase(p, 'orphan');
          }
        }
      } else {
        console.log('[IAP] No pending purchases');
      }
    } catch (e) {
      console.error('[IAP] checkForPendingPurchases error:', e);
    }
  }

  private async processPurchase(purchase: any, source: 'listener' | 'restore' | 'orphan') {
    const txId = purchase.transactionId;

    if (!txId || this.processedIds.has(txId)) {
      console.log('[IAP] Skipping already-processed tx:', txId);
      return;
    }
    this.processedIds.add(txId);

    try {
      const productId = purchase.productId.toLowerCase();
      let planToUse: 'yearly' | 'monthly' | 'weekly' = 'yearly';
      if (productId.includes('monthly')) planToUse = 'monthly';
      else if (productId.includes('weekly')) planToUse = 'weekly';

      const inFlight = (await AsyncStorage.getItem(INFLIGHT_KEY)) === 'true';
      const shouldEntitle =
        (source === 'listener' && inFlight) ||
        source === 'restore' ||
        source === 'orphan';

      console.log(`[IAP] processPurchase: source=${source} inFlight=${inFlight} shouldEntitle=${shouldEntitle}`);

      // Guard: listener purchase that arrived with no active session = orphan replay
      if (source === 'listener' && !inFlight) {
        console.warn('[IAP] Listener purchase with no in-flight flag - ignoring');
        return;
      }

      if (shouldEntitle) {
        const { data: { user } } = await supabase.auth.getUser();
        const userId = user?.id;

        if (!userId) {
          // Don't finish transaction - let it remain pending so it can be restored
          throw new Error('User not authenticated - cannot grant entitlement');
        }

        const credits_max = planToUse === 'yearly' ? 90 : planToUse === 'monthly' ? 75 : 10;
        const now = new Date().toISOString();
        const subscriptionId = `${purchase.productId}_${Date.now()}`;

        const { error } = await supabase.from('profiles').update({
          subscription_plan: planToUse,
          subscription_id: subscriptionId,
          is_pro_version: true,
          product_id: purchase.productId,
          purchase_time: now,
          credits_current: credits_max,
          credits_max,
          subscription_start_date: now,
          last_credit_reset: now,
        }).eq('id', userId);

        if (error) throw error;

        await AsyncStorage.multiSet([
          ['profile.subscription_plan', planToUse],
          ['profile.subscription_id', subscriptionId],
          ['profile.is_pro_version', 'true'],
        ]);

        console.log('[IAP] ✅ Entitlement granted');
      }

      // finishTransaction handles acknowledgment on both iOS and Android in v12+
      // Explicitly include transactionId for v14 Nitro compatibility
      await iapModule.finishTransaction({ 
        purchase: { ...purchase, transactionId: txId }, 
        isConsumable: false 
      });

      if (shouldEntitle) {
        await AsyncStorage.setItem(INFLIGHT_KEY, 'false');
        this.currentPurchaseStartTime = null;
        this.currentPurchaseProductId = null;

        this.debugCallback?.({
          listenerStatus: 'PURCHASE SUCCESS! ✅',
          shouldNavigate: true,
          purchaseComplete: true,
          purchaseSource: source,
          isOrphanedPurchase: source === 'orphan',
        });
      }
    } catch (e) {
      console.error('[IAP] processPurchase error:', e);
      await AsyncStorage.setItem(INFLIGHT_KEY, 'false');
      throw e;
    }
  }
}

export default IAPService.getInstance();
