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

        // Exchange the OAuth/magic link code for a session
        const { data, error } = await supabase.auth.exchangeCodeForSession(incoming);

        if (error) {
          console.error("Auth exchange error:", error);
        } else {
          console.log("Auth exchange successful:", data);
        }

        // You now have a session in supabase.auth.
      } catch (e) {
        console.log("exchange error", e);
      } finally {
        router.replace("/(tabs)/generate"); // go to the main app
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