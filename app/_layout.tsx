import '../polyfills';
import { Stack, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Alert, Linking } from 'react-native';
import { PostHogProvider, usePostHog, PostHog } from 'posthog-react-native';
import { usePostHogScreenTracking } from '../hooks/usePostHogScreenTracking';
import { POSTHOG_API_KEY, POSTHOG_HOST } from '../lib/posthog';

// Initialize PostHog client
const posthog = new PostHog(POSTHOG_API_KEY, {
  host: POSTHOG_HOST,
  captureApplicationLifecycleEvents: true,
  captureScreenViews: false, // We handle this manually via usePostHogScreenTracking
});

function RootLayoutNav() {
  const posthog = usePostHog();
  const router = useRouter();

  // Track screen views automatically
  usePostHogScreenTracking();

  // Listen for deep links from Google Sign-In
  useEffect(() => {
    const subscription = Linking.addEventListener('url', async ({ url }) => {
      console.log('[Deep Link] Received:', url);

      // Handle OAuth callbacks
      if (url.includes('access_token') || url.includes('code=')) {
        console.log('[Deep Link] Auth callback detected');

        try {
          // Import supabase
          const { supabase } = require('../lib/supabase');

          // Parse the URL
          const urlObj = new URL(url);
          const code = urlObj.searchParams.get('code');
          const accessToken = urlObj.searchParams.get('access_token');

          if (code) {
            console.log('[Deep Link] Exchanging code for session...');
            const { data, error } = await supabase.auth.exchangeCodeForSession(code);

            if (error) {
              console.error('[Deep Link] Code exchange error:', error);
            } else {
              console.log('[Deep Link] Session created successfully!');
              router.push('/(tabs)/generate');
            }
          } else if (accessToken) {
            console.log('[Deep Link] Access token found in URL');
            router.push('/(tabs)/generate');
          }
        } catch (error) {
          console.error('[Deep Link] Error handling OAuth callback:', error);
        }
      }
    });

    return () => subscription.remove();
  }, [router]);

  useEffect(() => {
    // Send a test event to verify PostHog is working
    console.log('=== PostHog Debug Info ===');
    console.log('PostHog instance:', posthog ? 'Initialized' : 'Not initialized');

    if (posthog) {
      console.log('Sending test event to PostHog...');
      try {
        posthog.capture('app_started', {
          timestamp: new Date().toISOString(),
          platform: 'mobile',
          test: true
        });
        console.log('✅ Test event sent successfully!');

        // Also try screen tracking
        posthog.screen('welcome_screen', {
          manual_test: true
        });
        console.log('✅ Screen event sent successfully!');
      } catch (error) {
        console.error('❌ Error sending PostHog events:', error);
      }
    } else {
      console.log('⚠️ PostHog not initialized yet');
    }
    console.log('=========================')

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
  }, [posthog]);

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
  useEffect(() => {
    console.log('=== PostHog Provider Config ===');
    console.log('API Key:', POSTHOG_API_KEY ? `${POSTHOG_API_KEY.substring(0, 15)}...` : 'NOT SET');
    console.log('Host:', POSTHOG_HOST);
    console.log('===============================');

    // Send initial event
    posthog.capture('app_started');
  }, []);

  return (
    <PostHogProvider client={posthog}>
      <RootLayoutNav />
    </PostHogProvider>
  );
}