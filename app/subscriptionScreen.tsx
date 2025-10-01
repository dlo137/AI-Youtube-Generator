import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Animated, Alert } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { useState, useEffect, useRef } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
// Temporarily commenting out IAP to test if it causes crashes
// import * as InAppPurchases from 'expo-in-app-purchases';

const PRODUCT_IDS = {
  yearly: 'thumbnail.pro.yearly',
  monthly: 'thumbnail.pro.monthly',
  weekly: 'thumbnail.pro.weekly',
};

export default function SubscriptionScreen() {
  const router = useRouter();
  const [selectedPlan, setSelectedPlan] = useState('yearly');
  const fadeAnim = useRef(new Animated.Value(0)).current;
  // const [products, setProducts] = useState<InAppPurchases.IAPItemDetails[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();

    // initializeIAP();
  }, []);

  // const initializeIAP = async () => {
  //   try {
  //     await InAppPurchases.connectAsync();
  //     const { results } = await InAppPurchases.getProductsAsync(Object.values(PRODUCT_IDS));
  //     setProducts(results);

  //     // Set up purchase listener
  //     InAppPurchases.setPurchaseListener(({ responseCode, results, errorCode }) => {
  //       if (responseCode === InAppPurchases.IAPResponseCode.OK) {
  //         results?.forEach((purchase) => {
  //           if (!purchase.acknowledged) {
  //             console.log('Purchase successful:', purchase);
  //             InAppPurchases.finishTransactionAsync(purchase, true);
  //             router.replace('/(tabs)/generate');
  //           }
  //         });
  //       } else if (responseCode === InAppPurchases.IAPResponseCode.USER_CANCELED) {
  //         console.log('User canceled purchase');
  //       } else {
  //         console.log('Purchase error:', errorCode);
  //         Alert.alert('Error', 'Failed to complete purchase');
  //       }
  //       setLoading(false);
  //     });
  //   } catch (error) {
  //     console.error('Error initializing IAP:', error);
  //     // Don't show alert, just log it - IAP might not be available in all environments
  //   }
  // };

  const handleSubscribe = async (plan: string) => {
    // Temporary: Skip IAP for testing
    console.log(`Selected plan: ${plan}`);
    router.replace('/(tabs)/generate');
  };

  const handleRestore = async () => {
    // Temporary: Skip restore for testing
    Alert.alert('Restore', 'Restore functionality temporarily disabled for testing');
  };

  const handleContinue = () => {
    handleSubscribe(selectedPlan);
  };

  const handleSkip = () => {
    router.replace('/(tabs)/generate');
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

      {/* Decorative Shapes */}
      <View style={[styles.shape, styles.triangle, { top: 100, left: 30 }]} />
      <View style={[styles.shape, styles.square, { top: 200, right: 40 }]} />
      <View style={[styles.shape, styles.triangle, { bottom: 150, left: 50 }]} />
      <View style={[styles.shape, styles.square, { top: 400, left: 20 }]} />

      <Animated.ScrollView
        contentContainerStyle={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
        style={{ opacity: fadeAnim }}
      >
        {/* Logo/Icon with Glow */}
        <View style={styles.logoContainer}>
          <View style={styles.logoGlow}>
            <View style={styles.logo}>
              <Text style={styles.logoText}>📸</Text>
            </View>
          </View>
        </View>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Get access to ThumbnailPro with no limits!</Text>
          <Text style={styles.subtitle}>
            Achieve your goals and build lasting habits with our ultimate suite for a healthier routine.
          </Text>
        </View>

        {/* Plans */}
        <View style={styles.plansContainer}>
          {/* Yearly Plan - Most Popular */}
          <TouchableOpacity
            style={[
              styles.planCard,
              selectedPlan === 'yearly' && styles.selectedPlan,
              styles.popularPlan,
            ]}
            onPress={() => setSelectedPlan('yearly')}
          >
            {selectedPlan === 'yearly' && (
              <View style={styles.popularBadge}>
                <Text style={styles.popularText}>3 DAY FREE TRIAL</Text>
              </View>
            )}
            <View style={styles.planRadio}>
              {selectedPlan === 'yearly' && <View style={styles.planRadioSelected} />}
            </View>
            <View style={styles.planContent}>
              <Text style={styles.planName}>Yearly</Text>
            </View>
            <Text style={styles.planPrice}>$0.38/week</Text>
          </TouchableOpacity>

          {/* Monthly Plan */}
          <TouchableOpacity
            style={[
              styles.planCard,
              selectedPlan === 'monthly' && styles.selectedPlan,
              styles.popularPlan,
            ]}
            onPress={() => setSelectedPlan('monthly')}
          >
            {selectedPlan === 'monthly' && (
              <View style={styles.popularBadge}>
                <Text style={styles.popularText}>3 DAY FREE TRIAL</Text>
              </View>
            )}
            <View style={styles.planRadio}>
              {selectedPlan === 'monthly' && <View style={styles.planRadioSelected} />}
            </View>
            <View style={styles.planContent}>
              <Text style={styles.planName}>Monthly</Text>
            </View>
            <Text style={styles.planPrice}>$1.50/week</Text>
          </TouchableOpacity>

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
            <Text style={styles.planPrice}>$2.99/week</Text>
          </TouchableOpacity>
        </View>

        {/* Trial Info */}
        <Text style={styles.trialInfo}>
          {selectedPlan === 'yearly' && 'Free for 3 days, then $19.99 / year.\nNo payment now'}
          {selectedPlan === 'monthly' && 'Free for 3 days, then $5.99 / month.\nNo payment now'}
          {selectedPlan === 'weekly' && 'Billed weekly at $2.99.\nCancel anytime'}
        </Text>

        {/* Continue Button */}
        <TouchableOpacity
          style={styles.continueButton}
          onPress={handleContinue}
          disabled={loading}
        >
          <LinearGradient
            colors={['#5b6ef5', '#3b4fd9']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.continueGradient}
          >
            <Text style={styles.continueText}>
              {loading ? 'Processing...' : 'Continue'}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </Animated.ScrollView>
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
  shape: {
    position: 'absolute',
    opacity: 0.15,
  },
  triangle: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 15,
    borderRightWidth: 15,
    borderBottomWidth: 25,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#5b6ef5',
  },
  square: {
    width: 20,
    height: 20,
    backgroundColor: '#3b4fd9',
    transform: [{ rotate: '45deg' }],
  },
  scrollContainer: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 120,
    paddingBottom: 40,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 30,
  },
  logoGlow: {
    shadowColor: '#5b6ef5',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 30,
    elevation: 10,
  },
  logo: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(91, 110, 245, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(91, 110, 245, 0.3)',
  },
  logoText: {
    fontSize: 50,
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
    borderColor: '#5b6ef5',
    backgroundColor: 'rgba(91, 110, 245, 0.1)',
    shadowColor: '#5b6ef5',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 15,
    elevation: 8,
  },
  popularPlan: {
    // Additional styling for popular plan
  },
  popularBadge: {
    position: 'absolute',
    top: -10,
    alignSelf: 'center',
    backgroundColor: '#5b6ef5',
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: 10,
    shadowColor: '#5b6ef5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 5,
  },
  popularText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1,
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
    backgroundColor: '#5b6ef5',
  },
  planContent: {
    flex: 1,
  },
  planName: {
    fontSize: 18,
    fontWeight: '600',
    color: TEXT,
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
    marginBottom: 20,
    borderRadius: 30,
    overflow: 'hidden',
    shadowColor: '#5b6ef5',
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
  otherPlans: {
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 24,
  },
  otherPlansText: {
    fontSize: 15,
    color: MUTED,
    textDecorationLine: 'underline',
  },
  disclaimer: {
    fontSize: 11,
    color: MUTED,
    textAlign: 'center',
    lineHeight: 16,
    opacity: 0.7,
  },
});