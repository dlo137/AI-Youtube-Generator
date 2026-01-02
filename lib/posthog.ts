import PostHog from 'posthog-react-native';
import { Platform } from 'react-native';

let posthogClient: PostHog | null = null;

export const initPostHog = async () => {
  if (posthogClient) {
    return posthogClient;
  }

  try {
    posthogClient = new PostHog(
      'phc_PVPVtV8qN8xJGDO9rYMtt9lhzCiWM69im2jMmXQlnrN',
      {
        host: 'https://us.i.posthog.com',
        // Disable automatic flushing to prevent errors
        flushAt: 20,
        flushInterval: 30000,
      }
    );
    return posthogClient;
  } catch (error) {
    console.warn('[PostHog] Failed to initialize - tracking disabled:', error);
    return null;
  }
};

export const trackScreenView = (screenName: string) => {
  try {
    if (posthogClient) {
      // Convert screen name to event name (e.g., "Sign Up Screen" -> "signup_screen_viewed")
      const eventName = screenName.toLowerCase().replace(/\s+/g, '_') + '_viewed';
      console.log('[PostHog] Capturing event:', eventName);
      posthogClient.capture(eventName, {
        platform: Platform.OS,
      });
    } else {
      console.warn('[PostHog] Client not initialized, cannot track:', screenName);
    }
  } catch (error) {
    // Fail silently
    console.warn('[PostHog] Screen tracking failed:', error);
  }
};

export const trackEvent = (eventName: string, properties?: Record<string, any>) => {
  try {
    if (posthogClient) {
      console.log('[PostHog] Capturing event:', eventName, properties);
      posthogClient.capture(eventName, properties);
    } else {
      console.warn('[PostHog] Client not initialized, cannot track:', eventName);
    }
  } catch (error) {
    // Fail silently
    console.warn('[PostHog] Event tracking failed:', error);
  }
};
