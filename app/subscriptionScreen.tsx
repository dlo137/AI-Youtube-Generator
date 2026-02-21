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
  const [selectedPlan, setSelectedPlan] = useState<'yearly' | 'monthly' | 'weekly'>('yearly');
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const discountModalAnim = useRef(new Animated.Value(0)).current;
  const [products, setProducts] = useState<any[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [iapReady, setIapReady] = useState(false);
  const [currentPurchaseAttempt, setCurrentPurchaseAttempt] = useState<'monthly' | 'yearly' | 'weekly' | null>(null);
  // ...existing code...
  // Restore ref
  const isRestoringRef = useRef(false);

  // Fade in on mount
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();
  }, []);

  // Fetch products on mount
  useEffect(() => {
    const fetchProducts = async () => {
      // In Expo Go, IAP native module is unavailable. Enable the buttons in DEV
      // so the simulated purchase flow can be tested without a real build.
      if (!IAPService.isAvailable()) {
        if (__DEV__) {
          setIapReady(true);
          setIsIAPAvailable(false);
          setProductFetchStatus({
            attempted: true,
            success: true,
            error: '',
            foundProducts: [],
            missingProducts: Object.values(PRODUCT_IDS),
          });
        }
        return;
      }

      setLoadingProducts(true);
      setProductFetchStatus(prev => ({ ...prev, attempted: true, error: '', foundProducts: [], missingProducts: [] }));
      try {
        const results = await IAPService.getProducts();
        setProducts(results);
        setIapReady(true);
        setIsIAPAvailable(true);
        const found = results.map(p => p.id);
        const expected = Object.values(PRODUCT_IDS);
        setProductFetchStatus({
          attempted: true,
          success: true,
          error: '',
          foundProducts: found,
          missingProducts: expected.filter(id => !found.includes(id)),
        });
      } catch (err: any) {
        setProducts([]);
        setIapReady(false);
        setIsIAPAvailable(false);
        setProductFetchStatus(prev => ({ ...prev, success: false, error: String(err), foundProducts: [], missingProducts: Object.values(PRODUCT_IDS) }));
      } finally {
        setLoadingProducts(false);
      }
    };
    fetchProducts();
  }, []);

  // ── Expo Go simulation ──────────────────────────────────────────────────────
  // In a real build (EAS / bare workflow) this is never called — IAPService.isAvailable()
  // returns true and the normal purchase flow runs instead.
  const simulatePurchase = async (plan: 'yearly' | 'monthly' | 'weekly' | 'discountedWeekly') => {
    const planKey = plan === 'discountedWeekly' ? 'discounted_weekly' : plan;
    const credits_max = plan === 'yearly' ? 90 : plan === 'monthly' ? 75 : 10;

    setCurrentPurchaseAttempt(plan === 'discountedWeekly' ? 'weekly' : plan);
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('User not authenticated');

      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          subscription_plan: planKey,
          is_pro_version: true,
          subscription_id: `dev_${planKey}_${Date.now()}`,
          purchase_time: new Date().toISOString(),
          credits_current: credits_max,
          credits_max,
          last_credit_reset: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (updateError) throw updateError;

      trackEvent('subscription_completed', { plan: planKey, platform: Platform.OS, test_mode: true });
      console.log(`[SUBSCRIPTION] ✅ Expo Go: Simulated ${planKey} purchase`);
      setCurrentPurchaseAttempt(null);
      router.replace('/(tabs)/generate');
    } catch (error) {
      console.error('[SUBSCRIPTION] Simulation error:', error);
      setCurrentPurchaseAttempt(null);
      Alert.alert('Simulation Error', 'Could not simulate subscription. Are you logged in?');
    }
  };

  const handleContinue = async () => {
    // Expo Go: the IAP JS module loads (so isAvailable() = true) but the Nitro
    // native layer is absent, so initConnection() throws and products stays empty.
    // Detect this by checking products, not isAvailable().
    if (__DEV__ && products.length === 0) {
      await simulatePurchase(selectedPlan);
      return;
    }

    if (!IAPService.isAvailable()) {
      Alert.alert('Purchases Unavailable', 'In-app purchases are not supported on this device.');
      return;
    }

    const planId = PRODUCT_IDS[selectedPlan];
    const product = products.find(p => p.id === planId);
    if (!product) {
      Alert.alert('Plan not available', 'We couldn\'t find that plan. Please check your internet connection and try again.');
      return;
    }
    setCurrentPurchaseAttempt(selectedPlan);
    try {
      await IAPService.purchaseProduct(product.id);
      setCurrentPurchaseAttempt(null);
      router.replace('/(tabs)/generate');
    } catch (error: any) {
      setCurrentPurchaseAttempt(null);
      const msg = String(error?.message || error);
      if (!msg.includes('cancel') && !msg.includes('Cancel')) {
        Alert.alert('Purchase Failed', msg || 'Unable to complete purchase. Please try again.');
      }
    }
  };

  const handleRestore = async () => {
    // Prevent multiple alerts by using a flag
    if (isRestoringRef.current) return;
    isRestoringRef.current = true;

    // Use direct service check to avoid stale state
    if (!IAPService.isAvailable()) {
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

  // Helper function to format price
  // TODO: In the future, use real App Store prices from `products` state
  // For now, returns fallback to maintain consistent "/week" format
  // (Apple's IAP prices don't include the duration suffix)
  const formatPrice = (_plan: string, fallbackPrice: string) => {
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
      
      // Check if this is a returning user (has existing subscription) or new onboarding
      // Only sign out for new users going through onboarding
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('subscription_plan, is_pro_version')
            .eq('id', user.id)
            .single();
          
          // If user has an existing subscription, just navigate back without signing out
          if (profile?.subscription_plan || profile?.is_pro_version) {
            console.log('[SUBSCRIPTION] Returning user dismissed subscription screen - not signing out');
            router.back();
            return;
          }
        }
      } catch (err) {
        console.log('[SUBSCRIPTION] Error checking user subscription status:', err);
      }
      
      // Sign out only for new users during onboarding flow
      await supabase.auth.signOut();
      router.replace('/');
    });
  };

  const handleDiscountPurchase = async () => {
    if (__DEV__ && products.length === 0) {
      await simulatePurchase('discountedWeekly');
      return;
    }

    if (!IAPService.isAvailable()) {
      Alert.alert('Purchases unavailable', 'In-app purchases are not available on this device.');
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
      setCurrentPurchaseAttempt(null);
      router.replace('/(tabs)/generate');
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
        <Text style={styles.cancelAnytimeText}>Cancel Anytime. No Commitment.</Text>
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

      {/* ...existing code... */}
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
  cancelAnytimeText: {
    fontSize: 12,
    color: MUTED,
    textAlign: 'center',
    marginTop: 12,
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
    opacity: 0.7
  },
});
