import '../polyfills';
import { Stack } from 'expo-router';

export default function RootLayout() {
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
    </Stack>
  );
}