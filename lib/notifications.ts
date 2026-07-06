import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { supabase } from './supabase';

// ─────────────────────────────────────────────────────────────────────────────
// Foreground notification appearance
// Must be set at module load time, before any notification can arrive.
// ─────────────────────────────────────────────────────────────────────────────
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert:  true,
    shouldPlaySound:  false,
    shouldSetBadge:   false,
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// Android notification channel
// Required on Android 8+; no-op on iOS.
// Call once on app launch via initializeNotifications().
// ─────────────────────────────────────────────────────────────────────────────
export async function initializeNotifications(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync('default', {
      name:              'Default',
      importance:        Notifications.AndroidImportance.MAX,
      vibrationPattern:  [0, 250, 250, 250],
      lightColor:        '#1e40af',
    });
  } catch (err) {
    console.warn('[Notifications] Failed to create Android channel:', err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// registerForPushNotifications
//
// Call this after a meaningful user action (e.g. completing onboarding,
// subscribing, saving their first thumbnail). Do NOT call on first launch.
//
// Returns the Expo push token string on success, null on failure or denial.
// Never throws — all errors are caught internally.
// ─────────────────────────────────────────────────────────────────────────────
export async function registerForPushNotifications(userId: string): Promise<string | null> {
  try {
    // Push tokens require a physical device — simulators always return a fake token
    // that cannot receive real pushes. Fail fast rather than saving a bad token.
    if (!Device.isDevice) {
      console.log('[Notifications] Skipped — simulator/emulator detected');
      return null;
    }

    // Check what the OS already decided before showing the system prompt.
    // If already granted we skip the prompt entirely.
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('[Notifications] Permission not granted — status:', finalStatus);
      return null;
    }

    // The projectId links the token to this specific Expo/EAS project.
    // It is required; without it getExpoPushTokenAsync throws.
    const projectId: string | undefined =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;

    if (!projectId) {
      console.warn('[Notifications] No EAS projectId found in app config — cannot get push token');
      return null;
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });

    console.log('[Notifications] Token acquired:', token.slice(0, 30) + '...');

    // Upsert so re-registrations (after reinstall, token rotation) stay idempotent.
    const { error: upsertError } = await supabase
      .from('push_tokens')
      .upsert(
        {
          user_id:               userId,
          expo_push_token:       token,
          platform:              Platform.OS,
          notifications_enabled: true,
          marketing_opt_in:      true,
          updated_at:            new Date().toISOString(),
        },
        { onConflict: 'user_id,expo_push_token' }
      );

    if (upsertError) {
      console.error('[Notifications] Failed to save token to Supabase:', upsertError.message);
    } else {
      console.log('[Notifications] Token saved — userId:', userId);
    }

    return token;
  } catch (err) {
    // Never surface a push setup failure to the user
    console.error('[Notifications] registerForPushNotifications error:', err);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// trackAppOpen
//
// Call whenever the app comes to the foreground (cold start or AppState change).
// Updates profiles.last_opened_at so the re-engagement eligibility query has
// fresh data. Suppresses pushes to ALL of the user's devices, not just the
// current one, because last_opened_at lives on profiles (per user).
// Never throws.
// ─────────────────────────────────────────────────────────────────────────────
export async function trackAppOpen(userId: string): Promise<void> {
  try {
    await supabase
      .from('profiles')
      .update({ last_opened_at: new Date().toISOString() })
      .eq('id', userId);
  } catch (err) {
    console.warn('[Notifications] trackAppOpen error:', err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// trackNotificationOpen
//
// Call when the user taps a push notification (addNotificationResponseReceivedListener).
// Records last_notification_opened_at on profiles so you can calculate:
//   push open rate  = notification_opened / notifications_sent
//   attribution     = did the push cause the app open?
//   effectiveness   = last_notification_opened_at vs last_opened_at proximity
// Never throws.
// ─────────────────────────────────────────────────────────────────────────────
export async function trackNotificationOpen(userId: string): Promise<void> {
  try {
    await supabase
      .from('profiles')
      .update({ last_notification_opened_at: new Date().toISOString() })
      .eq('id', userId);
  } catch (err) {
    console.warn('[Notifications] trackNotificationOpen error:', err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// setupNotificationListeners
//
// Call once in the root layout. Returns a cleanup function for useEffect.
//
// onNotificationReceived — app is foregrounded when the notification arrives
// onNotificationTapped   — user taps the notification (foreground or background)
// ─────────────────────────────────────────────────────────────────────────────
export function setupNotificationListeners(
  onNotificationReceived?: (notification: Notifications.Notification) => void,
  onNotificationTapped?: (response: Notifications.NotificationResponse) => void,
): () => void {
  const foregroundSub = Notifications.addNotificationReceivedListener((notification) => {
    console.log('[Notifications] Received in foreground:', notification.request.identifier);
    onNotificationReceived?.(notification);
  });

  const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
    console.log('[Notifications] User tapped notification:', response.notification.request.identifier);
    onNotificationTapped?.(response);
  });

  return () => {
    foregroundSub.remove();
    responseSub.remove();
  };
}
