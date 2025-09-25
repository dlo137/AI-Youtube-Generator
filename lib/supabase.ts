import "../polyfills";
import Constants from "expo-constants";

const SUPABASE_URL =
  Constants.expoConfig?.extra?.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY =
  Constants.expoConfig?.extra?.SUPABASE_ANON_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

// Debug logging to check if env vars are loaded
console.log('=== SUPABASE CONFIG DEBUG ===');
console.log('SUPABASE_URL:', SUPABASE_URL ? 'SET' : 'NOT SET');
console.log('SUPABASE_ANON_KEY:', SUPABASE_ANON_KEY ? 'SET' : 'NOT SET');
console.log('URL starts with:', SUPABASE_URL?.substring(0, 20));
console.log('================================');

// Simplified Supabase client for edge functions only
class SimpleSupabaseClient {
  private url: string;
  private key: string;

  constructor(url: string, key: string) {
    if (!url || url.includes('undefined') || !url.startsWith('http')) {
      throw new Error('EXPO_PUBLIC_SUPABASE_URL is not configured correctly. Please check your .env file.');
    }
    if (!key || key.includes('undefined') || key.length < 20) {
      throw new Error('EXPO_PUBLIC_SUPABASE_ANON_KEY is not configured correctly. Please check your .env file.');
    }

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