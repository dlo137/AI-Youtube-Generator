import { useEffect, useRef } from 'react';
import { usePathname, useSegments } from 'expo-router';
import { usePostHog } from 'posthog-react-native';

export function usePostHogScreenTracking() {
  const pathname = usePathname();
  const segments = useSegments();
  const posthog = usePostHog();
  const lastPathname = useRef<string | null>(null);

  useEffect(() => {
    // Only track if pathname has changed
    if (pathname && pathname !== lastPathname.current) {
      // Track screen view
      posthog?.screen(pathname, {
        segments: segments.join('/'),
      });

      lastPathname.current = pathname;
    }
  }, [pathname, segments, posthog]);
}
