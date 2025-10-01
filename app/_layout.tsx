import '../polyfills';
import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { Alert } from 'react-native';

export default function RootLayout() {
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