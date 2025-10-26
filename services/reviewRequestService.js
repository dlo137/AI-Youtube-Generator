import * as StoreReview from 'expo-store-review';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, Alert, Linking } from 'react-native';

const REVIEW_REQUEST_KEY = '@review_request_last_asked';
const COOLDOWN_DAYS = 30;

/**
 * Request app review with 30-day cooldown
 * Only shows the review prompt if 30 days have passed since last request
 */
export const requestReview = async () => {
  try {
    // Check if we've asked recently
    const lastAskedStr = await AsyncStorage.getItem(REVIEW_REQUEST_KEY);

    if (lastAskedStr) {
      const lastAsked = new Date(lastAskedStr);
      const now = new Date();
      const daysSinceLastAsk = (now - lastAsked) / (1000 * 60 * 60 * 24);

      // Don't ask again if within cooldown period
      if (daysSinceLastAsk < COOLDOWN_DAYS) {
        console.log(`[Review Request] Skipping - asked ${Math.floor(daysSinceLastAsk)} days ago`);
        return;
      }
    }

    // Check if we're in development/Expo Go
    const isAvailable = await StoreReview.isAvailableAsync();

    if (!isAvailable || __DEV__) {
      // Simulate review prompt for development/Expo Go
      Alert.alert(
        'Rate AI Thumbnail Generator',
        'How would you rate your experience with our app?',
        [
          {
            text: 'Not Now',
            style: 'cancel',
            onPress: () => console.log('[Review Request] User dismissed (simulated)')
          },
          {
            text: 'Rate ⭐',
            onPress: async () => {
              Alert.alert(
                'Thank You!',
                'We appreciate your feedback! In production, this would open the App Store for you to leave a review.',
                [{ text: 'OK' }]
              );
              // Record that we asked (even in simulation)
              await AsyncStorage.setItem(REVIEW_REQUEST_KEY, new Date().toISOString());
              console.log('[Review Request] User tapped Rate (simulated)');
            }
          }
        ]
      );
      return;
    }

    // Production: Show the review prompt
    if (Platform.OS === 'ios') {
      // Show native iOS rating dialog
      await StoreReview.requestReview();

      // Record that we asked
      await AsyncStorage.setItem(REVIEW_REQUEST_KEY, new Date().toISOString());
      console.log('[Review Request] Review prompt shown');
    } else if (Platform.OS === 'android') {
      // Android: Show in-app review
      await StoreReview.requestReview();
      await AsyncStorage.setItem(REVIEW_REQUEST_KEY, new Date().toISOString());
      console.log('[Review Request] Review prompt shown');
    }
  } catch (error) {
    console.error('[Review Request] Error requesting review:', error);
  }
};

/**
 * Fallback alert when native review is not available
 */
const showFallbackReviewAlert = async () => {
  Alert.alert(
    'Enjoying AI Thumbnail Generator?',
    'We\'d love to hear your feedback! Would you like to rate us?',
    [
      {
        text: 'Not Now',
        style: 'cancel',
      },
      {
        text: 'Rate App',
        onPress: async () => {
          try {
            if (Platform.OS === 'ios') {
              // iOS App Store URL (will work once app is published)
              const appId = 'YOUR_APP_ID'; // Replace with actual App Store ID
              const url = `itms-apps://apps.apple.com/app/id${appId}?action=write-review`;
              const canOpen = await Linking.canOpenURL(url);
              if (canOpen) {
                await Linking.openURL(url);
              }
            } else if (Platform.OS === 'android') {
              // Android Play Store URL
              const androidPackageName = 'com.watsonsweb.thumbnail-generator';
              const url = `market://details?id=${androidPackageName}`;
              const fallbackUrl = `https://play.google.com/store/apps/details?id=${androidPackageName}`;

              const canOpen = await Linking.canOpenURL(url);
              if (canOpen) {
                await Linking.openURL(url);
              } else {
                await Linking.openURL(fallbackUrl);
              }
            }

            // Record that we asked
            await AsyncStorage.setItem(REVIEW_REQUEST_KEY, new Date().toISOString());
          } catch (error) {
            console.error('[Review Request] Error opening store:', error);
          }
        },
      },
    ]
  );
};

/**
 * Reset the cooldown (for testing purposes)
 */
export const resetReviewCooldown = async () => {
  try {
    await AsyncStorage.removeItem(REVIEW_REQUEST_KEY);
    console.log('[Review Request] Cooldown reset');
  } catch (error) {
    console.error('[Review Request] Error resetting cooldown:', error);
  }
};

/**
 * Check when we last asked for a review
 */
export const getLastReviewRequestDate = async () => {
  try {
    const lastAskedStr = await AsyncStorage.getItem(REVIEW_REQUEST_KEY);
    if (lastAskedStr) {
      return new Date(lastAskedStr);
    }
    return null;
  } catch (error) {
    console.error('[Review Request] Error getting last request date:', error);
    return null;
  }
};
