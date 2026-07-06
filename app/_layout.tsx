import '../polyfills';
import { Stack, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Alert, Linking, AppState, AppStateStatus } from 'react-native';
import { initPostHog, trackEvent } from '../lib/posthog';
import { incrementAppSessions } from '../lib/useReviewPrompt';
import { initializeNotifications, setupNotificationListeners, trackAppOpen, trackNotificationOpen, registerForPushNotifications } from '../lib/notifications';
import { supabase, initializeAuth } from '../lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
// RevenueCat removed - not using it for this app
// import { initializeRevenueCat } from '../lib/revenuecat';

function RootLayoutNav() {
  const router = useRouter();

  useEffect(() => {
    const initializeAnalytics = async () => {
      // Initialize auth first to handle any refresh token errors
      initializeAuth();

      // Count this launch for the review prompt session gate
      incrementAppSessions();

      // Create the Android notification channel (no-op on iOS)
      initializeNotifications();

      // Record this open so the re-engagement push eligibility query stays fresh.
      // Also register for push notifications on cold start if session already exists
      // (covers returning users who skip the login screen entirely).
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        trackAppOpen(session.user.id);
        registerForPushNotifications(session.user.id);
      }

      await initPostHog();

      // Check if this is first app launch
      const hasLaunchedBefore = await AsyncStorage.getItem('app_launched_before');

      // In development/Expo Go, always track for testing purposes
      // In production, only track on first launch
      if (!hasLaunchedBefore || __DEV__) {
        trackEvent('application_installed');
        if (!hasLaunchedBefore) {
          await AsyncStorage.setItem('app_launched_before', 'true');
        }
      }
    };

    initializeAnalytics();
  }, []);

  // RevenueCat initialization removed - not using it for this app
  // useEffect(() => {
  //   const setupRevenueCat = async () => {
  //     try {
  //       await initializeRevenueCat();
  //     } catch (error) {
  //       console.error('[App] Failed to initialize RevenueCat:', error);
  //     }
  //   };
  //   setupRevenueCat();
  // }, []);

  // Register push token on any new sign-in.
  // Covers email login, Apple Sign In, and Google OAuth — all of which navigate
  // directly to /(tabs)/generate and never hit loadingaccount.tsx.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        registerForPushNotifications(session.user.id);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // Track last_opened_at when the user foregrounds the app from the background.
  // Cold-start tracking is handled in the analytics useEffect above.
  useEffect(() => {
    const handleAppStateChange = async (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          trackAppOpen(session.user.id);
        }
      }
    };
    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => sub.remove();
  }, []);

  // Register foreground + tap notification listeners for the lifetime of the app.
  // No notifications are sent here — this just wires up the receive/tap handlers.
  useEffect(() => {
    const cleanup = setupNotificationListeners(
      undefined, // foreground receive — no UI action needed yet
      async () => {
        // User tapped a push notification — record for open-rate attribution
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          trackNotificationOpen(session.user.id);
        }
      },
    );
    return cleanup;
  }, []);

  // Listen for deep links
  useEffect(() => {
    console.log('[Deep Link] Setting up deep link listener...');

    const handleDeepLink = async (url: string) => {
      console.log('[Deep Link] ========================================');
      console.log('[Deep Link] Received URL:', url);
      console.log('[Deep Link] ========================================');

      // Handle OAuth callbacks by explicitly routing to auth/callback
      if (url.includes('code=') || url.includes('access_token=')) {
        console.log('[Deep Link] OAuth callback detected!');

        try {
          const { supabase } = require('../lib/supabase');
          const urlObj = new URL(url);
          const code = urlObj.searchParams.get('code');

          console.log('[Deep Link] Parsed code from URL:', code ? 'YES' : 'NO');

          if (code) {
            console.log('[Deep Link] Exchanging auth code for session...');
            const { data, error } = await supabase.auth.exchangeCodeForSession(code);

            if (error) {
              console.error('[Deep Link] ❌ Code exchange error:', error);
              console.error('[Deep Link] Error message:', error.message);
              console.error('[Deep Link] Error details:', JSON.stringify(error));

              // Don't redirect to login - let user try again
              return;
            }

            if (!data?.session) {
              console.error('[Deep Link] ❌ No session returned after code exchange');
              return;
            }

            console.log('[Deep Link] ✓ Session created successfully!');
            console.log('[Deep Link] User email:', data?.session?.user?.email);
            console.log('[Deep Link] User ID:', data?.session?.user?.id);

            // Check if profile exists, if not create it
            try {
              const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', data.session.user.id)
                .single();

              if (profileError && profileError.code === 'PGRST116') {
                // Profile doesn't exist, create it
                console.log('[Deep Link] Profile does not exist, creating...');
                const { error: createError } = await supabase
                  .from('profiles')
                  .insert({
                    id: data.session.user.id,
                    name: data.session.user.user_metadata?.full_name || data.session.user.email?.split('@')[0] || 'User',
                    email: data.session.user.email,
                  });

                if (createError) {
                  console.error('[Deep Link] Failed to create profile:', createError);
                } else {
                  console.log('[Deep Link] Profile created successfully');
                }
              } else if (profile) {
                console.log('[Deep Link] Profile exists:', profile.name);
              }
            } catch (profileCheckError) {
              console.error('[Deep Link] Error checking/creating profile:', profileCheckError);
            }

            router.replace('/loadingaccount');
          } else {
            console.log('[Deep Link] No code in URL, routing to auth/callback page');
            router.push('/auth/callback');
          }
        } catch (error: any) {
          console.error('[Deep Link] ❌ Exception during OAuth handling:', error);
          console.error('[Deep Link] Error message:', error?.message);
          console.error('[Deep Link] Error stack:', error?.stack);
          // Don't redirect to login - just log the error and let user try again
        }
        return;
      }

      console.log('[Deep Link] Not an OAuth callback, ignoring');
    };

    // Check for initial URL (when app is opened from deep link)
    Linking.getInitialURL().then((url) => {
      if (url) {
        console.log('[Deep Link] Initial URL detected:', url);
        handleDeepLink(url);
      } else {
        console.log('[Deep Link] No initial URL');
      }
    });

    // Listen for future deep links (when app is already running)
    const subscription = Linking.addEventListener('url', ({ url }) => {
      handleDeepLink(url);
    });

    return () => {
      console.log('[Deep Link] Removing deep link listener');
      subscription.remove();
    };
  }, [router]);

  useEffect(() => {
    // Global error handler
    const errorHandler = (error: Error, isFatal?: boolean) => {
      console.error('Global error:', error);
      console.error('Error stack:', error.stack);
      if (isFatal) {
        Alert.alert(
          'Unexpected Error',
          `Fatal error: ${error.message}\n\nPlease restart the app.`
        );
      }
    };

    // @ts-ignore
    if (ErrorUtils) {
      // @ts-ignore
      ErrorUtils.setGlobalHandler(errorHandler);
    }

    // Catch unhandled promise rejections
    const rejectionHandler = (event: any) => {
      console.error('Unhandled promise rejection:', event);
      if (event && event.reason) {
        console.error('Rejection reason:', event.reason);
      }
    };

    // @ts-ignore
    if (typeof window !== 'undefined' && window.addEventListener) {
      // @ts-ignore
      window.addEventListener('unhandledrejection', rejectionHandler);
    }

    return () => {
      // @ts-ignore
      if (typeof window !== 'undefined' && window.removeEventListener) {
        // @ts-ignore
        window.removeEventListener('unhandledrejection', rejectionHandler);
      }
    };
  }, []);

  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: '#6366f1',
        },
        headerTintColor: '#fff',
        headerTitleStyle: {
          fontWeight: 'bold',
        },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: 'AI YouTube Generator',
          headerShown: false
        }}
      />
      <Stack.Screen
        name="signup"
        options={{
          title: 'Sign Up',
          headerShown: false
        }}
      />
      <Stack.Screen
        name="login"
        options={{
          title: 'Login',
          headerShown: false
        }}
      />
      <Stack.Screen
        name="forgot-password"
        options={{
          title: 'Forgot Password',
          headerShown: false
        }}
      />
      <Stack.Screen
        name="reset-password"
        options={{
          title: 'Reset Password',
          headerShown: false
        }}
      />
      <Stack.Screen
        name="auth/callback"
        options={{
          title: 'Auth Callback',
          headerShown: false
        }}
      />
      <Stack.Screen
        name="(tabs)"
        options={{
          headerShown: false
        }}
      />
      <Stack.Screen
        name="loadingaccount"
        options={{
          title: 'Loading',
          headerShown: false
        }}
      />
      <Stack.Screen
        name="subscriptionScreen"
        options={{
          headerShown: false
        }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  return <RootLayoutNav />;
}