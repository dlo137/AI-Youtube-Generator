import { View, Text, StyleSheet, TouchableOpacity, Image, Animated } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { useState, useRef, useEffect } from 'react';

export default function WelcomeScreen() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const slideAnim = useRef(new Animated.Value(0)).current;

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

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <View style={styles.content}>
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

        <Animated.Text
          style={[
            styles.title,
            {
              transform: [{ translateX }],
            },
          ]}
        >
          {step === 1 ? 'Youtube Thumbnails\nMade Easy' : step === 2 ? 'Save Your Perfect Thumbnail' : 'Tweak & Edit Easier'}
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
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  heroImage: {
    width: '100%',
    height: 650,
    marginTop: -80,
    marginBottom: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: TEXT,
    marginBottom: 24,
    textAlign: 'center',
  },
  getStartedButton: {
    backgroundColor: '#6366f1',
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#6366f1',
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
    color: '#6366f1',
    fontWeight: '600',
  },
});