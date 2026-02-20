import { View, Text, StyleSheet, TouchableOpacity, Image, Animated, ActivityIndicator, Dimensions, Platform } from 'react-native';
import MaskedView from '@react-native-masked-view/masked-view';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { useState, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import FloatingParticles from '../src/components/FloatingParticles';
import ConfettiCannon from 'react-native-confetti-cannon';
import * as Haptics from 'expo-haptics';
import TimeChart from '../src/components/TimeChart';
import { trackScreenView } from '../lib/posthog';
import { LinearGradient } from 'expo-linear-gradient';

const GradientText = ({ children, style }: { children: string; style?: any }) => (
  <MaskedView
    maskElement={<Text style={[style, { backgroundColor: 'transparent' }]}>{children}</Text>}
  >
    <LinearGradient
      colors={['#93c5fd', '#3b82f6']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
    >
      <Text style={[style, { opacity: 0 }]}>{children}</Text>
    </LinearGradient>
  </MaskedView>
);

export default function WelcomeScreen() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [selectedStruggles, setSelectedStruggles] = useState<string[]>([]);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const confettiRef = useRef(null);
  const confettiLeftRef = useRef(null);
  const confettiFarLeftRef = useRef(null);
  const confettiDelayed1 = useRef(null);
  const confettiDelayed2 = useRef(null);

  // Check for existing session on mount
  useEffect(() => {
    checkSession();

    // Start pulsing glow animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 0,
          duration: 1200,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  // Trigger haptic feedback when confetti starts on step 1
  useEffect(() => {
    if (step === 1 && !isCheckingAuth) {
      // Create a longer, deeper vibration pattern
      const triggerHaptics = async () => {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 100);
        setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium), 200);
      };
      triggerHaptics();
    }
  }, [step, isCheckingAuth]);

  // Track onboarding steps
  useEffect(() => {
    if (!isCheckingAuth) {
      trackScreenView(`Onboarding Step ${step}`);
    }
  }, [step, isCheckingAuth]);

  const checkSession = async () => {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      
      // Handle refresh token errors by clearing the session
      if (error?.message?.includes('Refresh Token')) {
        console.log('Refresh token invalid, clearing session');
        await supabase.auth.signOut();
        setIsCheckingAuth(false);
        return;
      }

      if (session) {
        // User is already logged in, redirect to main app
        router.replace('/(tabs)/generate');
      } else {
        setIsCheckingAuth(false);
      }
    } catch (error: any) {
      console.error('Session check error:', error);
      // On error, show login screen instead of blocking
      setIsCheckingAuth(false);
    }
  };

  const toggleStruggle = (struggle: string) => {
    if (selectedStruggles.includes(struggle)) {
      setSelectedStruggles(selectedStruggles.filter(s => s !== struggle));
    } else {
      setSelectedStruggles([...selectedStruggles, struggle]);
    }
  };

  const handleGetStarted = () => {
    try {
      // Fade out and slide out simultaneously
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -1,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        })
      ]).start(() => {
        try {
          // Update step while everything is still faded out
          if (step === 1) {
            setStep(2);
          } else if (step === 2) {
            setStep(3);
          } else {
            router.push('/signup');
            return;
          }
          
          // Wait for React to render the new step, then reset position and fade in
          requestAnimationFrame(() => {
            slideAnim.setValue(0);
            Animated.timing(fadeAnim, {
              toValue: 1,
              duration: 300,
              useNativeDriver: true,
            }).start();
          });
        } catch (error) {
          // Animation callback error
        }
      });
    } catch (error) {
      // Fallback navigation
      router.push('/signup');
    }
  };

  const translateX = slideAnim.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: [-500, 0, 500],
  });

  // Show loading spinner while checking auth
  if (isCheckingAuth) {
    return (
      <View style={styles.container}>
        <StatusBar style="light" />
        <View style={[styles.content, { justifyContent: 'center' }]}>
          <ActivityIndicator size="large" color="#6366f1" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Floating Particles Background */}
      <FloatingParticles />

      <View style={styles.content}>
        {step === 2 ? (
          <Animated.View style={{ transform: [{ translateX }], opacity: fadeAnim, width: '100%', gap: 16 }}>
            <View>
              <Text style={styles.title}>
                Save instantly.{'\n'}Save 85% of your time & cost.
              </Text>
              <Text style={styles.subtitle}>
                Grow your channel faster
              </Text>
            </View>
            <TimeChart />
          </Animated.View>
        ) : step === 3 ? (
          <Animated.View style={{ transform: [{ translateX }], opacity: fadeAnim, width: '100%', gap: 24, alignItems: 'center' }}>
            <View style={{ width: '100%' }}>
              <Text style={[styles.title, { textAlign: 'center', fontSize: 22, paddingHorizontal: 16 }]}>Used by creators who value</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'nowrap', justifyContent: 'center', gap: 6, alignItems: 'center' }}>
                <GradientText style={[styles.title, { fontSize: 22 }]}>speed</GradientText>
                <Text style={[styles.title, { fontSize: 22 }]}>,</Text>
                <GradientText style={[styles.title, { fontSize: 22 }]}>quality</GradientText>
                <Text style={[styles.title, { fontSize: 22 }]}>, and</Text>
                <GradientText style={[styles.title, { fontSize: 22 }]}>consistency</GradientText>
              </View>
              <Text style={[styles.subtitle, { textAlign: 'center' }]}>
                Join creators in working faster, not harder
              </Text>
            </View>

            <View style={styles.socialProofContainer}>
              <View style={styles.statCard}>
                <Text style={styles.statNumber}>10K+</Text>
                <Text style={styles.statLabel}>Thumbnails Generated </Text>
              </View>
              <View style={[styles.statCard, { flex: 2 }]}>
                <Text style={[styles.statNumber, { fontSize: 20 }]}>5 Star Rating</Text>
                <Text style={[styles.statLabel, { fontSize: 20, marginTop: 8 }]}>☆ ☆ ☆ ☆ ☆</Text>
              </View>
            </View>

            <View style={styles.testimonialCard}>
              <Text style={styles.testimonialText}>
                "Designed to help creators produce click-worthy thumbnails in seconds, without any design skills."
              </Text>
            </View>
          </Animated.View>
        ) : step === 1 ? (
          <Animated.View style={{ transform: [{ translateX }], opacity: fadeAnim, width: '100%', alignItems: 'center' }}>
            <View style={styles.imageContainer}>
              <View style={styles.confettiWrapper}>
                <ConfettiCannon
                  ref={confettiRef}
                  count={150}
                  origin={{ x: Dimensions.get('window').width / 2, y: -300 }}
                  autoStart={true}
                  fadeOut={true}
                  explosionSpeed={700}
                  fallSpeed={4000}
                  colors={['#1e40af', '#3b82f6', '#60a5fa', '#93c5fd', '#dbeafe', '#ffffff']}
                />
                <ConfettiCannon
                  ref={confettiLeftRef}
                  count={100}
                  origin={{ x: Dimensions.get('window').width * 0.25, y: -300 }}
                  autoStart={true}
                  fadeOut={true}
                  explosionSpeed={700}
                  fallSpeed={4000}
                  colors={['#1e40af', '#3b82f6', '#60a5fa', '#93c5fd', '#dbeafe', '#ffffff']}
                />
                <ConfettiCannon
                  ref={confettiFarLeftRef}
                  count={80}
                  origin={{ x: 0, y: -300 }}
                  autoStart={true}
                  fadeOut={true}
                  explosionSpeed={600}
                  fallSpeed={4000}
                  colors={['#1e40af', '#3b82f6', '#60a5fa', '#93c5fd', '#dbeafe', '#ffffff']}
                />
                <ConfettiCannon
                  ref={confettiDelayed1}
                  count={150}
                  origin={{ x: Dimensions.get('window').width / 2, y: -300 }}
                  autoStart={true}
                  autoStartDelay={1000}
                  fadeOut={true}
                  explosionSpeed={700}
                  fallSpeed={4000}
                  colors={['#1e40af', '#3b82f6', '#60a5fa', '#93c5fd', '#dbeafe', '#ffffff']}
                />
                <ConfettiCannon
                  ref={confettiDelayed2}
                  count={140}
                  origin={{ x: Dimensions.get('window').width * 0.65, y: -300 }}
                  autoStart={true}
                  autoStartDelay={2000}
                  fadeOut={true}
                  explosionSpeed={680}
                  fallSpeed={4000}
                  colors={['#1e40af', '#3b82f6', '#60a5fa', '#93c5fd', '#dbeafe', '#ffffff']}
                />
              </View>
              <Image
                source={require('../assets/home.png')}
                style={styles.heroImage}
                resizeMode="contain"
              />
            </View>
            <Text style={styles.screenTitle}>
              Thumbnail Designs{'\n'}Made Easy
            </Text>
          </Animated.View>
        ) : null}

        <TouchableOpacity
          style={[styles.getStartedButton, step === 3 && { marginTop: 40 }]}
          onPress={handleGetStarted}
        >
          <Text style={styles.getStartedButtonText}>
            {step === 1 ? "Get Started" : step === 3 ? "Start Creating" : "Continue"}
          </Text>
        </TouchableOpacity>

        {step === 3 ? (
          <View style={styles.loginContainer}>
            <Text style={styles.loginText}>Built for creators, not agencies</Text>
          </View>
        ) : (
          <View style={styles.loginContainer}>
            <Text style={styles.loginText}>Already got an account? </Text>
            <TouchableOpacity onPress={() => router.push('/login')}>
              <Text style={styles.loginLink}>Sign in</Text>
            </TouchableOpacity>
          </View>
        )}
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
    paddingVertical: 20,
    gap: 20,
  },
  imageContainer: {
    position: 'relative',
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confettiWrapper: {
    position: 'absolute',
    top: -200,
    left: -25,
    right: -25,
    bottom: 0,
    zIndex: 9999,
  },
  glow: {
    position: 'absolute',
    width: '55%',
    height: 400,
    backgroundColor: '#1e3a8a',
    borderRadius: 200,
    shadowColor: '#1e3a8a',
    shadowOffset: {
      width: 0,
      height: 0,
    },
    shadowOpacity: 1,
    shadowRadius: 200,
    elevation: 40,
  },
  heroImage: {
    width: '100%',
    height: 600,
    marginTop: -30,
    marginBottom: -30,
    zIndex: 10,
  },
  iconImage: {
    width: 180,
    height: 180,
    marginTop: 0,
    marginBottom: 0,
    alignSelf: 'center',
  },
  screenTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: TEXT,
    marginBottom: 6,
    textAlign: 'center',
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: TEXT,
    textAlign: 'left',
  },
  subtitle: {
    fontSize: 14,
    color: MUTED,
    textAlign: 'left',
    marginTop: 8,
  },
  getStartedButton: {
    backgroundColor: '#1e40af',
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 0,
    shadowColor: '#1e40af',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    width: '90%',
  },
  getStartedButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  loginContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loginText: {
    fontSize: 14,
    color: MUTED,
  },
  loginLink: {
    fontSize: 14,
    color: '#93c5fd',
    fontWeight: '600',
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1f26',
    padding: 18,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#2a3340',
    gap: 12,
  },
  optionButtonSelected: {
    borderColor: '#3b82f6',
    backgroundColor: '#1e2a3a',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#4b5563',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  checkboxSelected: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  checkmark: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  optionText: {
    fontSize: 16,
    color: TEXT,
    fontWeight: '500',
  },
  socialProofContainer: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#1a1f26',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2a3340',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#3b82f6',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: MUTED,
    textAlign: 'center',
  },
  testimonialCard: {
    width: '100%',
    backgroundColor: '#1a1f26',
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a3340',
    marginTop: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  testimonialText: {
    fontSize: 15,
    color: TEXT,
    fontStyle: 'italic',
    lineHeight: 22,
    textAlign: 'center',
  },
  testimonialAuthor: {
    fontSize: 14,
    color: '#3b82f6',
    fontWeight: '600',
  },
  chartCard: {
    backgroundColor: '#1a1f26',
    borderRadius: 20,
    padding: 20,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
    opacity: 0.75,
  },
  barChartContainer: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: 20,
    paddingHorizontal: 0,
  },
  barWrapper: {
    flex: 1,
    alignItems: 'center',
    gap: 12,
    maxWidth: '48%',
  },
  barLabel: {
    fontSize: 14,
    color: TEXT,
    fontWeight: '600',
    textAlign: 'center',
  },
  barSubtext: {
    fontSize: 13,
    color: '#e5e7eb',
    textAlign: 'center',
    marginTop: 16,
  },
  barBackground: {
    width: '100%',
    height: 250,
    backgroundColor: '#0f1419',
    borderRadius: 12,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  barFill: {
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
  },
  barFillRed: {
    backgroundColor: '#ef4444',
  },
  barFillBlue: {
    backgroundColor: '#3b82f6',
  },
  barValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffffff',
  },
});