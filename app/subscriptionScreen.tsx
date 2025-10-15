import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Animated, Alert, Image } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { useState, useEffect, useRef, useCallback } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import IAPService from '../services/IAPService';

const PRODUCT_IDS = {
  yearly: 'thumbnail.pro.yearly',
  monthly: 'thumbnail.pro.monthly',
  weekly: 'thumbnail.pro.weekly',
};

export default function SubscriptionScreen() {
  const router = useRouter();
  const [selectedPlan, setSelectedPlan] = useState<'yearly' | 'monthly' | 'weekly'>('yearly');
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [products, setProducts] = useState<any[]>([]);
  const [iapReady, setIapReady] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [currentPurchaseAttempt, setCurrentPurchaseAttempt] = useState<'monthly' | 'yearly' | 'weekly' | null>(null);
  const hasProcessedOrphansRef = useRef<boolean>(false);

  // Check if IAP is available
  const isIAPAvailable = IAPService.isAvailable();

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();

    initializeIAP();
  }, []);

  const initializeIAP = async () => {
    if (!isIAPAvailable) {
      console.log('[SUBSCRIPTION] IAP not available on this platform');
      return;
    }

    try {
      const initialized = await IAPService.initialize();
      setIapReady(initialized);

      if (initialized) {
        // Set up debug callback
        IAPService.setDebugCallback((info) => {
          console.log('[SUBSCRIPTION] IAP Debug:', info);
          // Update loading state based on listener status
          if (info.listenerStatus?.includes('CANCELLED') || info.listenerStatus?.includes('FAILED') || info.listenerStatus?.includes('TIMEOUT')) {
            setCurrentPurchaseAttempt(null);
          }
        });

        // Check for orphaned transactions on startup
        if (!hasProcessedOrphansRef.current) {
          hasProcessedOrphansRef.current = true;
          await IAPService.checkForOrphanedTransactions();
        }

        // Fetch products
        await fetchProducts();
      }
    } catch (error) {
      console.error('[SUBSCRIPTION] Error initializing IAP:', error);
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
    if (!isIAPAvailable) {
      Alert.alert('Purchases unavailable', 'In-app purchases are not available on this device.');
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
    await handlePurchase(product.productId);
  };

  const handlePurchase = async (productId: string) => {
    if (!isIAPAvailable) {
      Alert.alert('Purchases unavailable', 'In-app purchases are not available on this device.');
      setCurrentPurchaseAttempt(null);
      return;
    }

    try {
      console.log('[SUBSCRIPTION] Attempting to purchase:', productId);
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
    if (!isIAPAvailable) {
      Alert.alert('Restore Failed', 'In-app purchases are not available on this device.');
      return;
    }

    try {
      console.log('[SUBSCRIPTION] Attempting to restore purchases...');
      const results = await IAPService.restorePurchases();
      if (results.length > 0) {
        Alert.alert('Success', 'Your purchases have been restored!', [
          { text: 'Continue', onPress: () => router.replace('/(tabs)/generate') }
        ]);
      }
    } catch (err: any) {
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
    router.replace('/(tabs)/generate');
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
          <Text style={styles.title}>Turn Thumbnails Into Paychecks.</Text>
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
              <Text style={styles.planSubtext}>30 images per month</Text>
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
              <Text style={styles.planPrice}>{formatPrice('monthly', '$1.50/week')}</Text>
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
              <Text style={styles.planPrice}>{formatPrice('yearly', '$1.15/week')}</Text>
              <Text style={styles.planSubtext}>90 images per month</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Trial Info */}
        <Text style={styles.trialInfo}>
          {selectedPlan === 'yearly' && 'Billed yearly at $59.99.\nCancel anytime'}
          {selectedPlan === 'monthly' && 'Billed monthly at $5.99.\nCancel anytime'}
          {selectedPlan === 'weekly' && 'Billed weekly at $2.99.\nCancel anytime'}
        </Text>
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
              {!iapReady ? 'Connecting...' : loadingProducts ? 'Loading...' : currentPurchaseAttempt ? 'Processing...' : 'Continue'}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
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
    shadowColor: '#1e40af',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 15,
    elevation: 8,
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
});
