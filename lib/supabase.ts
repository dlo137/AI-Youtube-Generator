import "../polyfills";
import { createClient } from "@supabase/supabase-js";
import Constants from "expo-constants";

const SUPABASE_URL =
  Constants.expoConfig?.extra?.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY =
  Constants.expoConfig?.extra?.SUPABASE_ANON_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: {
      getItem: (key: string) => Promise.resolve(null),
      setItem: (key: string, value: string) => Promise.resolve(),
      removeItem: (key: string) => Promise.resolve(),
    },
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  realtime: {
    // Disable realtime to avoid WebSocket issues in React Native
    params: {
      eventsPerSecond: 0,
    },
  },
  global: {
    // Disable realtime globally
    headers: {
      'X-Client-Info': 'supabase-js-react-native',
    },
  },
});