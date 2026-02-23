import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Linking from "expo-linking";
import Constants from "expo-constants";
import { Platform } from "react-native";

const SUPABASE_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_SUPABASE_URL ||
  (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_SUPABASE_URL) || '';
const SUPABASE_ANON_KEY = Constants.expoConfig?.extra?.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_SUPABASE_ANON_KEY) || '';

// Debug logging for environment variables
console.log('[Supabase] URL loaded:', SUPABASE_URL ? SUPABASE_URL.substring(0, 30) + '...' : 'EMPTY');
console.log('[Supabase] Key loaded:', SUPABASE_ANON_KEY ? 'Yes (length: ' + SUPABASE_ANON_KEY.length + ')' : 'EMPTY');

// This is the URL Supabase should bounce back to after OAuth/magic link.
// Always use custom scheme - works in development and production
const scheme = Constants.expoConfig?.scheme || 'thumbnailgen';
export const redirectTo = `${scheme}://auth/callback`;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, // RN app, not web
    flowType: "pkce",          // required for mobile OAuth
    storageKey: 'supabase.auth.token', // Custom storage key for persistence
  },
});

// Helper function to check and clear bad tokens.
export const checkAuthErrors = async () => {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();

    if (error?.message?.includes('audience') || 
        error?.message?.includes('id_token') ||
        error?.message?.includes('Refresh Token')) {
      console.log('Invalid or expired token detected, clearing session...');
      await supabase.auth.signOut();
      await AsyncStorage.removeItem('supabase.auth.token');
      return false;
    }

    return !!session;
  } catch (error) {
    console.error('Error checking auth:', error);
    // On any error getting session, try to clear it to prevent loops
    try {
      await supabase.auth.signOut();
      await AsyncStorage.removeItem('supabase.auth.token');
    } catch (clearError) {
      console.error('Error clearing session:', clearError);
    }
    return false;
  }
};

// Initialize auth state listener on app start
export const initializeAuth = () => {
  supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_OUT' || !session) {
      // Clear storage when signed out
      await AsyncStorage.removeItem('supabase.auth.token');
    }
  });
};