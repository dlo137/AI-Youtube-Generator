import { View, Text, StyleSheet, TouchableOpacity, Image, Animated, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { useState, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export default function WelcomeScreen() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;

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

  const checkSession = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        // User is already logged in, redirect to main app
        router.replace('/(tabs)/generate');
      } else {
        setIsCheckingAuth(false);
      }
    } catch (error) {
      console.error('Error checking session:', error);
      setIsCheckingAuth(false);
    }
  };

  const handleGetStarted = () => {
    try {
      Animated.timing(slideAnim, {
        toValue: -1,
        duration: 250,
        useNativeDriver: true,
      }).start(() => {
        try {
          if (step === 1) {
            setStep(2);
          } else if (step === 2) {
            setStep(3);
          } else {
            router.push('/signup');
          }
          slideAnim.setValue(1);
          Animated.timing(slideAnim, {
            toValue: 0,
            duration: 250,
            useNativeDriver: true,
          }).start();
        } catch (error) {
          console.error('Animation callback error:', error);
        }
      });
    } catch (error) {
      console.error('Animation start error:', error);
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

      <View style={styles.content}>
        <View style={styles.imageContainer}>
          <Animated.View
            style={[
              styles.glow,
              {
                opacity: glowAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.5, 1],
                }),
                transform: [
                  { translateX },
                  {
                    scale: glowAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.9, 1],
                    }),
                  },
                ],
              },
            ]}
          />
          <Animated.Image
            source={require('../assets/homescreen.png')}
            style={[
              styles.heroImage,
              {
                transform: [{ translateX }],
              },
            ]}
            resizeMode="contain"
          />
        </View>

        <Animated.Text
          style={[
            styles.title,
            {
              transform: [{ translateX }],
            },
          ]}
        >
          {step === 1 ? 'Edit Faster. Upload Sooner. Grow Quicker.' : step === 2 ? 'Save Your Best Ideas \n Before They Disappear' : 'Unlock the Secret Behind Every Viral Thumbnail'}
        </Animated.Text>

        <TouchableOpacity
          style={styles.getStartedButton}
          onPress={handleGetStarted}
        >
          <Text style={styles.getStartedButtonText}>Continue</Text>
        </TouchableOpacity>

        <View style={styles.loginContainer}>
          <Text style={styles.loginText}>Already got an account? </Text>
          <TouchableOpacity onPress={() => router.push('/login')}>
            <Text style={styles.loginLink}>Log in</Text>
          </TouchableOpacity>
        </View>
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
    justifyContent: 'space-evenly',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  imageContainer: {
    position: 'relative',
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
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
    marginBottom: 20,
    zIndex: 1,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: TEXT,
    marginBottom: 24,
    textAlign: 'center',
  },
  getStartedButton: {
    backgroundColor: '#1e40af',
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
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
});