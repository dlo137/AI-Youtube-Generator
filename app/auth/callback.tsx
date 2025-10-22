import { useEffect } from "react";
import { router } from "expo-router";
import * as Linking from "expo-linking";
import { supabase } from "../../lib/supabase";

export default function AuthCallback() {
  useEffect(() => {
    const handle = async (url?: string | null) => {
      try {
        const incoming = url ?? (await Linking.getInitialURL());
        if (!incoming) return;

        console.log("Auth callback received URL:", incoming);

        // Check if this is a password reset flow by looking at the URL type parameter
        const isPasswordReset = incoming.includes('type=recovery');

        console.log("Is password reset:", isPasswordReset);

        // Exchange the OAuth/magic link code for a session
        const { data, error } = await supabase.auth.exchangeCodeForSession(incoming);

        if (error) {
          console.error("Auth exchange error:", error);
        } else {
          console.log("Auth exchange successful:", data);

          // Also check the session event type as a fallback
          const sessionEvent = data?.session?.user?.user_metadata?.event_type;
          console.log("Session event type:", sessionEvent);
        }

        // Route based on the type of authentication
        if (isPasswordReset) {
          // For password reset flows, go to the reset password screen
          router.replace("/reset-password");
        } else {
          // For regular OAuth/magic links, go to the main app
          router.replace("/(tabs)/generate");
        }
      } catch (e) {
        console.log("exchange error", e);
        // Default to main app on error
        router.replace("/(tabs)/generate");
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