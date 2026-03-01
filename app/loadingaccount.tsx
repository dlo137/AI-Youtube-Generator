import { View, Text, StyleSheet, Animated } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import IAPService from '../services/IAPService';

export default function LoadingAccountScreen() {
  const router = useRouter();
  const [percent, setPercent] = useState(0);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const destinationRef = useRef<string | null>(null);

  // Redirect logic (DB-driven, no time heuristics):
  //   entitlement = 'pro' | 'grandfather' → go to app
  //   entitlement = 'free' + has_seen_paywall = false → show subscription screen once
  //   entitlement = 'free' + has_seen_paywall = true  → go to app (free tier limits enforced in-app)
  useEffect(() => {
    const checkUser = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          destinationRef.current = 'subscriptionScreen';
          return;
        }
        const { data: profile } = await supabase
          .from('profiles')
          .select('has_seen_paywall, entitlement, is_trial_version, trial_end_date, is_pro_version')
          .eq('id', user.id)
          .single();

        const entitlement = profile?.entitlement ?? 'free';
        const hasSeenPaywall = profile?.has_seen_paywall ?? false;

        // If trial has expired, silently check if the subscription auto-renewed
        const trialExpired =
          profile?.is_trial_version &&
          profile?.trial_end_date &&
          new Date(profile.trial_end_date) < new Date();

        if (trialExpired) {
          // Try a silent restore — if Apple/Google already billed them, this
          // will find the active purchase, call validate-receipt with
          // source='restore', and flip is_trial_version to false in the profile.
          let restored = false;
          try {
            if (IAPService.isAvailable()) {
              const results = await IAPService.restorePurchases();
              restored = results.length > 0;
            }
          } catch {
            // No active subscription found — fall through to paywall
          }
          destinationRef.current = restored ? '/(tabs)/generate' : 'subscriptionScreen';
        } else if (entitlement === 'pro' || entitlement === 'grandfather') {
          destinationRef.current = '/(tabs)/generate';
        } else if (!hasSeenPaywall) {
          destinationRef.current = 'subscriptionScreen';
        } else {
          destinationRef.current = '/(tabs)/generate';
        }
      } catch {
        destinationRef.current = 'subscriptionScreen';
      }
    };
    checkUser();
  }, []);

  useEffect(() => {
    // Animate progress bar
    Animated.timing(progressAnim, {
      toValue: 1,
      duration: 5000,
      useNativeDriver: false,
    }).start();

    // Update percent number
    const interval = setInterval(() => {
      setPercent((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(() => {
            const dest = destinationRef.current ?? 'subscriptionScreen';
            if (dest === '/(tabs)/generate') {
              router.replace('/(tabs)/generate');
            } else {
              router.push('subscriptionScreen' as any);
            }
          }, 500);
          return 100;
        }
        return prev + 2;
      });
    }, 100);

    return () => clearInterval(interval);
  }, []);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <View style={styles.content}>
        <Text style={styles.percent}>{percent}%</Text>
        <Text style={styles.subtitle}>Setting up your generator</Text>

        <View style={styles.progressBarContainer}>
          <Animated.View
            style={[
              styles.progressBar,
              {
                width: progressWidth,
              },
            ]}
          />
        </View>

        <Text style={styles.statusText}>Customizing your profile</Text>
      </View>
    </View>
  );
}

const BG = '#0b0f14';
const TEXT = '#e7ebf0';
const MUTED = '#8a9099';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  percent: {
    fontSize: 64,
    fontWeight: 'bold',
    color: TEXT,
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 18,
    color: MUTED,
    marginBottom: 48,
    textAlign: 'center',
  },
  progressBarContainer: {
    width: '80%',
    height: 8,
    backgroundColor: '#232932',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#1e40af',
    borderRadius: 4,
  },
  statusText: {
    fontSize: 12,
    color: MUTED,
    marginTop: 12,
    textAlign: 'center',
  },
});