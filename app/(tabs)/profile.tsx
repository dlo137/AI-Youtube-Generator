import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, Linking, Platform, Modal, TouchableWithoutFeedback, Keyboard, Animated, Image } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useState, useEffect, useRef } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { getCurrentUser, getMyProfile, updateMyProfile, signOut } from '../../src/features/auth/api';
import { useModal } from '../../src/contexts/ModalContext';
import { supabase } from '../../lib/supabase';
import { LinearGradient } from 'expo-linear-gradient';
import { getSubscriptionInfo, SubscriptionInfo } from '../../src/utils/subscriptionStorage';

export default function ProfileScreen() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    full_name: ''
  });
  const [subscriptionInfo, setSubscriptionInfo] = useState<SubscriptionInfo | null>(null);
  const [currentPlan, setCurrentPlan] = useState('Free');
  const {
    isAboutModalVisible,
    setIsAboutModalVisible,
    isContactModalVisible,
    setIsContactModalVisible,
    isBillingModalVisible,
    setIsBillingModalVisible,
    isBillingManagementModalVisible,
    setIsBillingManagementModalVisible,
  } = useModal();
  const [selectedPlan, setSelectedPlan] = useState('yearly');
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [contactForm, setContactForm] = useState({
    name: '',
    email: '',
    subject: '',
    message: ''
  });
  const router = useRouter();

  const settings = [
    { id: 'about', title: 'About', subtitle: 'App information' },
    { id: 'help', title: 'Help & Support', subtitle: 'Get assistance' },
    { id: 'upgrade', title: 'Upgrade Your Plan', subtitle: 'Choose a subscription plan' },
    { id: 'billing', title: 'Billing & Subscription', subtitle: 'Manage your current subscription' },
  ];

  const subscriptionPlans = [
    {
      id: 'yearly',
      name: 'Yearly',
      price: '$0.38/week',
      description: 'Free for 3 days, then $19.99 / year.\nNo payment now',
      hasTrial: true
    },
    {
      id: 'monthly',
      name: 'Monthly',
      price: '$1.50/week',
      description: 'Billed monthly at $5.99.\nCancel anytime'
    },
    {
      id: 'weekly',
      name: 'Weekly',
      price: '$2.99/week',
      description: 'Billed weekly at $2.99.\nCancel anytime'
    }
  ];

  // Get credits based on subscription plan
  const getCreditsDisplay = () => {
    if (!subscriptionInfo || !subscriptionInfo.isActive) {
      return { current: 10, max: 10 }; // Free plan: 10/10 credits for life
    }

    if (subscriptionInfo.productId === 'thumbnail.pro.yearly') {
      return { current: 300, max: 300 }; // Yearly: 300 credits
    } else if (subscriptionInfo.productId === 'thumbnail.pro.monthly') {
      return { current: 200, max: 200 }; // Monthly: 200 credits
    } else if (subscriptionInfo.productId === 'thumbnail.pro.weekly') {
      return { current: 100, max: 100 }; // Weekly: 100 credits
    }

    return { current: 10, max: 10 }; // Default to free
  };

  // Get current subscription data from state
  const getCurrentSubscriptionDisplay = () => {
    if (!subscriptionInfo || !subscriptionInfo.isActive) {
      return {
        plan: 'Free Plan',
        price: '$0.00',
        renewalDate: null,
        status: 'free'
      };
    }

    let price = '';
    let planName = currentPlan;

    if (subscriptionInfo.productId === 'thumbnail.pro.yearly') {
      price = '$19.99/year';
    } else if (subscriptionInfo.productId === 'thumbnail.pro.monthly') {
      price = '$5.99/month';
    } else if (subscriptionInfo.productId === 'thumbnail.pro.weekly') {
      price = '$2.99/week';
    }

    return {
      plan: planName,
      price: price,
      renewalDate: subscriptionInfo.expiryDate || subscriptionInfo.purchaseDate,
      status: 'active'
    };
  };

  useEffect(() => {
    loadUserData();
  }, []);

  // Refresh data when screen is focused (important for guest mode)
  useFocusEffect(
    useCallback(() => {
      loadUserData();
    }, [])
  );

  const loadUserData = async () => {
    try {
      // Check if we're in guest mode first
      if (global?.isGuestMode) {
        // Set guest data without any API calls
        setUser({
          email: 'Guest',
          isGuest: true
        });
        setProfile({
          full_name: 'Guest User'
        });
        setEditForm({
          full_name: 'Guest User'
        });
        setCurrentPlan('Free');
        setIsLoading(false);
        return;
      }

      const userData = await getCurrentUser();
      if (!userData) {
        router.push('/login');
        return;
      }

      setUser(userData);

      const profileData = await getMyProfile();
      setProfile(profileData);

      if (profileData) {
        setEditForm({
          full_name: profileData.full_name || ''
        });
      }

      // Load subscription info
      const subInfo = await getSubscriptionInfo();
      setSubscriptionInfo(subInfo);

      // Determine current plan based on product ID
      if (subInfo && subInfo.isActive) {
        if (subInfo.productId === 'thumbnail.pro.yearly') {
          setCurrentPlan('Yearly Pro');
        } else if (subInfo.productId === 'thumbnail.pro.monthly') {
          setCurrentPlan('Monthly Pro');
        } else if (subInfo.productId === 'thumbnail.pro.weekly') {
          setCurrentPlan('Weekly Pro');
        } else {
          setCurrentPlan('Pro');
        }
      } else {
        setCurrentPlan('Free');
      }
    } catch (error) {
      console.error('Error loading user data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      if (user?.isGuest) {
        // Clear guest mode
        global.isGuestMode = false;
      } else {
        await signOut();
      }
      router.push('/');
    } catch (error) {
      console.error('Sign out error:', error);
      Alert.alert('Error', 'Failed to sign out');
    }
  };

  const handleSaveProfile = async () => {
    try {
      const updatedProfile = await updateMyProfile(editForm);
      setProfile(updatedProfile);
      setIsEditing(false);
      Alert.alert('Success', 'Profile updated successfully');
    } catch (error) {
      console.error('Profile update error:', error);
      Alert.alert('Error', 'Failed to update profile');
    }
  };

  const handleDeleteAccount = async () => {
    Alert.alert(
      'Delete Account',
      'Are you sure you want to permanently delete your account? This action cannot be undone and all your data will be lost.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Final Confirmation',
              'This will permanently delete your account and all associated data. Type "DELETE" to confirm.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Confirm Delete',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      // Here you would call your delete account API
                      // await deleteAccount();
                      Alert.alert(
                        'Account Deleted',
                        'Your account has been permanently deleted.',
                        [
                          {
                            text: 'OK',
                            onPress: () => {
                              // Clear any local data and redirect to login
                              router.push('/');
                            }
                          }
                        ]
                      );
                    } catch (error) {
                      console.error('Delete account error:', error);
                      Alert.alert('Error', 'Failed to delete account. Please try again or contact support.');
                    }
                  }
                }
              ]
            );
          }
        }
      ]
    );
  };

  const handleRateApp = async () => {
    try {
      // App Store URLs - you'll need to replace with your actual app IDs when published
      const iosAppId = 'YOUR_IOS_APP_ID'; // Replace with actual App Store ID
      const androidPackageName = 'com.yourcompany.thumbnailgenerator'; // Replace with actual package name

      let url = '';

      if (Platform.OS === 'ios') {
        // iOS App Store URL
        url = `itms-apps://itunes.apple.com/app/id${iosAppId}?action=write-review`;
        // Fallback URL if the itms-apps doesn't work
        const fallbackUrl = `https://itunes.apple.com/app/id${iosAppId}?action=write-review`;

        const supported = await Linking.canOpenURL(url);
        if (supported) {
          await Linking.openURL(url);
        } else {
          await Linking.openURL(fallbackUrl);
        }
      } else {
        // Android Play Store URL
        url = `market://details?id=${androidPackageName}`;
        // Fallback URL for web browsers
        const fallbackUrl = `https://play.google.com/store/apps/details?id=${androidPackageName}`;

        const supported = await Linking.canOpenURL(url);
        if (supported) {
          await Linking.openURL(url);
        } else {
          await Linking.openURL(fallbackUrl);
        }
      }
    } catch (error) {
      console.error('Error opening app store:', error);
      Alert.alert(
        'Rate the App',
        'Thank you for wanting to rate our app! Please visit the app store manually to leave a review.',
        [{ text: 'OK' }]
      );
    }
  };

  const handleContactSubmit = async () => {
    // Validate form
    if (!contactForm.name || !contactForm.email || !contactForm.subject || !contactForm.message) {
      Alert.alert('Incomplete Form', 'Please fill in all fields before submitting.');
      return;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(contactForm.email)) {
      Alert.alert('Invalid Email', 'Please enter a valid email address.');
      return;
    }

    try {
      // Send email via Supabase Edge Function
      const { data, error } = await supabase.functions.invoke('send-contact-email', {
        body: {
          name: contactForm.name,
          email: contactForm.email,
          subject: contactForm.subject,
          message: contactForm.message,
        },
      });

      if (error) {
        console.error('Error sending email:', error);
        Alert.alert('Error', 'Failed to send message. Please try again later.');
        return;
      }

      // Success
      Alert.alert(
        'Message Sent!',
        'Thank you for your feedback. We\'ll get back to you as soon as possible.',
        [
          {
            text: 'OK',
            onPress: () => {
              setIsContactModalVisible(false);
              setContactForm({ name: '', email: '', subject: '', message: '' });
            }
          }
        ]
      );
    } catch (error) {
      console.error('Error submitting contact form:', error);
      Alert.alert('Error', 'Failed to send message. Please try again later.');
    }
  };

  const handleSubscribe = async (planId: string) => {
    const plan = subscriptionPlans.find(p => p.id === planId);
    if (!plan) return;

    try {
      // Here you would integrate with your payment processor (Stripe, RevenueCat, etc.)
      Alert.alert(
        'Subscribe to ' + plan.name,
        `You selected the ${plan.name} plan for ${plan.price}${plan.period}. This will redirect to the payment processor.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Continue',
            onPress: () => {
              setIsBillingModalVisible(false);
              // Here you would redirect to payment processor
              Alert.alert('Payment', 'Payment integration would happen here!');
            }
          }
        ]
      );
    } catch (error) {
      Alert.alert('Error', 'Failed to process subscription. Please try again.');
    }
  };

  const handleCancelSubscription = async () => {
    const currentSub = getCurrentSubscriptionDisplay();

    Alert.alert(
      'Cancel Subscription',
      'Are you sure you want to cancel your subscription? You will lose access to Pro features at the end of your current billing period.',
      [
        { text: 'Keep Subscription', style: 'cancel' },
        {
          text: 'Cancel Subscription',
          style: 'destructive',
          onPress: async () => {
            try {
              // Here you would call your cancel subscription API
              const renewalDateStr = currentSub.renewalDate
                ? new Date(currentSub.renewalDate).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })
                : 'the end of your billing period';

              Alert.alert(
                'Subscription Cancelled',
                `Your subscription has been cancelled. You will continue to have access to Pro features until ${renewalDateStr}.`,
                [{ text: 'OK', onPress: () => setIsBillingManagementModalVisible(false) }]
              );
            } catch (error) {
              Alert.alert('Error', 'Failed to cancel subscription. Please try again or contact support.');
            }
          }
        }
      ]
    );
  };

  const handleUpgradeFromBilling = () => {
    setIsBillingManagementModalVisible(false);
    setIsBillingModalVisible(true);
  };

  const handleSettingPress = (settingId: string) => {
    switch (settingId) {
      case 'upgrade':
        setIsBillingModalVisible(true);
        break;
      case 'billing':
        setIsBillingManagementModalVisible(true);
        break;
      case 'help':
        setIsContactModalVisible(true);
        break;
      case 'about':
        setIsAboutModalVisible(true);
        break;
      default:
        break;
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={styles.name}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.profileHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {user?.isGuest ? 'G' : (profile?.full_name ? profile.full_name.charAt(0).toUpperCase() : user?.email?.charAt(0).toUpperCase() || '?')}
            </Text>
          </View>
          <Text style={styles.email}>{user?.isGuest ? 'Guest' : user?.email}</Text>
          <Text style={styles.plan}>{currentPlan} Plan</Text>
          <Text style={styles.name}>{user?.isGuest ? '' : (profile?.full_name || '')}</Text>
        </View>


        <View style={styles.settingsSection}>
          <Text style={styles.sectionTitle}>Settings</Text>
          {settings.map((setting) => (
            <TouchableOpacity
              key={setting.id}
              style={styles.settingItem}
              onPress={() => handleSettingPress(setting.id)}
            >
              <View style={styles.settingContent}>
                <Text style={styles.settingTitle}>{setting.title}</Text>
                <Text style={styles.settingSubtitle}>{setting.subtitle}</Text>
              </View>
              <Text style={styles.settingArrow}>›</Text>
            </TouchableOpacity>
          ))}
        </View>


        {!user?.isGuest && (
          <TouchableOpacity style={styles.deleteAccountButton} onPress={handleDeleteAccount}>
            <Text style={styles.deleteAccountText}>Delete Account</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* About Modal */}
      <Modal
        visible={isAboutModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsAboutModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.aboutModal}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.aboutTitle}>About AI Thumbnail Generator</Text>

              <View style={styles.aboutSection}>
                <Text style={styles.aboutHeading}>Our Mission</Text>
                <Text style={styles.aboutText}>
                  We're building with AI to help provide creators with more control over their content.
                  Our goal is to empower content creators, small or big, with powerful, intuitive
                  tools that enhance their creative process while maintaining their unique vision and style.
                  Every creator deserves access to professional-grade tools that amplify their creativity.
                </Text>
              </View>

              <View style={styles.aboutSection}>
                <Text style={styles.aboutHeading}>Be Considerate</Text>
                <Text style={styles.aboutText}>
                  We believe in responsible AI usage. Please use our tools thoughtfully and respect
                  others' intellectual property. Always ensure you have proper rights to any images
                  you upload, and consider the impact of AI-generated content on the creative community.
                </Text>
              </View>

              <View style={styles.aboutSection}>
                <Text style={styles.aboutHeading}>Features</Text>
                <Text style={styles.aboutText}>
                  • AI-powered thumbnail generation{'\n'}
                  • Subject and reference image integration{'\n'}
                  • Advanced editing tools with drawing and text{'\n'}
                  • Cloud storage and history management{'\n'}
                  • Cross-platform compatibility
                </Text>
              </View>

              <View style={styles.aboutSection}>
                <Text style={styles.aboutHeading}>Version</Text>
                <Text style={styles.aboutText}>1.0.0</Text>
              </View>

              <View style={styles.aboutSection}>
                <Text style={styles.aboutHeading}>Contact</Text>
                <Text style={styles.aboutText}>
                  Have feedback or suggestions? We'd love to hear from you.
                  Rate us on the app store or reach out through our support channels.
                </Text>
              </View>
            </ScrollView>

            <TouchableOpacity
              style={styles.aboutCloseButton}
              onPress={() => setIsAboutModalVisible(false)}
            >
              <Text style={styles.aboutCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Contact Form Modal */}
      <Modal
        visible={isContactModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsContactModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
              <View style={styles.contactModal}>
                <ScrollView showsVerticalScrollIndicator={false}>
                  <Text style={styles.contactTitle}>Help & Support</Text>
                  <Text style={styles.contactSubtitle}>
                    We're here to help! Send us a message and we'll get back to you as soon as possible.
                  </Text>

                  <View style={styles.contactForm}>
                    <View style={styles.inputContainer}>
                      <Text style={styles.inputLabel}>Name</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="Your full name"
                        placeholderTextColor="#8a9099"
                        value={contactForm.name}
                        onChangeText={(text) => setContactForm({...contactForm, name: text})}
                      />
                    </View>

                    <View style={styles.inputContainer}>
                      <Text style={styles.inputLabel}>Email</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="your.email@example.com"
                        placeholderTextColor="#8a9099"
                        value={contactForm.email}
                        onChangeText={(text) => setContactForm({...contactForm, email: text})}
                        keyboardType="email-address"
                        autoCapitalize="none"
                      />
                    </View>

                    <View style={styles.inputContainer}>
                      <Text style={styles.inputLabel}>Subject</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="What's this about?"
                        placeholderTextColor="#8a9099"
                        value={contactForm.subject}
                        onChangeText={(text) => setContactForm({...contactForm, subject: text})}
                      />
                    </View>

                    <View style={styles.inputContainer}>
                      <Text style={styles.inputLabel}>Message</Text>
                      <TextInput
                        style={[styles.input, styles.messageInput]}
                        placeholder="Tell us how we can help you..."
                        placeholderTextColor="#8a9099"
                        value={contactForm.message}
                        onChangeText={(text) => setContactForm({...contactForm, message: text})}
                        multiline={true}
                        numberOfLines={6}
                        textAlignVertical="top"
                      />
                    </View>
                  </View>
                </ScrollView>

                <View style={styles.contactActions}>
                  <TouchableOpacity
                    style={styles.contactSubmitButton}
                    onPress={handleContactSubmit}
                  >
                    <Text style={styles.contactSubmitText}>Send Message</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.contactCancelButton}
                    onPress={() => setIsContactModalVisible(false)}
                  >
                    <Text style={styles.contactCancelText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Billing Modal */}
      <Modal
        visible={isBillingModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsBillingModalVisible(false)}
      >
        <LinearGradient
          colors={['#050810', '#0d1120', '#08091a']}
          style={styles.gradientModalOverlay}
        >
          {/* Close Button */}
          <TouchableOpacity
            style={styles.modalCloseButton}
            onPress={() => setIsBillingModalVisible(false)}
          >
            <Text style={styles.modalCloseText}>✕</Text>
          </TouchableOpacity>


          <ScrollView
            contentContainerStyle={styles.gradientScrollContainer}
            showsVerticalScrollIndicator={false}
          >
            {/* Logo/Icon with Glow */}
            <View style={styles.logoContainer}>
              <View style={styles.logoGlow}>
                <View style={styles.logo}>
                  <Image
                    source={require('../../assets/App-Icon.png')}
                    style={styles.logoImage}
                    resizeMode="contain"
                  />
                </View>
              </View>
            </View>

            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.billingTitle}>Turn Thumbnails Into Paychecks.</Text>
              <Text style={styles.billingSubtitle}>
                Every click counts. Create and save eye-catching thumbnails that grow your channel, build your audience, and boost your revenue.
              </Text>
            </View>

            {/* Plans */}
            <View style={styles.plansContainer}>
              {subscriptionPlans.map((plan) => (
                <TouchableOpacity
                  key={plan.id}
                  style={[
                    styles.planCard,
                    selectedPlan === plan.id && styles.selectedPlan,
                    plan.hasTrial && styles.popularPlan,
                  ]}
                  onPress={() => setSelectedPlan(plan.id)}
                >
                  {plan.hasTrial && selectedPlan === plan.id && (
                    <View style={styles.popularBadge}>
                      <Text style={styles.popularText}>3 DAY FREE TRIAL</Text>
                    </View>
                  )}
                  <View style={styles.planRadio}>
                    {selectedPlan === plan.id && <View style={styles.planRadioSelected} />}
                  </View>
                  <View style={styles.planContent}>
                    <Text style={styles.planName}>{plan.name}</Text>
                  </View>
                  <Text style={styles.planPrice}>{plan.price}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Trial Info */}
            <Text style={styles.trialInfo}>
              {subscriptionPlans.find(p => p.id === selectedPlan)?.description}
            </Text>
          </ScrollView>

          {/* Continue Button - Fixed at Bottom */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={styles.continueButton}
              onPress={() => handleSubscribe(selectedPlan)}
            >
              <LinearGradient
                colors={['#1e40af', '#1e3a8a']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.continueGradient}
              >
                <Text style={styles.continueText}>Continue</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </Modal>

      {/* Billing Management Modal */}
      <Modal
        visible={isBillingManagementModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsBillingManagementModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.billingManagementModal}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.billingManagementTitle}>Billing & Subscription</Text>

              <View style={styles.currentPlanSection}>
                <Text style={styles.currentPlanTitle}>Current Plan</Text>
                <View style={styles.planDetailsCard}>
                  <View style={styles.planInfo}>
                    <Text style={styles.planNameText}>{getCurrentSubscriptionDisplay().plan}</Text>
                    <Text style={styles.planPriceText}>{getCurrentSubscriptionDisplay().price}</Text>
                  </View>
                  {getCurrentSubscriptionDisplay().status === 'active' && (
                    <View style={styles.statusBadge}>
                      <Text style={styles.statusText}>Active</Text>
                    </View>
                  )}
                </View>

                {getCurrentSubscriptionDisplay().renewalDate && (
                  <View style={styles.renewalInfo}>
                    <Text style={styles.renewalLabel}>Next Billing Date</Text>
                    <Text style={styles.renewalDate}>
                      {new Date(getCurrentSubscriptionDisplay().renewalDate).toLocaleDateString('en-US', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </Text>
                  </View>
                )}

                <View style={styles.billingActionsContainer}>
                  <TouchableOpacity
                    style={styles.upgradeButton}
                    onPress={handleUpgradeFromBilling}
                  >
                    <Text style={styles.upgradeButtonText}>Upgrade Plan</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={handleCancelSubscription}
                  >
                    <Text style={styles.cancelButtonText}>Cancel Subscription</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>

            <TouchableOpacity
              style={styles.billingCloseButton}
              onPress={() => setIsBillingManagementModalVisible(false)}
            >
              <Text style={styles.billingCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const BG = '#0b0f14';
const CARD = '#151a21';
const BORDER = '#232932';
const TEXT = '#e7ebf0';
const MUTED = '#8a9099';
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  profileHeader: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    paddingVertical: 15,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#2a3038',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarText: {
    color: TEXT,
    fontSize: 24,
    fontWeight: 'bold',
  },
  name: {
    fontSize: 24,
    fontWeight: 'bold',
    color: TEXT,
    marginBottom: 4,
  },
  email: {
    fontSize: 16,
    color: MUTED,
    marginBottom: 8,
  },
  plan: {
    fontSize: 14,
    color: TEXT,
    fontWeight: '600',
    backgroundColor: '#2a3038',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  creditsContainer: {
    marginTop: 16,
    backgroundColor: '#1e40af',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 20,
    shadowColor: '#1e40af',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  creditsText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 0.5,
  },
  settingsSection: {
    marginBottom: 32,
    flex: 0,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: TEXT,
    marginBottom: 16,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CARD,
    borderColor: BORDER,
    borderWidth: 1,
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  settingContent: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: TEXT,
    marginBottom: 2,
  },
  settingSubtitle: {
    fontSize: 14,
    color: MUTED,
  },
  settingArrow: {
    fontSize: 24,
    color: MUTED,
  },
  quickActions: {
    gap: 12,
    marginBottom: 32,
  },
  actionButton: {
    backgroundColor: '#2a3038',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  actionButtonText: {
    color: TEXT,
    fontSize: 16,
    fontWeight: '600',
  },
  signOutButton: {
    backgroundColor: CARD,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#5a2d2d',
    marginBottom: 20,
  },
  signOutText: {
    color: '#f87171',
    fontSize: 16,
    fontWeight: '600',
  },
  deleteAccountButton: {
    backgroundColor: '#7f1d1d',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#991b1b',
    marginBottom: 12,
  },
  deleteAccountText: {
    color: '#fca5a5',
    fontSize: 16,
    fontWeight: '600',
  },
  editSection: {
    marginBottom: 32,
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: TEXT,
    marginBottom: 8,
  },
  input: {
    backgroundColor: CARD,
    borderColor: BORDER,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 16,
    color: TEXT,
  },
  editActions: {
    gap: 12,
    marginTop: 16,
  },
  saveButton: {
    backgroundColor: '#6366f1',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  aboutModal: {
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 24,
    maxHeight: '80%',
    width: '100%',
    borderWidth: 1,
    borderColor: BORDER,
  },
  aboutTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: TEXT,
    textAlign: 'center',
    marginBottom: 24,
  },
  aboutSection: {
    marginBottom: 20,
  },
  aboutHeading: {
    fontSize: 18,
    fontWeight: '600',
    color: TEXT,
    marginBottom: 8,
  },
  aboutText: {
    fontSize: 14,
    lineHeight: 20,
    color: MUTED,
  },
  aboutCloseButton: {
    backgroundColor: '#1e40af',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
  },
  aboutCloseText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  contactModal: {
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 24,
    maxHeight: '85%',
    width: '100%',
    borderWidth: 1,
    borderColor: BORDER,
  },
  contactTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: TEXT,
    textAlign: 'center',
    marginBottom: 8,
  },
  contactSubtitle: {
    fontSize: 14,
    color: MUTED,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  contactForm: {
    marginBottom: 16,
  },
  messageInput: {
    height: 120,
    paddingTop: 16,
  },
  contactActions: {
    gap: 12,
  },
  contactSubmitButton: {
    backgroundColor: '#1e40af',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  contactSubmitText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  contactCancelButton: {
    backgroundColor: 'transparent',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: BORDER,
  },
  contactCancelText: {
    color: MUTED,
    fontSize: 16,
    fontWeight: '600',
  },
  gradientModalOverlay: {
    flex: 1,
  },
  modalCloseButton: {
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
  modalCloseText: {
    fontSize: 24,
    color: '#ffffff',
    fontWeight: '300',
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
  gradientScrollContainer: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 120,
    paddingBottom: 20,
    justifyContent: 'center',
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
  logoText: {
    fontSize: 50,
  },
  header: {
    marginBottom: 40,
    alignItems: 'center',
  },
  billingTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 16,
    textAlign: 'center',
    lineHeight: 36,
  },
  billingSubtitle: {
    fontSize: 15,
    color: '#a0a8b8',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 10,
  },
  plansContainer: {
    gap: 16,
    marginBottom: 16,
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
    borderColor: '#a0a8b8',
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
    color: '#ffffff',
  },
  planPrice: {
    fontSize: 14,
    fontWeight: '500',
    color: '#a0a8b8',
  },
  trialInfo: {
    fontSize: 13,
    color: '#a0a8b8',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 18,
  },
  buttonContainer: {
    paddingHorizontal: 24,
    paddingBottom: 40,
    paddingTop: 10,
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
  billingManagementModal: {
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 24,
    maxHeight: '80%',
    width: '100%',
    borderWidth: 1,
    borderColor: BORDER,
  },
  billingManagementTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: TEXT,
    textAlign: 'center',
    marginBottom: 24,
  },
  currentPlanSection: {
    marginBottom: 16,
  },
  currentPlanTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: TEXT,
    marginBottom: 16,
  },
  planDetailsCard: {
    backgroundColor: BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  planInfo: {
    flex: 1,
  },
  planNameText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: TEXT,
    marginBottom: 4,
  },
  planPriceText: {
    fontSize: 16,
    color: MUTED,
  },
  renewalInfo: {
    backgroundColor: BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  renewalLabel: {
    fontSize: 14,
    color: MUTED,
    marginBottom: 4,
  },
  renewalDate: {
    fontSize: 16,
    fontWeight: '600',
    color: TEXT,
  },
  billingActionsContainer: {
    gap: 12,
  },
  upgradeButton: {
    backgroundColor: '#1e40af',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  upgradeButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  cancelButton: {
    backgroundColor: 'transparent',
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#ef4444',
    fontSize: 16,
    fontWeight: '500',
  },
  billingCloseButton: {
    backgroundColor: 'transparent',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
  },
  billingCloseText: {
    color: MUTED,
    fontSize: 16,
    fontWeight: '600',
  },
});