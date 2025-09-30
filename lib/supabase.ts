import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Linking from "expo-linking";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

// This is the URL Supabase should bounce back to after OAuth/magic link.
export const redirectTo = Linking.createURL("/auth/callback"); // -> thumbnailgen://auth/callback

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