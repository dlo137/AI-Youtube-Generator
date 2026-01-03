import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Animated, Alert, Image, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import IAPService from '../services/IAPService';
import { supabase } from '../lib/supabase';
import { trackScreenView, trackEvent } from '../lib/posthog';

// Platform-specific product IDs
const PRODUCT_IDS = Platform.OS === 'ios' ? {
  yearly: 'thumbnail.yearly',
  monthly: 'thumbnail.monthly',
  weekly: 'thumbnail.weekly',
  discountedWeekly: 'discounted.weekly',
} : {
  yearly: 'ai.thumbnail.pro:yearly',
  monthly: 'ai.thumbnail.pro:monthly',
  weekly: 'ai.thumbnail.pro:weekly',
  discountedWeekly: 'discounted.weekly',
};

export default function SubscriptionScreen() {
  const router = useRouter();
  const routerRef = useRef(router);
  const [selectedPlan, setSelectedPlan] = useState<'yearly' | 'monthly' | 'weekly'>('yearly');
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [products, setProducts] = useState<any[]>([]);
  const [iapReady, setIapReady] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [currentPurchaseAttempt, setCurrentPurchaseAttempt] = useState<'monthly' | 'yearly' | 'weekly' | null>(null);
  const hasProcessedOrphansRef = useRef<boolean>(false);
  const isRestoringRef = useRef<boolean>(false);
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const discountModalAnim = useRef(new Animated.Value(0)).current;

  // Keep router ref updated
  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  // Debug state
  const [debugInfo, setDebugInfo] = useState<any>({
    listenerStatus: 'Not started',
    connectionStatus: { isConnected: false, hasListener: false },
    lastPurchaseResult: null,
    timestamp: new Date().toISOString()
  });
  const [showDebug, setShowDebug] = useState(true); // Set to false to hide debug panel

  // Check if IAP is available
  const isIAPAvailable = IAPService.isAvailable();

  // Stable callback for IAP events
  const handleIAPCallback = useCallback((info: any) => {
    console.log('[SUBSCRIPTION] IAP Debug:', info);

    // Update debug info
    setDebugInfo((prev: any) => ({
      ...prev,
      ...info,
      connectionStatus: IAPService.getConnectionStatus(),
      timestamp: new Date().toISOString()
    }));

    // Handle successful purchase - navigate to generate screen
    if (info.listenerStatus?.includes('SUCCESS') || info.listenerStatus?.includes('Navigating')) {
      console.log('[SUBSCRIPTION] Purchase successful!', {
        purchaseSource: info.purchaseSource,
        isOrphaned: info.isOrphanedPurchase
      });

      // CRITICAL: Only auto-navigate for new purchases (listener), not orphaned transactions
      // This prevents users from being pushed through without actually completing a purchase
      if (info.isOrphanedPurchase) {
        console.log('[SUBSCRIPTION] Orphaned purchase recovered - processing silently without alert');

        // Silently process orphaned purchases without showing alerts or auto-navigating
        // Just like the simulated/dev mode - update happens in background
        setCurrentPurchaseAttempt(null);

        trackEvent('subscription_completed', {
          plan: 'recovered',
          platform: Platform.OS,
          source: 'orphaned_transaction'
        });

        return; // Don't show alert or auto-navigate
      }

      // Only auto-navigate for new purchases from the listener
      console.log('[SUBSCRIPTION] New purchase completed! Navigating to generate screen...');

      // Track successful subscription
      trackEvent('subscription_completed', {
        plan: currentPurchaseAttempt || selectedPlan,
        platform: Platform.OS,
        source: info.purchaseSource || 'listener'
      });

      setCurrentPurchaseAttempt(null);

      // Use router ref to ensure we have the latest router instance
      const currentRouter = routerRef.current;
      if (currentRouter && typeof currentRouter.replace === 'function') {
        console.log('[SUBSCRIPTION] Router available, navigating now...');
        setTimeout(() => {
          currentRouter.replace('/(tabs)/generate');
        }, 500);
      } else {
        console.error('[SUBSCRIPTION] Router not available or replace function missing!', currentRouter);
        // Fallback: try direct navigation
        try {
          router.replace('/(tabs)/generate');
        } catch (err) {
          console.error('[SUBSCRIPTION] Fallback navigation failed:', err);
        }
      }
    }

    // Update loading state based on listener status
    if (info.listenerStatus?.includes('CANCELLED') || info.listenerStatus?.includes('FAILED') || info.listenerStatus?.includes('TIMEOUT')) {
      setCurrentPurchaseAttempt(null);
    }
  }, [router]);

  useEffect(() => {
    trackScreenView('Subscription Screen');

    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();

    initializeIAP();

    // Fallback: Set IAP ready after 5 seconds if still not ready
    const timeout = setTimeout(() => {
      setIapReady(true);
      console.log('[SUBSCRIPTION] IAP initialization timeout - unblocking button');
    }, 5000);

    return () => clearTimeout(timeout);
  }, []);

  // Re-register callback whenever it changes
  useEffect(() => {
    if (iapReady) {
      console.log('[SUBSCRIPTION] Re-registering IAP callback');
      IAPService.setDebugCallback(handleIAPCallback);
    }
  }, [handleIAPCallback, iapReady]);

  const initializeIAP = async () => {
    if (!isIAPAvailable) {
      console.log('[SUBSCRIPTION] IAP not available on this platform');
      // Set IAP ready to true even if unavailable so button is not stuck
      setIapReady(true);
      return;
    }

    try {
      const initialized = await IAPService.initialize();
      setIapReady(initialized);

      if (initialized) {
        // Set up debug callback using the stable callback
        IAPService.setDebugCallback(handleIAPCallback);

        // Check for orphaned transactions on startup
        if (!hasProcessedOrphansRef.current) {
          hasProcessedOrphansRef.current = true;
          await IAPService.checkForOrphanedTransactions();
        }

        // Fetch products
        await fetchProducts();
      } else {
        // If initialization failed, still set ready to true to unblock the button
        setIapReady(true);
      }
    } catch (error) {
      console.error('[SUBSCRIPTION] Error initializing IAP:', error);
      // Set ready to true even on error to prevent button from being stuck
      setIapReady(true);
      Alert.alert('Error', 'Failed to initialize purchases. Please restart the app.');
    }
  };

  const fetchProducts = async (showErrors = false) => {
    if (!isIAPAvailable) {
      if (showErrors) {
        Alert.alert('IAP Unavailable', 'In-app purchases are not available on this platform.');
      }
      return [];
    }

    console.log('[SUBSCRIPTION] Fetching products...');
    try {
      setLoadingProducts(true);
      const results = await IAPService.getProducts();
      if (results?.length) {
        setProducts(results);
        console.log('[SUBSCRIPTION] Products loaded:', results.map(p => `${p.productId}: ${p.price}`).join(', '));
        return results;
      } else {
        setProducts([]);
        console.log('[SUBSCRIPTION] No products available');
        if (showErrors) {
          Alert.alert('Products Unavailable', 'Could not load subscription products. Please check your internet connection and try again.');
        }
        return [];
      }
    } catch (err) {
      setProducts([]);
      console.error('[SUBSCRIPTION] Error fetching products:', err);
      if (showErrors) {
        Alert.alert('Error', 'Failed to load products: ' + String(err instanceof Error ? err.message : err));
      }
      return [];
    } finally {
      setLoadingProducts(false);
    }
  };

  const handleContinue = async () => {
    console.log('[SUBSCRIPTION] ⚠️ PRODUCTION LOG: User tapped Get Started button');
    console.log('[SUBSCRIPTION] IAP Available:', isIAPAvailable);
    console.log('[SUBSCRIPTION] IAP Ready:', iapReady);
    console.log('[SUBSCRIPTION] Current purchase attempt:', currentPurchaseAttempt);

    if (!isIAPAvailable) {
      console.log('[SUBSCRIPTION] ⚠️ IAP not available - this should only happen in Expo Go or if react-native-iap failed to load');
      // For development/testing: Allow bypass in development mode
      if (__DEV__) {
        Alert.alert(
          'Development Mode',
          'IAP is not available. Would you like to simulate a successful purchase for testing?',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Simulate Purchase',
              onPress: async () => {
                try {
                  // Get current user
                  const { data: { user }, error: userError } = await supabase.auth.getUser();
                  if (userError || !user) {
                    throw new Error('User not authenticated');
                  }

                  // Determine credits based on plan
                  let credits_max = 0;
                  switch (selectedPlan) {
                    case 'yearly': credits_max = 90; break;
                    case 'monthly': credits_max = 75; break;
                    case 'weekly': credits_max = 10; break;
                  }

                  // Update subscription in Supabase with is_pro_version = true
                  const { error: updateError } = await supabase
                    .from('profiles')
                    .update({
                      subscription_plan: selectedPlan,
                      is_pro_version: true,
                      subscription_id: `test_${selectedPlan}_${Date.now()}`,
                      purchase_time: new Date().toISOString(),
                      credits_current: credits_max,
                      credits_max: credits_max,
                      last_credit_reset: new Date().toISOString()
                    })
                    .eq('id', user.id);

                  if (updateError) throw updateError;

                  // Track test subscription
                  trackEvent('subscription_completed', {
                    plan: selectedPlan,
                    platform: Platform.OS,
                    test_mode: true,
                  });

                  Alert.alert('Success (Simulated)', 'Your subscription has been activated (development mode).', [
                    { text: 'Continue', onPress: () => router.replace('/(tabs)/generate') }
                  ]);
                } catch (error) {
                  console.error('Test purchase error:', error);
                  Alert.alert('Error', 'Failed to activate test subscription.');
                }
              }
            }
          ]
        );
      } else {
        Alert.alert('Purchases unavailable', 'In-app purchases are not available on this device.');
      }
      return;
    }

    const list = products.length ? products : await fetchProducts(true);
    const planId = PRODUCT_IDS[selectedPlan];
    const product = list.find(p => p.productId === planId);

    if (!product) {
      Alert.alert(
        'Plan not available',
        'We couldn\'t find that plan. Please check your internet connection and try again.'
      );
      return;
    }

    // Set the current purchase attempt BEFORE starting the purchase
    setCurrentPurchaseAttempt(selectedPlan);
    console.log('[SUBSCRIPTION] ⚠️ PRODUCTION LOG: Starting purchase flow for:', product.productId);
    console.log('[SUBSCRIPTION] Selected plan:', selectedPlan);
    await handlePurchase(product.productId);
  };

  const handlePurchase = async (productId: string) => {
    if (!isIAPAvailable) {
      console.error('[SUBSCRIPTION] ⚠️ ERROR: handlePurchase called but IAP not available!');
      Alert.alert('Purchases unavailable', 'In-app purchases are not available on this device.');
      setCurrentPurchaseAttempt(null);
      return;
    }

    try {
      console.log('[SUBSCRIPTION] ⚠️ PRODUCTION LOG: Calling IAPService.purchaseProduct');
      console.log('[SUBSCRIPTION] Product ID:', productId);
      console.log('[SUBSCRIPTION] Expecting IAP modal to appear...');
      await IAPService.purchaseProduct(productId);
    } catch (e: any) {
      setCurrentPurchaseAttempt(null); // Clear on error
      const msg = String(e?.message || e);

      if (/already.*(owned|subscribed)/i.test(msg)) {
        Alert.alert(
          'Already subscribed',
          'You already have an active subscription. Manage your subscriptions from the App Store.',
          [
            { text: 'OK' },
          ]
        );
        return;
      }

      if (/item.*unavailable|product.*not.*available/i.test(msg)) {
        Alert.alert('Not available', 'This plan isn\'t available for purchase right now.');
        return;
      }

      // Handle user cancellation
      if (/user.*(cancel|abort)/i.test(msg) || /cancel/i.test(msg)) {
        console.log('[SUBSCRIPTION] Purchase was cancelled by user');
        return;
      }

      console.error('[SUBSCRIPTION] Purchase error:', msg);
      Alert.alert('Purchase error', msg);
    }
  };

  const handleRestore = async () => {
    // Prevent multiple alerts by using a flag
    if (isRestoringRef.current) return;
    isRestoringRef.current = true;

    if (!isIAPAvailable) {
      Alert.alert('Restore Failed', 'In-app purchases are not available on this device.');
      isRestoringRef.current = false;
      return;
    }

    try {
      console.log('[SUBSCRIPTION] Attempting to restore purchases...');
      const results = await IAPService.restorePurchases();
      if (results.length > 0) {
        Alert.alert('Success', 'Your purchases have been restored!', [
          { text: 'Continue', onPress: () => {
              isRestoringRef.current = false;
              router.replace('/(tabs)/generate');
            } }
        ]);
      } else {
        isRestoringRef.current = false;
      }
    } catch (err: any) {
      isRestoringRef.current = false;
      const errorMsg = String(err?.message || err);
      if (errorMsg.includes('No previous purchases')) {
        Alert.alert('No Purchases', 'No previous purchases were found.');
      } else if (errorMsg.includes('Could not connect')) {
        Alert.alert('Restore Failed', 'Could not connect to App Store.');
      } else {
        Alert.alert('Error', 'Something went wrong while restoring.');
      }
    }
  };

  // Helper function to format price - always use fallback to show "/week" format
  const formatPrice = (plan: string, fallbackPrice: string) => {
    // Always return the fallback price to maintain consistent "/week" format
    // Apple's IAP prices don't include the duration suffix
    return fallbackPrice;
  };

  const handleClose = () => {
    // Track discount modal shown
    trackEvent('discount_modal_shown', {
      context: 'subscription_exit',
    });
    
    setShowDiscountModal(true);
    Animated.timing(discountModalAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  };

  const handleCloseWithoutDiscount = async () => {
    trackEvent('discount_modal_dismissed', {
      action: 'continue_without_discount',
    });
    
    Animated.timing(discountModalAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(async () => {
      setShowDiscountModal(false);
      // Sign out the user so they can restart onboarding
      await supabase.auth.signOut();
      router.replace('/');
    });
  };

  const handleDiscountPurchase = async () => {
    if (!isIAPAvailable) {
      // For development/testing: Allow bypass in development mode
      if (__DEV__) {
        Alert.alert(
          'Development Mode',
          'IAP is not available. Would you like to simulate a successful purchase for testing?',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Simulate Purchase',
              onPress: async () => {
                try {
                  // Get current user
                  const { data: { user }, error: userError } = await supabase.auth.getUser();
                  if (userError || !user) {
                    throw new Error('User not authenticated');
                  }

                  // Discounted weekly plan gets 10 credits
                  const credits_max = 10;

                  // Update subscription in Supabase with is_pro_version = true
                  const { error: updateError } = await supabase
                    .from('profiles')
                    .update({
                      subscription_plan: 'discounted_weekly',
                      is_pro_version: true,
                      subscription_id: `test_discounted_weekly_${Date.now()}`,
                      purchase_time: new Date().toISOString(),
                      credits_current: credits_max,
                      credits_max: credits_max,
                      last_credit_reset: new Date().toISOString()
                    })
                    .eq('id', user.id);

                  if (updateError) throw updateError;

                  // Track test subscription
                  trackEvent('subscription_completed', {
                    plan: 'discounted_weekly',
                    platform: Platform.OS,
                    test_mode: true,
                  });

                  Alert.alert('Success (Simulated)', 'Your discounted subscription has been activated (development mode).', [
                    { text: 'Continue', onPress: () => router.replace('/(tabs)/generate') }
                  ]);
                } catch (error) {
                  console.error('Test discount purchase error:', error);
                  Alert.alert('Error', 'Failed to activate test subscription.');
                }
              }
            }
          ]
        );
      } else {
        Alert.alert('Purchases unavailable', 'In-app purchases are not available on this device.');
      }
      return;
    }

    trackEvent('discount_purchase_initiated', {
      productId: PRODUCT_IDS.discountedWeekly,
      price: '$1.99',
    });

    try {
      setCurrentPurchaseAttempt('weekly');
      console.log('[SUBSCRIPTION] Attempting to purchase discounted weekly:', PRODUCT_IDS.discountedWeekly);
      await IAPService.purchaseProduct(PRODUCT_IDS.discountedWeekly);
    } catch (error: any) {
      setCurrentPurchaseAttempt(null);
      console.error('[SUBSCRIPTION] Discount purchase error:', error);
      
      const msg = String(error?.message || error);

      // Handle specific error cases
      if (/already.*(owned|subscribed)/i.test(msg)) {
        Alert.alert(
          'Already subscribed',
          'You already have an active subscription. Manage your subscriptions from the App Store.',
          [{ text: 'OK' }]
        );
        return;
      }

      if (/item.*unavailable|product.*not.*available/i.test(msg)) {
        Alert.alert(
          'Product Unavailable',
          'This special offer is currently unavailable. Please try again later or choose a different plan.'
        );
        return;
      }

      trackEvent('discount_purchase_failed', {
        error: error?.message || String(error),
      });

      if (error?.message && !error.message.includes('cancelled')) {
        Alert.alert(
          'Purchase Failed',
          error.message || 'Unable to complete purchase. Please try again.'
        );
      }
    }
  };

  return (
    <LinearGradient
      colors={['#050810', '#0d1120', '#08091a']}
      style={styles.container}
    >
      <StatusBar style="light" />

      {/* Close Button */}
      <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
        <Text style={styles.closeText}>✕</Text>
      </TouchableOpacity>

      {/* Already Purchased / Restore */}
      <TouchableOpacity style={styles.alreadyPurchased} onPress={handleRestore}>
        <Text style={styles.alreadyPurchasedText}>Restore Purchases</Text>
      </TouchableOpacity>

      <Animated.ScrollView
        contentContainerStyle={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
        style={{ opacity: fadeAnim, flex: 1 }}
      >
        {/* Logo/Icon with Glow */}
        <View style={styles.logoContainer}>
          <View style={styles.logoGlow}>
            <View style={styles.logo}>
              <Image
                source={require('../assets/Thumbnail-Icon2.png')}
                style={styles.logoImage}
                resizeMode="contain"
              />
            </View>
          </View>
        </View>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Turn Ideas Into Clicks.</Text>
          <Text style={styles.subtitle}>
            Every click counts. Create and save eye-catching thumbnails that grow your channel, build your audience, and boost your revenue.
          </Text>
        </View>

        {/* Plans */}
        <View style={styles.plansContainer}>
          {/* Weekly Plan */}
          <TouchableOpacity
            style={[
              styles.planCard,
              selectedPlan === 'weekly' && styles.selectedPlan,
            ]}
            onPress={() => setSelectedPlan('weekly')}
          >
            <View style={styles.planRadio}>
              {selectedPlan === 'weekly' && <View style={styles.planRadioSelected} />}
            </View>
            <View style={styles.planContent}>
              <Text style={styles.planName}>Weekly</Text>
            </View>
            <View style={styles.planPricing}>
              <Text style={styles.planPrice}>{formatPrice('weekly', '$2.99/week')}</Text>
              <Text style={styles.planSubtext}>10 images per week</Text>
            </View>
          </TouchableOpacity>

          {/* Monthly Plan */}
          <TouchableOpacity
            style={[
              styles.planCard,
              selectedPlan === 'monthly' && styles.selectedPlan,
            ]}
            onPress={() => setSelectedPlan('monthly')}
          >
            <View style={styles.planRadio}>
              {selectedPlan === 'monthly' && <View style={styles.planRadioSelected} />}
            </View>
            <View style={styles.planContent}>
              <Text style={styles.planName}>Monthly</Text>
            </View>
            <View style={styles.planPricing}>
              <Text style={styles.planPrice}>{formatPrice('monthly', '$5.99/month')}</Text>
              <Text style={styles.planSubtext}>75 images per month</Text>
            </View>
          </TouchableOpacity>

          {/* Yearly Plan - Most Popular */}
          <TouchableOpacity
            style={[
              styles.planCard,
              selectedPlan === 'yearly' && styles.selectedPlan,
              styles.popularPlan,
            ]}
            onPress={() => setSelectedPlan('yearly')}
          >
            <View style={styles.planRadio}>
              {selectedPlan === 'yearly' && <View style={styles.planRadioSelected} />}
            </View>
            <View style={styles.planContent}>
              <Text style={styles.planName}>Yearly</Text>
            </View>
            <View style={styles.planPricing}>
              <Text style={styles.planPrice}>{formatPrice('yearly', '$59.99/year')}</Text>
              <Text style={styles.planSubtext}>90 images per month</Text>
            </View>
          </TouchableOpacity>
        </View>
      </Animated.ScrollView>

      {/* Continue Button - Fixed at Bottom */}
      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[styles.continueButton, (!iapReady || loadingProducts || currentPurchaseAttempt) && { opacity: 0.6 }]}
          onPress={handleContinue}
          disabled={!iapReady || loadingProducts || !!currentPurchaseAttempt}
        >
          <LinearGradient
            colors={['#1e40af', '#1e3a8a']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.continueGradient}
          >
            <Text style={styles.continueText}>
              {!iapReady ? 'Connecting...' : loadingProducts ? 'Loading...' : currentPurchaseAttempt ? 'Processing...' : 'Get Started'}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* Discount Modal */}
      {showDiscountModal && (
        <Animated.View
          style={[
            styles.discountModalOverlay,
            {
              opacity: discountModalAnim,
            },
          ]}
        >
          <Animated.View
            style={[
              styles.discountModalContent,
              {
                transform: [
                  {
                    scale: discountModalAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.8, 1],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={styles.discountModalHeader}>
              <Text style={styles.discountModalTitle}>Wait! Special Offer</Text>
            </View>

            <View style={styles.discountModalBody}>
              <View style={styles.discountBadge}>
                <Text style={styles.discountBadgeText}>33% OFF</Text>
              </View>
              
              <Text style={styles.discountModalSubtitle}>
                Try it for just
              </Text>
              
              <View style={styles.discountPriceContainer}>
                <Text style={styles.discountOriginalPrice}>$2.99</Text>
                <Text style={styles.discountPrice}>$1.99</Text>
                <Text style={styles.discountPriceLabel}>/week</Text>
              </View>

              <Text style={styles.discountModalDescription}>
                Get full access to all premium features and start creating stunning thumbnails today!
              </Text>

              <TouchableOpacity
                style={styles.discountButton}
                onPress={handleDiscountPurchase}
                disabled={!!currentPurchaseAttempt}
              >
                <LinearGradient
                  colors={['#22c55e', '#16a34a']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.discountButtonGradient}
                >
                  <Text style={styles.discountButtonText}>
                    {currentPurchaseAttempt ? 'Processing...' : 'Claim Special Offer'}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.discountSkipButton}
                onPress={handleCloseWithoutDiscount}
              >
                <Text style={styles.discountSkipButtonText}>
                  No thanks
                </Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </Animated.View>
      )}

      {/* Debug Panel */}
      {/* {showDebug && (
        <View style={styles.debugPanel}>
          <View style={styles.debugHeader}>
            <Text style={styles.debugTitle}>🔧 IAP Debug Monitor</Text>
            <TouchableOpacity onPress={() => setShowDebug(false)} style={styles.debugCloseButton}>
              <Text style={styles.debugCloseText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.debugContent} showsVerticalScrollIndicator={true}>
            <View style={styles.debugSection}>
              <Text style={styles.debugSectionTitle}>Current Status</Text>
              <View style={styles.debugRow}>
                <View style={[styles.statusIndicator, currentPurchaseAttempt ? styles.statusActive : styles.statusInactive]} />
                <Text style={styles.debugText}>{debugInfo.listenerStatus || 'Idle'}</Text>
              </View>
            </View>

            <View style={styles.debugSection}>
              <Text style={styles.debugSectionTitle}>Connection</Text>
              <Text style={styles.debugText}>
                IAP Available: {isIAPAvailable ? '✅' : '❌'}
              </Text>
              <Text style={styles.debugText}>
                Connected: {debugInfo.connectionStatus?.isConnected ? '✅' : '❌'}
              </Text>
              <Text style={styles.debugText}>
                Listener Active: {debugInfo.connectionStatus?.hasListener ? '✅' : '❌'}
              </Text>
              <Text style={styles.debugText}>
                IAP Ready: {iapReady ? '✅' : '❌'}
              </Text>
            </View>

            <View style={styles.debugSection}>
              <Text style={styles.debugSectionTitle}>Purchase State</Text>
              <Text style={styles.debugText}>
                Current Attempt: {currentPurchaseAttempt || 'None'}
              </Text>
              <Text style={styles.debugText}>
                Selected Plan: {selectedPlan}
              </Text>
              <Text style={styles.debugText}>
                Products Loaded: {products.length}
              </Text>
            </View>

            {debugInfo.lastPurchaseResult && (
              <View style={styles.debugSection}>
                <Text style={styles.debugSectionTitle}>Last Purchase Result</Text>
                <Text style={[styles.debugText, styles.debugCode]}>
                  {JSON.stringify(debugInfo.lastPurchaseResult, null, 2)}
                </Text>
              </View>
            )}

            <View style={styles.debugSection}>
              <Text style={styles.debugTextSmall}>
                Last Update: {new Date(debugInfo.timestamp).toLocaleTimeString()}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.debugButton}
              onPress={() => {
                const status = IAPService.getConnectionStatus();
                const lastResult = IAPService.getLastPurchaseResult();
                setDebugInfo((prev: any) => ({
                  ...prev,
                  connectionStatus: status,
                  lastPurchaseResult: lastResult,
                  timestamp: new Date().toISOString(),
                  manualCheck: true
                }));
              }}
            >
              <Text style={styles.debugButtonText}>🔄 Refresh Debug Info</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      )} */}

      {/* Show Debug Button when panel is hidden */}
      {/* {!showDebug && (
        <TouchableOpacity
          style={styles.showDebugButton}
          onPress={() => setShowDebug(true)}
        >
          <Text style={styles.showDebugText}>🔧</Text>
        </TouchableOpacity>
      )} */}
    </LinearGradient>
  );
}

const TEXT = '#ffffff';
const MUTED = '#a0a8b8';

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  closeButton: {
    position: 'absolute',
    top: 50,
    left: 20,
    zIndex: 10,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 20,
  },
  closeText: {
    fontSize: 24,
    color: TEXT,
    fontWeight: '300',
  },
  alreadyPurchased: {
    position: 'absolute',
    top: 60,
    alignSelf: 'center',
    zIndex: 10,
  },
  alreadyPurchasedText: {
    fontSize: 13,
    color: MUTED,
  },
  scrollContainer: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 120,
    paddingBottom: 20,
    justifyContent: 'center',
  },
  buttonContainer: {
    paddingHorizontal: 24,
    paddingBottom: 40,
    paddingTop: 10,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 30,
  },
  logoGlow: {
    shadowColor: '#1e40af',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 30,
    elevation: 10,
  },
  logo: {
    width: 100,
    height: 100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoImage: {
    width: 100,
    height: 100,
  },
  header: {
    marginBottom: 40,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: TEXT,
    marginBottom: 16,
    textAlign: 'center',
    lineHeight: 36,
  },
  subtitle: {
    fontSize: 15,
    color: MUTED,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 10,
  },
  plansContainer: {
    gap: 16,
    marginBottom: 16,
  },
  trialInfo: {
    fontSize: 13,
    color: MUTED,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 18,
  },
  planCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 20,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
  },
  selectedPlan: {
    borderColor: '#1e40af',
    backgroundColor: 'rgba(30, 64, 175, 0.1)',
    ...Platform.select({
      ios: {
        shadowColor: '#1e40af',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.4,
        shadowRadius: 15,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  popularPlan: {
    // Additional styling for popular plan
  },
  planRadio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: MUTED,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  planRadioSelected: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#1e40af',
  },
  planContent: {
    flex: 1,
  },
  planName: {
    fontSize: 18,
    fontWeight: '600',
    color: TEXT,
  },
  planPricing: {
    alignItems: 'flex-end',
  },
  planPrice: {
    fontSize: 14,
    fontWeight: '500',
    color: MUTED,
  },
  planSubtext: {
    fontSize: 12,
    color: MUTED,
    opacity: 0.7,
    marginTop: 2,
  },
  continueButton: {
    borderRadius: 30,
    overflow: 'hidden',
    shadowColor: '#1e40af',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
    elevation: 10,
  },
  continueGradient: {
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
    letterSpacing: 0.5,
  },
  // Debug Panel Styles
  debugPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '40%',
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderRightWidth: 2,
    borderColor: '#1e40af',
    shadowColor: '#1e40af',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 20,
  },
  debugHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#1e40af',
  },
  debugTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1e40af',
  },
  debugCloseButton: {
    width: 30,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(30, 64, 175, 0.2)',
    borderRadius: 15,
  },
  debugCloseText: {
    fontSize: 18,
    color: '#1e40af',
  },
  debugContent: {
    flex: 1,
    padding: 15,
  },
  debugSection: {
    marginBottom: 15,
    padding: 10,
    backgroundColor: 'rgba(30, 64, 175, 0.1)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(30, 64, 175, 0.3)',
  },
  debugSectionTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#60a5fa',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  debugRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  statusIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  statusActive: {
    backgroundColor: '#22c55e',
    shadowColor: '#22c55e',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  statusInactive: {
    backgroundColor: '#6b7280',
  },
  debugText: {
    fontSize: 12,
    color: '#e5e7eb',
    marginVertical: 3,
    fontFamily: 'monospace',
  },
  debugTextSmall: {
    fontSize: 10,
    color: '#9ca3af',
    fontStyle: 'italic',
  },
  debugCode: {
    fontSize: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    padding: 8,
    borderRadius: 4,
    color: '#10b981',
  },
  debugButton: {
    backgroundColor: '#1e40af',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 20,
  },
  debugButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  showDebugButton: {
    position: 'absolute',
    bottom: 120,
    right: 20,
    width: 50,
    height: 50,
    backgroundColor: '#1e40af',
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#1e40af',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 10,
  },
  showDebugText: {
    fontSize: 24,
  },
  // Discount Modal Styles
  discountModalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  discountModalContent: {
    width: '85%',
    maxWidth: 400,
    backgroundColor: '#0d1120',
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#1e40af',
    shadowColor: '#1e40af',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.8,
    shadowRadius: 20,
    elevation: 20,
    overflow: 'hidden',
  },
  discountModalHeader: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
  },
  discountModalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: TEXT,
    textAlign: 'center',
  },
  discountModalClose: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 16,
  },
  discountModalCloseText: {
    fontSize: 18,
    color: MUTED,
  },
  discountModalBody: {
    padding: 20,
    paddingTop: 10,
    alignItems: 'center',
  },
  discountBadge: {
    backgroundColor: '#22c55e',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 15,
    shadowColor: '#22c55e',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 5,
  },
  discountBadgeText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ffffff',
    letterSpacing: 1,
  },
  discountModalSubtitle: {
    fontSize: 16,
    color: MUTED,
    marginBottom: 10,
  },
  discountPriceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 8,
  },
  discountOriginalPrice: {
    fontSize: 24,
    fontWeight: 'bold',
    color: MUTED,
    textDecorationLine: 'line-through',
    opacity: 0.6,
  },
  discountPrice: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#22c55e',
  },
  discountPriceLabel: {
    fontSize: 18,
    color: MUTED,
    marginTop: 20,
  },
  discountModalDescription: {
    fontSize: 14,
    color: MUTED,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  discountButton: {
    width: '100%',
    borderRadius: 30,
    overflow: 'hidden',
    shadowColor: '#22c55e',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
    elevation: 10,
    marginBottom: 12,
  },
  discountButtonGradient: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  discountButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
    letterSpacing: 0.5,
  },
  discountSkipButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  discountSkipButtonText: {
    fontSize: 14,
    color: MUTED,
    opacity: 0.7,
  },
});
