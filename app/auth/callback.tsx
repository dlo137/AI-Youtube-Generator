import { useEffect } from "react";
import { router } from "expo-router";
import * as Linking from "expo-linking";
import { supabase } from "../../lib/supabase";

export default function AuthCallback() {
  useEffect(() => {
    const handle = async (url?: string | null) => {
      try {
        const incoming = url ?? (await Linking.getInitialURL());
        if (!incoming) {
          console.log("[Auth Callback] No URL received");
          return;
        }

        console.log("[Auth Callback] Received URL:", incoming);

        // Parse URL to check parameters
        const parsedUrl = new URL(incoming);
        const urlParams = parsedUrl.searchParams;
        const hashParams = new URLSearchParams(parsedUrl.hash.substring(1));

        // Check for password reset indicators
        const typeParam = urlParams.get('type') || hashParams.get('type');
        const isPasswordReset = typeParam === 'recovery' || incoming.includes('type=recovery');

        console.log("[Auth Callback] Type parameter:", typeParam);
        console.log("[Auth Callback] Is password reset:", isPasswordReset);

        // Exchange the OAuth/magic link code for a session
        const { data, error } = await supabase.auth.exchangeCodeForSession(incoming);

        if (error) {
          console.error("[Auth Callback] Exchange error:", error);

          // If there's an error but it's a password reset, still try to navigate
          if (isPasswordReset) {
            console.log("[Auth Callback] Error during password reset, redirecting anyway");
            router.replace("/reset-password");
            return;
          }

          // Otherwise go to login
          router.replace("/login");
          return;
        }

        console.log("[Auth Callback] Exchange successful");

        // Double-check for password reset using session data
        const sessionEvent = data?.session?.user?.aud;
        const isRecovery = sessionEvent === 'recovery' || isPasswordReset;

        console.log("[Auth Callback] Session aud:", sessionEvent);
        console.log("[Auth Callback] Final isRecovery:", isRecovery);

        // Route based on the type of authentication
        if (isRecovery) {
          console.log("[Auth Callback] Routing to reset-password");
          router.replace("/reset-password");
        } else {
          console.log("[Auth Callback] Routing to main app");
          router.replace("/(tabs)/generate");
        }
      } catch (e) {
        console.error("[Auth Callback] Unexpected error:", e);

        // Try to detect if this was meant to be a password reset from URL
        try {
          const incoming = url ?? (await Linking.getInitialURL());
          if (incoming && (incoming.includes('type=recovery') || incoming.includes('recovery'))) {
            console.log("[Auth Callback] Detected recovery in URL despite error, routing to reset-password");
            router.replace("/reset-password");
            return;
          }
        } catch (err) {
          console.error("[Auth Callback] Error in fallback check:", err);
        }

        // Default to login on error
        router.replace("/login");
      }
    };

    // Handle initial open
    handle();

    // Also handle future opens while app is running
    const sub = Linking.addEventListener("url", (e) => handle(e.url));
    return () => sub.remove();
  }, []);

  return null;
}