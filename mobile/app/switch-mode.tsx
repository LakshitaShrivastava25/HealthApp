import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { useAuth, type Mode } from '../src/context/AuthContext';
import { MODE_STYLE } from '../src/components/ModeSwitch';
import { useBackHandler } from '../src/lib/useBackHandler';
import { colors, spacing } from '../src/theme';

/**
 * The hand-over between User and Doctor mode.
 *
 * Switching used to flip the mode while the old area was still on screen.
 * That area's guard saw a session that no longer matched it and redirected,
 * at the same moment the switch itself navigated — and the redirect fired
 * again on every re-render, an endless loop that closed the app.
 *
 * Now the old area is left first (src/components/ModeSwitch.tsx opens this
 * screen while the mode is still unchanged), the mode flips here where no
 * area is mounted, and only then does the new area open. Nothing races.
 */

const MIN_VISIBLE_MS = 450;

function destination(portal: string | null, profileCount: number): Href {
  switch (portal) {
    case 'admin':
      return '/(admin)/(tabs)';
    case 'doctor':
      return '/(doctor)/(tabs)';
    case 'doctor-setup':
      return '/(doctor-setup)/pending';
    case 'patient':
      return profileCount === 0 ? '/profile-setup' : '/(patient)/(tabs)';
    default:
      return '/login';
  }
}

export default function SwitchMode() {
  const { to } = useLocalSearchParams<{ to?: string }>();
  const target: Mode = to === 'doctor' ? 'doctor' : 'patient';
  const { mode, portal, profiles, switchMode, hasRegistered } = useAuth();
  const router = useRouter();
  const started = useRef(false);
  const left = useRef(false);
  const shownAt = useRef(Date.now());
  const appear = useRef(new Animated.Value(0)).current;

  // A switch in progress has nowhere sensible to go back to.
  useBackHandler(() => true);

  useEffect(() => {
    Animated.timing(appear, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [appear]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    switchMode(target);
  }, [switchMode, target]);

  useEffect(() => {
    if (left.current) return;
    // Doctor mode is refused without a Doctor record; then go wherever the
    // account actually is rather than waiting forever.
    const settled = mode === target || (target === 'doctor' && !hasRegistered);
    if (!settled) return;
    const wait = Math.max(0, MIN_VISIBLE_MS - (Date.now() - shownAt.current));
    const timer = setTimeout(() => {
      left.current = true;
      router.replace(destination(portal, profiles.length));
    }, wait);
    return () => clearTimeout(timer);
  }, [mode, target, hasRegistered, portal, profiles.length, router]);

  const style = MODE_STYLE[target];
  return (
    <View style={styles.screen}>
      <Animated.View
        style={[
          styles.content,
          {
            opacity: appear,
            transform: [{ scale: appear.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) }],
          },
        ]}
      >
        <View style={[styles.badge, { backgroundColor: style.color }]}>
          <MaterialCommunityIcons name={style.icon} size={40} color={colors.white} />
        </View>
        <Text style={styles.title}>Switching to {style.label} mode</Text>
        <Text style={styles.note}>{style.note}</Text>
        <ActivityIndicator color={style.color} style={{ marginTop: spacing.xl }} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  content: { alignItems: 'center', paddingHorizontal: spacing.xxl },
  badge: {
    width: 88,
    height: 88,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
    shadowColor: '#101828',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  title: { fontSize: 20, fontWeight: '800', color: colors.ink900, textAlign: 'center' },
  note: { fontSize: 14, color: colors.ink500, marginTop: spacing.sm, textAlign: 'center' },
});
