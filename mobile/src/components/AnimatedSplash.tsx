import * as SplashScreen from 'expo-splash-screen';
import { LinearGradient } from 'expo-linear-gradient';
import { ReactNode, useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../context/AuthContext';
import { colors } from '../theme';
import BeatingHeart from './BeatingHeart';

// Keep the native splash up until this component has painted its first
// frame, so there is no white flash between the two.
void SplashScreen.preventAutoHideAsync().catch(() => {});

/** Long enough to register the brand, short enough never to feel like a wait. */
const MIN_VISIBLE_MS = 1600;

/**
 * Branded launch screen shown over the app while the session is restored
 * from secure storage. It hands off from the static native splash (same
 * colour, same mark) and then animates, so launch reads as one motion.
 */
export default function AnimatedSplash({ children }: { children: ReactNode }) {
  const { isLoading } = useAuth();
  const [minElapsed, setMinElapsed] = useState(false);
  const [visible, setVisible] = useState(true);

  const logoScale = useRef(new Animated.Value(0.6)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const textOffset = useRef(new Animated.Value(16)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    void SplashScreen.hideAsync().catch(() => {});

    Animated.sequence([
      Animated.parallel([
        Animated.spring(logoScale, { toValue: 1, friction: 5, tension: 60, useNativeDriver: true }),
        Animated.timing(logoOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(textOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(textOffset, { toValue: 0, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
    ]).start();

    Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: 1400, easing: Easing.out(Easing.ease), useNativeDriver: true })
    ).start();

    const t = setTimeout(() => setMinElapsed(true), MIN_VISIBLE_MS);
    return () => clearTimeout(t);
  }, [logoOpacity, logoScale, pulse, textOffset, textOpacity]);

  useEffect(() => {
    if (!minElapsed || isLoading) return;
    Animated.timing(fade, { toValue: 0, duration: 350, useNativeDriver: true }).start(() => setVisible(false));
  }, [fade, isLoading, minElapsed]);

  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.8] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] });

  return (
    <View style={{ flex: 1 }}>
      {children}
      {visible && (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade }]} pointerEvents="none">
          <LinearGradient colors={['#7C6AE0', colors.brandPurpleDark]} style={styles.fill}>
            <View style={[styles.bubble, { top: -80, right: -60, width: 240, height: 240 }]} />
            <View style={[styles.bubble, { bottom: -100, left: -70, width: 280, height: 280 }]} />

            <View style={styles.center}>
              <Animated.View style={[styles.ring, { transform: [{ scale: ringScale }], opacity: ringOpacity }]} />
              <Animated.View style={{ opacity: logoOpacity, transform: [{ scale: logoScale }] }}>
                <View style={styles.logoShadow}>
                  <BeatingHeart size={104} />
                </View>
              </Animated.View>
            </View>

            <Animated.View style={{ opacity: textOpacity, transform: [{ translateY: textOffset }], alignItems: 'center' }}>
              <Text style={styles.name}>CurePath</Text>
              <Text style={styles.tag}>Your family's health, in one place</Text>
            </Animated.View>

            <Animated.Text style={[styles.footer, { opacity: textOpacity }]}>Private · Secure · Yours</Animated.Text>
          </LinearGradient>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bubble: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.07)' },
  center: { width: 160, height: 160, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  ring: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: colors.white,
  },
  logoShadow: {
    borderRadius: 28,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  name: { color: colors.white, fontSize: 32, fontWeight: '800', letterSpacing: 0.3 },
  tag: { color: 'rgba(255,255,255,0.8)', fontSize: 14, fontWeight: '500', marginTop: 6 },
  footer: {
    position: 'absolute',
    bottom: 48,
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
  },
});
