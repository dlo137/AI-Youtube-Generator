import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';
import { supabase } from '../lib/supabase';

// IAP functionality is not available - this service is a placeholder
const IAP: any = null;

const IAP_PRODUCT_IDS = [
  'thumbnail.yearly',
  'thumbnail.monthly',
  'thumbnail.weekly'
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

  private constructor() {}

  static getInstance(): IAPService {
    if (!IAPService.instance) {
      IAPService.instance = new IAPService();
    }
    return IAPService.instance;
  }

  async initialize(): Promise<boolean> {
    if (!IAP || typeof IAP.connectAsync !== 'function') {
      console.log('[IAP-SERVICE] IAP not available on this platform');
      return false;
    }

    try {
      // Connect first, then set up listener
      if (!this.isConnected) {
        console.log('[IAP-SERVICE] Connecting to store...');
        try {
          await IAP.getProductsAsync(['test']);
          console.log('[IAP-SERVICE] Already connected to store');
        } catch (error) {
          console.log('[IAP-SERVICE] Not connected, establishing connection...');
          await IAP.connectAsync();
          console.log('[IAP-SERVICE] Connected successfully');
        }
        this.isConnected = true;
      }

      // Set up purchase listener
      if (!this.hasListener) {
        console.log('[IAP-SERVICE] Setting up purchase listener...');
        await this.setupPurchaseListener();
        this.hasListener = true;
      }

      return true;
    } catch (error) {
      console.error('[IAP-SERVICE] Failed to initialize:', error);
      return false;
    }
  }

  private setupPurchaseListener() {
    console.log('[IAP-SERVICE] Setting up purchase listener...');

    if (!IAP.setPurchaseListener) {
      console.error('[IAP-SERVICE] setPurchaseListener is not available!');
      return;
    }

    // Clear any existing listener first
    try {
      IAP.setPurchaseListener(() => {});
      console.log('[IAP-SERVICE] Cleared existing listener');
    } catch (e) {
      console.log('[IAP-SERVICE] No existing listener to clear:', e);
    }

    // Set up the listener with direct navigation
    const listenerFunction = (result: any) => {
      console.log('[IAP-SERVICE] 🎉 PURCHASE LISTENER TRIGGERED 🎉');
      console.log('[IAP-SERVICE] Listener result:', JSON.stringify(result, null, 2));

      // Store the result immediately
      this.lastPurchaseResult = result;

      // Update debug callback
      if (this.debugCallback) {
        this.debugCallback({
          lastPurchase: result,
          listenerStatus: 'LISTENER TRIGGERED ✅'
        });
      }

      // Process the purchase result directly
      this.handlePurchaseResult(result).catch(error => {
        console.error('[IAP-SERVICE] Error in listener purchase handling:', error);
      });
    };

    try {
      IAP.setPurchaseListener(listenerFunction);
      console.log('[IAP-SERVICE] Purchase listener set successfully!');
    } catch (error) {
      console.error('[IAP-SERVICE] Error setting purchase listener:', error);
    }
  }

  private async handlePurchaseResult(result: any) {
    try {
      console.log('[IAP-SERVICE] 🔥 PROCESSING LISTENER RESULT 🔥', result);

      const { responseCode, results } = result;
      console.log('[IAP-SERVICE] Response code:', responseCode);
      console.log('[IAP-SERVICE] Results:', results);

      if (responseCode === IAP.IAPResponseCode.OK && results && results.length > 0) {
        console.log('[IAP-SERVICE] Purchase successful via listener, processing results:', results);
        await this.processPurchases(results, 'listener');

        // Resolve the purchase promise
        if (this.purchasePromiseResolve) {
          console.log('[IAP-SERVICE] Resolving purchase promise (success)');
          this.purchasePromiseResolve();
          this.purchasePromiseResolve = null;
          this.purchasePromiseReject = null;
        }

      } else if (responseCode === IAP.IAPResponseCode.USER_CANCELED) {
        console.log('[IAP-SERVICE] Purchase canceled by user (listener)');
        // Clear purchase session tracking
        this.currentPurchaseStartTime = null;
        this.currentPurchaseProductId = null;
        await AsyncStorage.setItem(INFLIGHT_KEY, 'false');

        if (this.debugCallback) {
          this.debugCallback({
            listenerStatus: 'USER CANCELLED ❌ (Listener)'
          });
        }

        // Reject the purchase promise with cancellation
        if (this.purchasePromiseReject) {
          console.log('[IAP-SERVICE] Rejecting purchase promise (user cancelled)');
          this.purchasePromiseReject(new Error('User cancelled purchase'));
          this.purchasePromiseResolve = null;
          this.purchasePromiseReject = null;
        }

      } else {
        console.log('[IAP-SERVICE] Purchase failed with response code (listener):', responseCode);
        this.currentPurchaseStartTime = null;
        this.currentPurchaseProductId = null;
        await AsyncStorage.setItem(INFLIGHT_KEY, 'false');

        if (this.debugCallback) {
          this.debugCallback({
            listenerStatus: 'PURCHASE FAILED ❌ (Listener)'
          });
        }

        // Reject the purchase promise
        if (this.purchasePromiseReject) {
          console.log('[IAP-SERVICE] Rejecting purchase promise (failed)');
          this.purchasePromiseReject(new Error('Purchase failed'));
          this.purchasePromiseResolve = null;
          this.purchasePromiseReject = null;
        }
      }
    } catch (listenerError) {
      console.error('[IAP-SERVICE] Purchase listener error:', listenerError);
      this.currentPurchaseStartTime = null;
      this.currentPurchaseProductId = null;
      await AsyncStorage.setItem(INFLIGHT_KEY, 'false');

      if (this.debugCallback) {
        this.debugCallback({
          listenerStatus: 'LISTENER ERROR ❌'
        });
      }

      // Reject the purchase promise
      if (this.purchasePromiseReject) {
        console.log('[IAP-SERVICE] Rejecting purchase promise (listener error)');
        this.purchasePromiseReject(listenerError);
        this.purchasePromiseResolve = null;
        this.purchasePromiseReject = null;
      }
    }
  }

  private longTermCheckTimer: NodeJS.Timeout | null = null;
  private longTermCheckAttempt: number = 0;

  private async startLongTermBackgroundCheck() {
    // Clear any existing timer
    if (this.longTermCheckTimer) {
      clearTimeout(this.longTermCheckTimer);
    }

    const maxLongTermAttempts = 24; // 24 attempts * 5 seconds = 2 minutes
    this.longTermCheckAttempt = 0;

    const checkPeriodically = async () => {
      this.longTermCheckAttempt++;
      console.log(`[IAP-SERVICE] LONG-TERM CHECK: Attempt ${this.longTermCheckAttempt}/${maxLongTermAttempts}`);

      try {
        const history = await IAP.getPurchaseHistoryAsync();

        if (history?.responseCode === IAP.IAPResponseCode.OK && history.results?.length) {
          const matchingPurchases = history.results.filter((p: any) => {
            const txId = p.transactionId || p.orderId;
            const isCorrectProduct = p.productId === this.currentPurchaseProductId;
            const isNotProcessed = !this.processedIds.has(txId);
            return isCorrectProduct && isNotProcessed;
          });

          if (matchingPurchases.length > 0) {
            console.log('[IAP-SERVICE] LONG-TERM CHECK: Found purchase! Processing...');

            if (this.longTermCheckTimer) {
              clearTimeout(this.longTermCheckTimer);
              this.longTermCheckTimer = null;
            }

            await this.processPurchases(matchingPurchases, 'fallback');
            return;
          }
        }

        // Continue checking if we haven't hit max attempts
        if (this.longTermCheckAttempt < maxLongTermAttempts) {
          this.longTermCheckTimer = setTimeout(checkPeriodically, 5000);
        } else {
          console.log('[IAP-SERVICE] LONG-TERM CHECK: Max attempts reached - stopping');
          await AsyncStorage.setItem(INFLIGHT_KEY, 'false');
          this.currentPurchaseStartTime = null;
          this.currentPurchaseProductId = null;

          if (this.debugCallback) {
            this.debugCallback({
              listenerStatus: 'TIMEOUT ❌ (Purchase not confirmed)'
            });
          }

          // Reject the purchase promise
          if (this.purchasePromiseReject) {
            console.log('[IAP-SERVICE] Rejecting purchase promise (timeout)');
            this.purchasePromiseReject(new Error('Purchase confirmation timeout'));
            this.purchasePromiseResolve = null;
            this.purchasePromiseReject = null;
          }

          Alert.alert(
            'Purchase Not Confirmed',
            'We couldn\'t confirm your purchase with the App Store. If you were charged, please use "Restore Purchases" to activate your subscription.',
            [{ text: 'OK' }]
          );
        }
      } catch (error) {
        console.error('[IAP-SERVICE] LONG-TERM CHECK: Error:', error);
        // Continue checking even on errors
        if (this.longTermCheckAttempt < maxLongTermAttempts) {
          this.longTermCheckTimer = setTimeout(checkPeriodically, 5000);
        }
      }
    };

    // Start first check
    this.longTermCheckTimer = setTimeout(checkPeriodically, 5000);
  }

  async manualPurchaseCheck() {
    console.log('[IAP-SERVICE] MANUAL CHECK: User requested manual check');

    try {
      const history = await IAP.getPurchaseHistoryAsync();

      if (history?.responseCode === IAP.IAPResponseCode.OK && history.results?.length) {
        const matchingPurchases = history.results.filter((p: any) => {
          const txId = p.transactionId || p.orderId;
          const isCorrectProduct = p.productId === this.currentPurchaseProductId;
          const isNotProcessed = !this.processedIds.has(txId);
          return isCorrectProduct && isNotProcessed;
        });

        if (matchingPurchases.length > 0) {
          console.log('[IAP-SERVICE] MANUAL CHECK: Found purchase!');

          // Clear long-term check timer
          if (this.longTermCheckTimer) {
            clearTimeout(this.longTermCheckTimer);
            this.longTermCheckTimer = null;
          }

          await this.processPurchases(matchingPurchases, 'fallback');
          Alert.alert('Success!', 'Your purchase has been found and activated.');
        } else {
          Alert.alert(
            'Still Checking',
            'Purchase not found yet. This can take a few minutes. We\'re still checking in the background.',
            [{ text: 'OK' }]
          );
        }
      } else {
        Alert.alert(
          'Connection Issue',
          'Could not connect to App Store. Please check your internet connection and try again.',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('[IAP-SERVICE] MANUAL CHECK: Error:', error);
      Alert.alert('Error', 'Failed to check purchases. Please try again.');
    }
  }

  private async startEnhancedFallbackCheck() {
    let attempt = 0;
    const maxAttempts = 10;
    const checkIntervals = [500, 1000, 2000, 3000, 4000, 5000, 6000, 8000, 10000, 12000];

    const checkForPurchase = async () => {
      attempt++;
      console.log(`[IAP-SERVICE] FALLBACK: Attempt ${attempt}/${maxAttempts} - Comprehensive purchase check...`);

      // Check if purchase was cancelled
      if (!this.currentPurchaseStartTime || !this.currentPurchaseProductId) {
        console.log('[IAP-SERVICE] FALLBACK: Purchase session was cleared (cancelled/failed), stopping checks');
        await AsyncStorage.setItem(INFLIGHT_KEY, 'false');
        if (this.debugCallback) {
          this.debugCallback({
            listenerStatus: 'CANCELLED/FAILED ❌ (Session cleared)'
          });
        }
        return;
      }

      try {
        // Check purchase history
        console.log('[IAP-SERVICE] FALLBACK: Checking purchase history...');
        const history = await IAP.getPurchaseHistoryAsync();
        console.log('[IAP-SERVICE] FALLBACK: Purchase history response:', {
          responseCode: history?.responseCode,
          resultsCount: history?.results?.length || 0
        });

        if (history?.responseCode === IAP.IAPResponseCode.OK && history.results?.length) {
          const matchingPurchases = history.results.filter((p: any) => {
            const txId = p.transactionId || p.orderId;
            const isCorrectProduct = p.productId === this.currentPurchaseProductId;
            const isNotProcessed = !this.processedIds.has(txId);

            return isCorrectProduct && isNotProcessed;
          });

          if (matchingPurchases.length > 0) {
            console.log('[IAP-SERVICE] FALLBACK: Found matching purchases!');

            if (this.debugCallback) {
              this.debugCallback({
                listenerStatus: `FALLBACK SUCCESS! ✅ (Found after ${attempt} attempts)`
              });
            }

            await this.processPurchases(matchingPurchases, 'fallback');
            return;
          }
        }

        // No purchase found yet - try again if we have attempts left
        if (attempt < maxAttempts) {
          console.log(`[IAP-SERVICE] FALLBACK: No purchase found on attempt ${attempt}, retrying in ${checkIntervals[attempt] / 1000}s...`);

          if (this.debugCallback) {
            this.debugCallback({
              listenerStatus: `CHECKING... ⏳ (Attempt ${attempt}/${maxAttempts})`
            });
          }

          setTimeout(checkForPurchase, checkIntervals[attempt]);
        } else {
          console.log('[IAP-SERVICE] FALLBACK: All attempts exhausted - starting continuous background check');

          // Don't clear the in-flight flag yet - we'll keep checking
          // await AsyncStorage.setItem(INFLIGHT_KEY, 'false');

          if (this.debugCallback) {
            this.debugCallback({
              listenerStatus: 'CHECKING IN BACKGROUND... ⏳'
            });
          }

          // Start a longer-term background check (every 5 seconds for 2 minutes)
          this.startLongTermBackgroundCheck();

          // Show error to user explaining the issue
          Alert.alert(
            'Connection Issue',
            'We\'re having trouble connecting to the App Store to confirm your purchase.\n\nPossible issues:\n• Slow internet connection\n• App Store server delay\n• Network timeout\n\nWe\'re still checking in the background. Your purchase is safe - if you were charged, your subscription will activate automatically within a few minutes.',
            [
              {
                text: 'Check Again',
                onPress: () => this.manualPurchaseCheck()
              },
              {
                text: 'Wait',
                style: 'cancel'
              }
            ]
          );
        }

      } catch (fallbackError) {
        console.error(`[IAP-SERVICE] FALLBACK: Error on attempt ${attempt}:`, fallbackError);

        if (attempt < maxAttempts) {
          console.log(`[IAP-SERVICE] FALLBACK: Retrying due to error in ${checkIntervals[attempt] / 1000}s...`);
          setTimeout(checkForPurchase, checkIntervals[attempt]);
        } else {
          await AsyncStorage.setItem(INFLIGHT_KEY, 'false');
          if (this.debugCallback) {
            this.debugCallback({
              listenerStatus: 'FALLBACK ERROR ❌'
            });
          }
        }
      }
    };

    // Start the first check
    setTimeout(checkForPurchase, checkIntervals[0]);
  }

  private async processPurchases(purchases: any[], source: 'listener' | 'restore' | 'orphan' | 'fallback') {
    console.log(`[IAP-SERVICE] Processing ${purchases.length} purchases from ${source}`);

    const inFlight = (await AsyncStorage.getItem(INFLIGHT_KEY)) === 'true';
    console.log(`[IAP-SERVICE] In-flight flag: ${inFlight}`);

    for (const purchase of purchases) {
      const txId = purchase.transactionId || purchase.orderId;
      console.log(`[IAP-SERVICE] Processing purchase:`, {
        productId: purchase.productId,
        transactionId: txId,
        purchaseState: purchase.purchaseState,
        source
      });

      if (!txId || this.processedIds.has(txId)) {
        console.log(`[IAP-SERVICE] Skipping already processed transaction: ${txId}`);
        continue;
      }

      this.processedIds.add(txId);

      try {
        // Map productId -> plan
        let planToUse: 'yearly' | 'monthly' | 'weekly' = 'yearly';
        if (/monthly/i.test(purchase.productId)) {
          planToUse = 'monthly';
        } else if (/weekly/i.test(purchase.productId)) {
          planToUse = 'weekly';
        }

        const subscriptionId = `${purchase.productId}_${Date.now()}`;
        const { data: userData } = await supabase.auth.getUser();
        const userId = userData?.user?.id;

        console.log(`[IAP-SERVICE] Purchase details:`, {
          planToUse,
          subscriptionId,
          userId: userId ? 'found' : 'missing',
          source,
          inFlight
        });

        // Determine if we should grant entitlement
        // IMPORTANT: orphan transactions should always be entitled (user already paid)
        const shouldEntitle =
          (source === 'listener' && inFlight) ||
          source === 'restore' ||
          source === 'orphan' ||  // Always entitle orphaned transactions
          (source === 'fallback' && inFlight);

        console.log(`[IAP-SERVICE] Should entitle: ${shouldEntitle}`);

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

        // Always finish the transaction
        console.log('[IAP-SERVICE] Finishing transaction...');
        await IAP.finishTransactionAsync(purchase, false);

        // Navigate and clear flag for deliberate purchases
        if (shouldEntitle) {
          console.log('[IAP-SERVICE] Clearing in-flight flag and navigating...');
          await AsyncStorage.setItem(INFLIGHT_KEY, 'false');

          // Clear purchase session tracking on success
          this.currentPurchaseStartTime = null;
          this.currentPurchaseProductId = null;

          // Update debug callback for success - let the callback handler do the navigation
          console.log(`[IAP-SERVICE] ✅ Purchase complete! Notifying UI from ${source}`);

          if (this.debugCallback) {
            this.debugCallback({
              listenerStatus: 'PURCHASE SUCCESS! ✅ (Navigating...)',
              shouldNavigate: true,
              purchaseComplete: true
            });
          }

          // Resolve the purchase promise (for fallback purchases)
          if (source === 'fallback' && this.purchasePromiseResolve) {
            console.log('[IAP-SERVICE] Resolving purchase promise (fallback success)');
            this.purchasePromiseResolve();
            this.purchasePromiseResolve = null;
            this.purchasePromiseReject = null;
          }
        }

      } catch (error) {
        console.error(`[IAP-SERVICE] Error processing purchase from ${source}:`, error);
        await AsyncStorage.setItem(INFLIGHT_KEY, 'false');

        // Reject the purchase promise
        if ((source === 'listener' || source === 'fallback') && this.purchasePromiseReject) {
          console.log('[IAP-SERVICE] Rejecting purchase promise (processing error)');
          this.purchasePromiseReject(error);
          this.purchasePromiseResolve = null;
          this.purchasePromiseReject = null;
        }

        // Only show error to user if they initiated this flow
        if (source === 'listener' || source === 'fallback') {
          const inFlight = (await AsyncStorage.getItem(INFLIGHT_KEY)) === 'true';
          if (inFlight) {
            Alert.alert(
              'Subscription Error',
              'Your purchase was successful, but we had trouble activating your subscription. Please contact support if this persists.'
            );
          }
        }

        throw error;
      }
    }
  }

  async getProducts(): Promise<any[]> {
    if (!this.isConnected) {
      await this.initialize();
    }

    try {
      const { responseCode, results } = await IAP.getProductsAsync(IAP_PRODUCT_IDS);
      console.log('[IAP-SERVICE] Product fetch response:', { responseCode, results });

      if (responseCode === IAP.IAPResponseCode.OK && results?.length) {
        console.log('[IAP-SERVICE] Products loaded:', results.map(p => `${p.productId}: ${p.price}`).join(', '));
        return results;
      } else {
        console.log('[IAP-SERVICE] No products available or error:', { responseCode, results });
        return [];
      }
    } catch (err) {
      console.error('[IAP-SERVICE] Error fetching products:', err);
      return [];
    }
  }

  async purchaseProduct(productId: string): Promise<void> {
    if (!this.isConnected) {
      console.log('[IAP-SERVICE] Not connected, initializing...');
      await this.initialize();
    }

    // Track current purchase session
    this.currentPurchaseStartTime = Date.now();
    this.currentPurchaseProductId = productId;

    console.log(`[IAP-SERVICE] Setting in-flight flag and attempting purchase: ${productId}`);
    await AsyncStorage.setItem(INFLIGHT_KEY, 'true');
    console.log('[IAP-SERVICE] In-flight flag set to true');

    // Create a promise that will be resolved/rejected by the purchase listener
    const purchasePromise = new Promise<void>((resolve, reject) => {
      this.purchasePromiseResolve = resolve;
      this.purchasePromiseReject = reject;
    });

    try {
      console.log('[IAP-SERVICE] Calling IAP.purchaseItemAsync...');
      const result = await IAP.purchaseItemAsync(productId);
      console.log('[IAP-SERVICE] purchaseItemAsync returned:', result);

      // Start fallback check in case listener doesn't fire
      console.log('[IAP-SERVICE] Starting fallback check...');

      if (this.debugCallback) {
        this.debugCallback({
          listenerStatus: 'PURCHASE INITIATED - WAITING FOR RESPONSE... ⏳'
        });
      }

      // Enhanced fallback with multiple retries
      this.startEnhancedFallbackCheck();

      // Wait for the purchase to complete via listener or fallback
      console.log('[IAP-SERVICE] Waiting for purchase completion...');
      await purchasePromise;
      console.log('[IAP-SERVICE] Purchase completed successfully!');

    } catch (error: any) {
      console.error('[IAP-SERVICE] purchaseItemAsync failed:', error);
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
        throw new Error('User cancelled purchase'); // Throw for cancellation so UI can handle it
      }

      throw error;
    }
  }

  async restorePurchases(): Promise<any[]> {
    if (!this.isConnected) {
      await this.initialize();
    }

    try {
      await AsyncStorage.setItem(INFLIGHT_KEY, 'true');
      const { responseCode, results } = await IAP.getPurchaseHistoryAsync();

      if (responseCode !== IAP.IAPResponseCode.OK) {
        await AsyncStorage.setItem(INFLIGHT_KEY, 'false');
        throw new Error('Could not connect to App Store');
      }

      if (!results?.length) {
        await AsyncStorage.setItem(INFLIGHT_KEY, 'false');
        throw new Error('No previous purchases found');
      }

      await this.processPurchases(results, 'restore');
      return results;
    } catch (error) {
      await AsyncStorage.setItem(INFLIGHT_KEY, 'false');
      throw error;
    }
  }

  async checkForOrphanedTransactions(): Promise<void> {
    if (!this.isConnected) {
      await this.initialize();
    }

    try {
      console.log('[IAP-SERVICE] Checking for orphaned transactions...');
      const history = await IAP.getPurchaseHistoryAsync();
      if (history?.responseCode === IAP.IAPResponseCode.OK && history.results?.length) {
        console.log('[IAP-SERVICE] Found purchase history, processing as orphans');
        await this.processPurchases(history.results, 'orphan');
      }
    } catch (e) {
      console.error('[IAP-SERVICE] Error checking for orphaned transactions:', e);
    }
  }

  isAvailable(): boolean {
    return IAP && typeof IAP.connectAsync === 'function';
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
}

export default IAPService.getInstance();
