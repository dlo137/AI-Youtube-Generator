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

        // Try to extract code from URL first
        const code = urlParams.get('code');
        console.log("[Auth Callback] Code present:", !!code);

        if (!code && !isPasswordReset) {
          console.error("[Auth Callback] No authorization code in callback URL");
          // Check for direct tokens (legacy flow)
          const accessToken = hashParams.get('access_token');
          if (accessToken) {
            console.log("[Auth Callback] Found access token in hash, attempting direct session");
            const refreshToken = hashParams.get('refresh_token');
            if (refreshToken) {
              const { error: setSessionError } = await supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken,
              });
              if (!setSessionError) {
                console.log("[Auth Callback] Session set successfully, routing to app");
                router.replace("/(tabs)/generate");
                return;
              }
            }
          }
          router.replace("/login");
          return;
        }

        // Exchange the OAuth/magic link code for a session
        console.log("[Auth Callback] Exchanging code for session...");
        const { data, error } = await supabase.auth.exchangeCodeForSession(code || incoming);

        if (error) {
          console.error("[Auth Callback] Exchange error:", error);
          console.error("[Auth Callback] Error details:", JSON.stringify(error));

          // If there's an error but it's a password reset, still try to navigate
          if (isPasswordReset) {
            console.log("[Auth Callback] Error during password reset, redirecting anyway");
            router.replace("/reset-password");
            return;
          }

          // Otherwise go to login
          console.log("[Auth Callback] Redirecting to login due to exchange error");
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