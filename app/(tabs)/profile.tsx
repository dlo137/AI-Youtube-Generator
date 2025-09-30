import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, Linking, Platform, Modal, TouchableWithoutFeedback, Keyboard } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useState, useEffect } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { getCurrentUser, getMyProfile, updateMyProfile, signOut } from '../../src/features/auth/api';
import { useModal } from '../../src/contexts/ModalContext';
import { supabase } from '../../lib/supabase';

export default function ProfileScreen() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    full_name: ''
  });
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
  const [selectedPlan, setSelectedPlan] = useState('monthly');
  const [contactForm, setContactForm] = useState({
    name: '',
    email: '',
    subject: '',
    message: ''
  });
  const router = useRouter();

  const settings = [
    { id: 'about', title: 'About', subtitle: 'App information' },
    { id: 'rate', title: 'Rate the App', subtitle: 'Share your feedback on the app store' },
    { id: 'help', title: 'Help & Support', subtitle: 'Get assistance' },
    { id: 'upgrade', title: 'Upgrade Your Plan', subtitle: 'Choose a subscription plan' },
    { id: 'billing', title: 'Billing & Subscription', subtitle: 'Manage your current subscription' },
  ];

  const subscriptionPlans = [
    {
      id: 'weekly',
      name: 'Weekly',
      price: '$2.99',
      period: '/week',
      description: 'Perfect for short-term projects',
      features: ['Unlimited thumbnails', 'Advanced editing tools', 'Cloud storage', 'Priority support']
    },
    {
      id: 'monthly',
      name: 'Monthly',
      price: '$9.99',
      period: '/month',
      description: 'Most popular for regular creators',
      features: ['Unlimited thumbnails', 'Advanced editing tools', 'Cloud storage', 'Priority support', 'Export in 4K'],
      popular: true
    },
    {
      id: 'yearly',
      name: 'Yearly',
      price: '$89.99',
      period: '/year',
      description: 'Best value - save 25%',
      originalPrice: '$119.88',
      features: ['Unlimited thumbnails', 'Advanced editing tools', 'Cloud storage', 'Priority support', 'Export in 4K', 'Team collaboration']
    }
  ];

  // Mock current subscription data - replace with actual subscription state
  const currentSubscription = {
    plan: 'Monthly Pro',
    price: '$9.99/month',
    renewalDate: '2024-01-15',
    status: 'active'
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
              Alert.alert(
                'Subscription Cancelled',
                `Your subscription has been cancelled. You will continue to have access to Pro features until ${currentSubscription.renewalDate}.`,
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
      case 'rate':
        handleRateApp();
        break;
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
          <Text style={styles.plan}>Free Plan</Text>
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
        <View style={styles.modalOverlay}>
          <View style={styles.billingModal}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.billingTitle}>Choose Your Plan</Text>
              <Text style={styles.billingSubtitle}>
                Upgrade to Pro to unlock unlimited thumbnails and advanced features
              </Text>

              <View style={styles.plansContainer}>
                {subscriptionPlans.map((plan) => (
                  <TouchableOpacity
                    key={plan.id}
                    style={[
                      styles.planCard,
                      selectedPlan === plan.id && styles.selectedPlan,
                      plan.popular && styles.popularPlan
                    ]}
                    onPress={() => setSelectedPlan(plan.id)}
                  >
                    {plan.popular && (
                      <View style={styles.popularBadge}>
                        <Text style={styles.popularText}>Most Popular</Text>
                      </View>
                    )}

                    <Text style={styles.planName}>{plan.name}</Text>
                    <Text style={styles.planDescription}>{plan.description}</Text>

                    <View style={styles.priceContainer}>
                      <Text style={styles.planPrice}>{plan.price}</Text>
                      <Text style={styles.planPeriod}>{plan.period}</Text>
                    </View>

                    {plan.originalPrice && (
                      <Text style={styles.originalPrice}>
                        Was {plan.originalPrice}
                      </Text>
                    )}

                    <View style={styles.featuresContainer}>
                      {plan.features.map((feature, index) => (
                        <View key={index} style={styles.featureRow}>
                          <Text style={styles.checkmark}>✓</Text>
                          <Text style={styles.featureText}>{feature}</Text>
                        </View>
                      ))}
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <View style={styles.billingActions}>
              <TouchableOpacity
                style={styles.subscribeButton}
                onPress={() => handleSubscribe(selectedPlan)}
              >
                <Text style={styles.subscribeText}>
                  Subscribe to {subscriptionPlans.find(p => p.id === selectedPlan)?.name}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.billingCancelButton}
                onPress={() => setIsBillingModalVisible(false)}
              >
                <Text style={styles.billingCancelText}>Not Now</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
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
                    <Text style={styles.planNameText}>{currentSubscription.plan}</Text>
                    <Text style={styles.planPriceText}>{currentSubscription.price}</Text>
                  </View>
                  <View style={styles.statusBadge}>
                    <Text style={styles.statusText}>Active</Text>
                  </View>
                </View>

                <View style={styles.renewalInfo}>
                  <Text style={styles.renewalLabel}>Next Billing Date</Text>
                  <Text style={styles.renewalDate}>
                    {new Date(currentSubscription.renewalDate).toLocaleDateString('en-US', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </Text>
                </View>

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
    backgroundColor: '#6366f1',
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
    backgroundColor: '#6366f1',
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
  billingModal: {
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 24,
    maxHeight: '90%',
    width: '100%',
    borderWidth: 1,
    borderColor: BORDER,
  },
  billingTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: TEXT,
    textAlign: 'center',
    marginBottom: 8,
  },
  billingSubtitle: {
    fontSize: 14,
    color: MUTED,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  plansContainer: {
    gap: 16,
    marginBottom: 16,
  },
  planCard: {
    backgroundColor: BG,
    borderWidth: 2,
    borderColor: BORDER,
    borderRadius: 12,
    padding: 20,
    position: 'relative',
  },
  selectedPlan: {
    borderColor: '#6366f1',
  },
  popularPlan: {
    borderColor: '#f59e0b',
  },
  popularBadge: {
    position: 'absolute',
    top: -10,
    left: 20,
    backgroundColor: '#f59e0b',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  popularText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  planName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: TEXT,
    marginBottom: 4,
  },
  planDescription: {
    fontSize: 14,
    color: MUTED,
    marginBottom: 12,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  planPrice: {
    fontSize: 28,
    fontWeight: 'bold',
    color: TEXT,
  },
  planPeriod: {
    fontSize: 16,
    color: MUTED,
    marginLeft: 4,
  },
  originalPrice: {
    fontSize: 14,
    color: MUTED,
    textDecorationLine: 'line-through',
    marginBottom: 16,
  },
  featuresContainer: {
    gap: 8,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkmark: {
    color: '#10b981',
    fontSize: 16,
    fontWeight: 'bold',
  },
  featureText: {
    fontSize: 14,
    color: TEXT,
    flex: 1,
  },
  billingActions: {
    gap: 12,
  },
  subscribeButton: {
    backgroundColor: '#6366f1',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  subscribeText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  billingCancelButton: {
    backgroundColor: 'transparent',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  billingCancelText: {
    color: MUTED,
    fontSize: 16,
    fontWeight: '600',
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
    backgroundColor: '#6366f1',
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