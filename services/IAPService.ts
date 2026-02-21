import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';

// ─────────────────────────────────────────────────────────────────────────────
// react-native-iap v14 (Nitro) API reference:
//
//   fetchProducts({ skus, type: 'subs' })         ← fetch subscription products
//   requestPurchase({                              ← initiate a purchase
//     type: 'subs',
//     request: {
//       apple: { sku }                            (iOS)
//       google: { skus: [...], subscriptionOffers: [] }  (Android)
//     }
//   })
//   finishTransaction({ purchase, isConsumable })  ← uses purchase.id on iOS
//   getAvailablePurchases()                        ← restore / pending check
//   purchaseUpdatedListener / purchaseErrorListener
//
// Purchase object fields (v14):
//   purchase.id           — primary key (transactionId on iOS, orderId on Android)
//   purchase.productId    — the SKU
//   purchase.purchaseToken — iOS JWS or Android token
// ─────────────────────────────────────────────────────────────────────────────

let iapAvailable = false;
let iapModule: any = null;

try {
  iapModule = require('react-native-iap');
  if (typeof iapModule.initConnection === 'function') {
    iapAvailable = true;
    console.log('[IAP] ✅ Module loaded, initConnection present');
  } else {
    console.log('[IAP] ❌ initConnection missing — module may not be linked');
  }
} catch (e: any) {
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

  getLastPurchaseResult() {
    return this.lastPurchaseResult;
  }

  setDebugCallback(cb: (info: any) => void) {
    this.debugCallback = cb;
  }

  getProductFetchLogs(): string[] {
    return [...this.productFetchLogs];
  }

  getConnectionStatus() {
    return { isConnected: this.isConnected, hasListener: this.hasListener };
  }

  // ── Initialization ─────────────────────────────────────────────────────────

  async initialize(): Promise<boolean> {
    if (!this.isAvailable()) {
      console.log('[IAP] Not available — skipping init');
      return false;
    }

    try {
      console.log('[IAP] Initializing... platform:', Platform.OS);

      if (!this.isConnected) {
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

  async getProducts(): Promise<any[]> {
    this.productFetchLogs = [];
    this.log('========== PRODUCT FETCH ==========');
    this.log(`Platform: ${Platform.OS}`);

    if (!this.isAvailable()) {
      this.log('❌ IAP not available');
      return [];
    }

    if (!this.isConnected) {
      this.log('Not connected — initializing...');
      const ok = await this.initialize();
      if (!ok) {
        this.log('❌ Initialization failed');
        return [];
      }
    }

    // Brief pause to let StoreKit settle after connection
    await new Promise(r => setTimeout(r, 500));

    const productIds = Platform.OS === 'ios' ? IOS_PRODUCT_IDS : ANDROID_PRODUCT_IDS;
    this.log(`Requesting SKUs: ${productIds.join(', ')}`);

    // v14 Nitro: fetchProducts with type:'subs' is the correct path for subscriptions.
    // NEVER call NativeModules.RNIapIos.getItems() directly — that bypasses the
    // Nitro thread-safe bridge and causes EXC_BAD_ACCESS (SIGSEGV) when StoreKit
    // throws an NSException on a background GCD thread.

    if (typeof iapModule.fetchProducts !== 'function') {
      this.log('❌ fetchProducts not available — unexpected for v14');
      return [];
    }

    // Attempt 1: subscriptions (the correct type for all our products)
    this.log('ATTEMPT 1: fetchProducts({ skus, type: "subs" })');
    try {
      const results = await iapModule.fetchProducts({ skus: productIds, type: 'subs' });
      if (results?.length > 0) {
        this.log(`✅ Got ${results.length} products`);
        return results;
      }
      this.log('Returned 0 — trying type: "all"');
    } catch (e: any) {
      this.log(`fetchProducts(subs) failed: ${e?.message}`);
    }

    // Attempt 2: 'all' catches any mixed in-app / subscription set
    this.log('ATTEMPT 2: fetchProducts({ skus, type: "all" })');
    try {
      const results = await iapModule.fetchProducts({ skus: productIds, type: 'all' });
      if (results?.length > 0) {
        this.log(`✅ Got ${results.length} products via "all"`);
        return results;
      }
      this.log('Returned 0');
    } catch (e: any) {
      this.log(`fetchProducts(all) failed: ${e?.message}`);
    }

    this.log('========== ALL ATTEMPTS FAILED ==========');
    this.log('Checklist:');
    this.log('  1. Product IDs match App Store Connect exactly');
    this.log('  2. Products are in "Ready to Submit" or "Approved" state');
    this.log('  3. Sandbox Apple ID is signed into the device');
    this.log('  4. Bundle ID matches provisioning profile');
    this.log(`  Requested: ${productIds.join(', ')}`);
    return [];
  }

  // ── Purchase flow ──────────────────────────────────────────────────────────

  async purchaseProduct(productId: string): Promise<void> {
    if (!this.isAvailable()) throw new Error('IAP not available');
    if (!this.isConnected) await this.initialize();

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
      console.log('[IAP] requestPurchase:', productId);

      // v14 Nitro API: request must be wrapped in platform-specific keys.
      // type: 'subs' is required for subscriptions — without it the purchase
      // flow behaves incorrectly on both StoreKit 1 and StoreKit 2.
      if (Platform.OS === 'ios') {
        await iapModule.requestPurchase({
          type: 'subs',
          request: {
            apple: { sku: productId },
          },
        });
      } else {
        await iapModule.requestPurchase({
          type: 'subs',
          request: {
            google: {
              skus: [productId],
              subscriptionOffers: [],
            },
          },
        });
      }

      this.debugCallback?.({ listenerStatus: 'PURCHASE INITIATED — WAITING ⏳', productId });
      await purchasePromise;
      console.log('[IAP] ✅ Purchase complete');
    } catch (e: any) {
      console.error('[IAP] purchaseProduct error:', e?.message);
      await AsyncStorage.setItem(INFLIGHT_KEY, 'false');
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
          const txId = p.id ?? p.transactionId;
          if (txId && !this.processedIds.has(txId)) {
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
    // v14: primary key is purchase.id (transactionId on iOS, orderId on Android)
    const txId = purchase.id ?? purchase.transactionId;

    if (!txId || this.processedIds.has(txId)) {
      console.log('[IAP] Skipping already-processed tx:', txId);
      return;
    }
    this.processedIds.add(txId);

    try {
      const productId = (purchase.productId ?? '').toLowerCase();
      let planToUse: 'yearly' | 'monthly' | 'weekly' = 'yearly';
      if (productId.includes('monthly')) planToUse = 'monthly';
      else if (productId.includes('weekly')) planToUse = 'weekly';

      const inFlight = (await AsyncStorage.getItem(INFLIGHT_KEY)) === 'true';
      const shouldEntitle =
        (source === 'listener' && inFlight) ||
        source === 'restore' ||
        source === 'orphan';

      console.log(`[IAP] processPurchase: source=${source} inFlight=${inFlight} shouldEntitle=${shouldEntitle}`);

      if (source === 'listener' && !inFlight) {
        console.warn('[IAP] Listener purchase with no in-flight flag — ignoring');
        return;
      }

      if (shouldEntitle) {
        const { data: { user } } = await supabase.auth.getUser();
        const userId = user?.id;

        if (!userId) {
          throw new Error('User not authenticated — cannot grant entitlement');
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

      // v14 finishTransaction: uses purchase.id on iOS, purchase.purchaseToken on Android.
      // Pass the purchase object as-is — the library extracts the right field per platform.
      await iapModule.finishTransaction({ purchase, isConsumable: false });

      if (shouldEntitle) {
        await AsyncStorage.setItem(INFLIGHT_KEY, 'false');
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
