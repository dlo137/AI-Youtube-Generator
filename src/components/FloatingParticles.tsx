import React, { useEffect, useState, useMemo } from 'react';
import { View, Animated, StyleSheet, Dimensions } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface Particle {
  x: Animated.Value;
  y: Animated.Value;
  opacity: Animated.Value;
  scale: Animated.Value;
  color: string;
  duration: number;
  delay: number;
  initialX: number;
  initialY: number;
  initialScale: number;
}

const COLORS = [
  '#1e40af', // Blue
  '#3b82f6', // Lighter Blue
  '#6366f1', // Purple-Blue
  '#8b5cf6', // Purple
  '#06b6d4', // Cyan
  '#ffffff', // White
  '#93c5fd', // Light Blue
];

const FloatingParticles: React.FC = () => {
  // Create particles once using useMemo
  const particles = useMemo(() => {
    return Array.from({ length: 15 }, (_, i) => {
      const startX = Math.random() * SCREEN_WIDTH;
      const startY = Math.random() * SCREEN_HEIGHT;
      const startScale = 0.5 + Math.random() * 0.5;
      const duration = 3000 + Math.random() * 4000; // 3-7 seconds
      const delay = i * 150; // Staggered start for each particle

      return {
        x: new Animated.Value(startX),
        y: new Animated.Value(startY),
        opacity: new Animated.Value(0),
        scale: new Animated.Value(startScale),
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        duration,
        delay,
        initialX: startX,
        initialY: startY,
        initialScale: startScale,
      };
    });
  }, []);

  useEffect(() => {
    // Start animations immediately
    particles.forEach((particle) => {
      animateParticle(particle);
    });
  }, [particles]);

  const animateParticle = (particle: Particle) => {
    // Use stored initial values
    const initialX = particle.initialX;
    const initialY = particle.initialY;
    const initialScale = particle.initialScale;

    const moveX = (Math.random() - 0.5) * 100; // Random horizontal movement
    const moveY = -50 - Math.random() * 150; // Upward movement
    const targetOpacity = 0.4 + Math.random() * 0.3;

    // Opacity fade in/out animation
    Animated.loop(
      Animated.sequence([
        // Fade in
        Animated.timing(particle.opacity, {
          toValue: targetOpacity,
          duration: particle.duration * 0.2,
          delay: particle.delay,
          useNativeDriver: true,
        }),
        // Stay visible
        Animated.delay(particle.duration * 0.3),
        // Fade out
        Animated.timing(particle.opacity, {
          toValue: 0,
          duration: particle.duration * 0.2,
          useNativeDriver: true,
        }),
        // Stay invisible before next cycle
        Animated.delay(particle.duration * 0.3),
      ])
    ).start();

    // X movement animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(particle.x, {
          toValue: initialX + moveX,
          duration: particle.duration,
          delay: particle.delay,
          useNativeDriver: true,
        }),
        Animated.timing(particle.x, {
          toValue: initialX,
          duration: particle.duration,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Y movement animation (upward drift)
    Animated.loop(
      Animated.sequence([
        Animated.timing(particle.y, {
          toValue: initialY + moveY,
          duration: particle.duration,
          delay: particle.delay,
          useNativeDriver: true,
        }),
        // Reset to start position
        Animated.timing(particle.y, {
          toValue: initialY,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Scale pulsing animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(particle.scale, {
          toValue: initialScale + 0.3,
          duration: particle.duration * 0.5,
          delay: particle.delay,
          useNativeDriver: true,
        }),
        Animated.timing(particle.scale, {
          toValue: initialScale,
          duration: particle.duration * 0.5,
          useNativeDriver: true,
        }),
      ])
    ).start();
  };

  return (
    <View style={styles.container} pointerEvents="none">
      {particles.map((particle, index) => (
        <Animated.View
          key={index}
          style={[
            styles.particle,
            {
              backgroundColor: particle.color,
              opacity: particle.opacity,
              transform: [
                { translateX: particle.x },
                { translateY: particle.y },
                { scale: particle.scale },
              ],
            },
          ]}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  particle: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    shadowColor: '#ffffff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
    elevation: 5,
  },
});

export default FloatingParticles;
