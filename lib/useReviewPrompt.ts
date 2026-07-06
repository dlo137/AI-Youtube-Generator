import { useCallback } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as StoreReview from 'expo-store-review';

const KEYS = {
  totalSaved:    'review.totalSavedThumbnails',
  sessions:      'review.appSessions',
  lastPromptAt:  'review.lastReviewPromptAt',
};

const MIN_SAVES    = 3;    // must have saved at least this many thumbnails
const MIN_SESSIONS = 2;    // must have opened the app at least this many times
const COOLDOWN_MS  = 14 * 24 * 60 * 60 * 1000; // 14 days between prompts

/**
 * Increments the app session counter. Call once on app launch (e.g. in the
 * root layout's useEffect). Safe to call multiple times — only the first call
 * per JS runtime lifetime matters.
 */
export async function incrementAppSessions(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.sessions);
    const next = (parseInt(raw ?? '0', 10) || 0) + 1;
    await AsyncStorage.setItem(KEYS.sessions, String(next));
  } catch {
    // Non-critical — never block the app over a session counter failure
  }
}

/**
 * Returns a `requestReviewAfterSave` function. Call it after every successful
 * camera roll save; it handles all gating internally and is a no-op when the
 * conditions are not met.
 *
 * Gating rules (all must pass):
 *   1. totalSavedThumbnails >= 3   (not first save — user has real value)
 *   2. appSessions >= 2            (not a brand-new install)
 *   3. Last prompt was > 14 days ago (or never shown)
 *   4. StoreReview.isAvailableAsync() returns true (iOS StoreKit available)
 */
export function useReviewPrompt() {
  const requestReviewAfterSave = useCallback(async () => {
    try {
      // ── 1. Increment and read save count ──────────────────────────────────
      const rawSaves = await AsyncStorage.getItem(KEYS.totalSaved);
      const prevSaves = parseInt(rawSaves ?? '0', 10) || 0;
      const newSaves = prevSaves + 1;
      await AsyncStorage.setItem(KEYS.totalSaved, String(newSaves));

      // ── 2. Gate: minimum saves ────────────────────────────────────────────
      if (newSaves < MIN_SAVES) {
        console.log(`[Review] Skipped — only ${newSaves}/${MIN_SAVES} saves`);
        return;
      }

      // ── 3. Gate: minimum sessions ─────────────────────────────────────────
      const rawSessions = await AsyncStorage.getItem(KEYS.sessions);
      const sessions = parseInt(rawSessions ?? '0', 10) || 0;
      if (sessions < MIN_SESSIONS) {
        console.log(`[Review] Skipped — only ${sessions}/${MIN_SESSIONS} sessions`);
        return;
      }

      // ── 4. Gate: cooldown ─────────────────────────────────────────────────
      const rawLastAt = await AsyncStorage.getItem(KEYS.lastPromptAt);
      if (rawLastAt) {
        const elapsed = Date.now() - parseInt(rawLastAt, 10);
        if (elapsed < COOLDOWN_MS) {
          const daysLeft = Math.ceil((COOLDOWN_MS - elapsed) / (24 * 60 * 60 * 1000));
          console.log(`[Review] Skipped — cooldown active (${daysLeft} days remaining)`);
          return;
        }
      }

      // ── 5. Gate: StoreKit availability ────────────────────────────────────
      // On Android, isAvailableAsync() returns false on devices without Play Store.
      // On iOS simulator it also returns false — only fires on real devices.
      const available = await StoreReview.isAvailableAsync();
      if (!available) {
        console.log('[Review] Skipped — StoreReview not available on this device');
        return;
      }

      // ── 6. Request review ─────────────────────────────────────────────────
      console.log('[Review] All gates passed — requesting review');
      await StoreReview.requestReview();

      // Record the timestamp so the cooldown starts now
      await AsyncStorage.setItem(KEYS.lastPromptAt, String(Date.now()));
    } catch (err) {
      // Never surface a review prompt error to the user
      console.warn('[Review] requestReviewAfterSave error:', err);
    }
  }, []);

  return { requestReviewAfterSave };
}
