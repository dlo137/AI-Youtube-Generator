import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Animated, Alert, Image } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { useState, useEffect, useRef } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { saveSubscriptionInfo } from '../src/utils/subscriptionStorage';
import Svg, { Path } from 'react-native-svg';

// Conditionally import InAppPurchases to handle Expo Go limitation
let InAppPurchases: any = null;
try {
  InAppPurchases = require('expo-in-app-purchases');
} catch (error) {
  console.log('InAppPurchases not available in Expo Go - using mock for development');
}

const PRODUCT_IDS = {
  yearly: 'thumbnail.pro.yearly',
  monthly: 'thumbnail.pro.monthly',
  weekly: 'thumbnail.pro.weekly',
};

export default function SubscriptionScreen() {
  const router = useRouter();
  const [selectedPlan, setSelectedPlan] = useState('yearly');
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();

    initializeIAP();
  }, []);

  const initializeIAP = async () => {
    try {
      // Check if InAppPurchases is available (not in Expo Go)
      if (!InAppPurchases) {
        console.log('InAppPurchases not available - running in development mode');
        return;
      }

      // Connect to the in-app purchase service
      await InAppPurchases.connectAsync();
      
      // Get product information
      const { results } = await InAppPurchases.getProductsAsync(Object.values(PRODUCT_IDS));
      setProducts(results || []);
      console.log('Available products:', results);

      // Set up purchase listener
      InAppPurchases.setPurchaseListener(async ({ responseCode, results, errorCode }: any) => {
        console.log('Purchase response:', { responseCode, results, errorCode });

        if (responseCode === InAppPurchases.IAPResponseCode.OK) {
          if (results && results.length > 0) {
            for (const purchase of results) {
              if (!purchase.acknowledged) {
                console.log('Purchase successful:', purchase);

                // Save subscription info
                try {
                  await saveSubscriptionInfo({
                    isActive: true,
                    productId: purchase.productId,
                    purchaseDate: new Date().toISOString(),
                    // For subscriptions, you'd calculate expiry based on product type
                  });
                } catch (error) {
                  console.error('Error saving subscription info:', error);
                }

                // Acknowledge the purchase
                await InAppPurchases.finishTransactionAsync(purchase, true);

                // Set loading to false before navigation
                setLoading(false);

                // Navigate immediately without alert
                router.replace('/(tabs)/generate');
                return;
              }
            }
          }
        } else if (responseCode === InAppPurchases.IAPResponseCode.USER_CANCELED) {
          console.log('User canceled purchase');
          setLoading(false);
        } else {
          console.log('Purchase error:', errorCode);
          setLoading(false);
          Alert.alert('Error', 'Failed to complete purchase. Please try again.');
        }
      });
    } catch (error) {
      console.error('Error initializing IAP:', error);
      // For development/testing, don't show error to user
      // In production, you might want to handle this differently
    }
  };

  const handleSubscribe = async (plan: string) => {
    if (loading) return;
    
    // Handle development mode (Expo Go)
    if (!InAppPurchases) {
      Alert.alert(
        'Development Mode', 
        'In-app purchases are not available in Expo Go. This will work in a development build or production.',
        [
          { text: 'Continue Anyway', onPress: () => router.replace('/(tabs)/generate') },
          { text: 'Cancel', style: 'cancel' }
        ]
      );
      return;
    }
    
    setLoading(true);
    try {
      const productId = PRODUCT_IDS[plan as keyof typeof PRODUCT_IDS];
      console.log('Attempting to purchase:', productId);
      
      // Request the purchase
      await InAppPurchases.purchaseItemAsync(productId);
      // The purchase listener will handle the response
    } catch (error) {
      console.error('Error requesting purchase:', error);
      Alert.alert('Error', 'Failed to start purchase. Please try again.');
      setLoading(false);
    }
  };

  const handleRestore = async () => {
    // Handle development mode (Expo Go)
    if (!InAppPurchases) {
      Alert.alert('Development Mode', 'Restore purchases not available in Expo Go.');
      return;
    }

    try {
      setLoading(true);
      console.log('Attempting to restore purchases...');
      
      // Get purchase history
      const { results } = await InAppPurchases.getPurchaseHistoryAsync();
      console.log('Purchase history:', results);
      
      if (results && results.length > 0) {
        // Check if any purchases are still valid
        const validPurchase = results.find((purchase: any) => 
          Object.values(PRODUCT_IDS).includes(purchase.productId)
        );
        
        if (validPurchase) {
          // Save restored subscription info
          try {
            await saveSubscriptionInfo({
              isActive: true,
              productId: validPurchase.productId,
              purchaseDate: validPurchase.purchaseTime?.toString() || new Date().toISOString(),
            });
          } catch (error) {
            console.error('Error saving restored subscription info:', error);
          }
          
          Alert.alert('Success!', 'Your purchases have been restored!', [
            { text: 'OK', onPress: () => router.replace('/(tabs)/generate') }
          ]);
        } else {
          Alert.alert('No Purchases', 'No previous purchases found to restore.');
        }
      } else {
        Alert.alert('No Purchases', 'No previous purchases found to restore.');
      }
    } catch (error) {
      console.error('Error restoring purchases:', error);
      Alert.alert('Error', 'Failed to restore purchases. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Helper function to get product info
  const getProductInfo = (productId: string) => {
    const product = products.find(p => p.productId === productId);
    return product;
  };

  // Helper function to format price
  const formatPrice = (plan: string, fallbackPrice: string) => {
    const productId = PRODUCT_IDS[plan as keyof typeof PRODUCT_IDS];
    const product = getProductInfo(productId);
    return product?.price || fallbackPrice;
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
            <Text style={styles.planPrice}>{formatPrice('yearly', '$0.96/week')}</Text>
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
            <Text style={styles.planPrice}>{formatPrice('monthly', '$1.50/week')}</Text>
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
            <Text style={styles.planPrice}>{formatPrice('weekly', '$2.99/week')}</Text>
          </TouchableOpacity>
        </View>

        {/* Trial Info */}
        <Text style={styles.trialInfo}>
          {selectedPlan === 'yearly' && 'Free for 3 days, then $49.99 / year.\nNo payment now'}
          {selectedPlan === 'monthly' && 'Billed monthly at $5.99.\nCancel anytime'}
          {selectedPlan === 'weekly' && 'Billed weekly at $2.99.\nCancel anytime'}
        </Text>
      </Animated.ScrollView>

      {/* Continue Button - Fixed at Bottom */}
      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={styles.continueButton}
          onPress={handleContinue}
          disabled={loading}
        >
          <LinearGradient
            colors={['#1e40af', '#1e3a8a']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.continueGradient}
          >
            <Text style={styles.continueText}>
              {loading ? 'Processing...' : 'Continue'}
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
    borderBottomColor: '#1e40af',
  },
  square: {
    width: 20,
    height: 20,
    backgroundColor: '#1e3a8a',
    transform: [{ rotate: '45deg' }],
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
  popularBadge: {
    position: 'absolute',
    top: -10,
    alignSelf: 'center',
    backgroundColor: '#1e40af',
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: 10,
    shadowColor: '#1e40af',
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