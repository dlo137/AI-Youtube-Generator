import "../polyfills";
import Constants from "expo-constants";

const SUPABASE_URL =
  Constants.expoConfig?.extra?.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY =
  Constants.expoConfig?.extra?.SUPABASE_ANON_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

// Simplified Supabase client for edge functions only
class SimpleSupabaseClient {
  private url: string;
  private key: string;

  constructor(url: string, key: string) {
    this.url = url;
    this.key = key;
  }

  functions = {
    invoke: async (functionName: string, options: { body?: any } = {}) => {
      try {
        const response = await fetch(`${this.url}/functions/v1/${functionName}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.key}`,
            'apikey': this.key,
          },
          body: options.body ? JSON.stringify(options.body) : undefined,
        });

        if (!response.ok) {
          const errorText = await response.text();
          return {
            data: null,
            error: {
              message: `Function call failed: ${response.status} ${response.statusText}`,
              details: errorText
            }
          };
        }

        const data = await response.json();
        return { data, error: null };
      } catch (error) {
        return {
          data: null,
          error: {
            message: 'Network error',
            details: error instanceof Error ? error.message : 'Unknown error'
          }
        };
      }
    }
  };
}

export const supabase = new SimpleSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY);