import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View, type GestureResponderEvent, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient as SvgGradient, Path, Stop } from 'react-native-svg';

import { colors } from '../theme';

const SIZE = 62;

/** Shield with a heart and pulse — "your health, covered". */
function ShieldGlyph({ size = 30 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Defs>
        <SvgGradient id="shieldFill" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="1" stopColor="#E6E1FF" />
        </SvgGradient>
      </Defs>
      <Path d="M24 3 L41 9.5 V23 C41 34 33.5 41.5 24 45 C14.5 41.5 7 34 7 23 V9.5 Z" fill="url(#shieldFill)" />
      <Path
        d="M24 33 C17.5 28.6 14.5 25.4 14.5 21.6 C14.5 18.9 16.6 17 19 17 C21 17 22.8 18.1 24 20 C25.2 18.1 27 17 29 17 C31.4 17 33.5 18.9 33.5 21.6 C33.5 25.4 30.5 28.6 24 33 Z"
        fill={colors.brandPurple}
      />
      <Path
        d="M16 24.5 H20.5 L22.2 21.8 L24.6 27.2 L26.6 23.2 H32"
        stroke={colors.white}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

/**
 * The raised centre button of the patient tab bar. A gradient disc lifted
 * out of the bar, with a soft ripple while it is not the current tab — a
 * nudge toward the screen people most need when a hospital asks about cover.
 */
export default function InsuranceTabIcon({ focused }: { focused: boolean }) {
  const ripple = useRef(new Animated.Value(0)).current;
  const lift = useRef(new Animated.Value(focused ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(lift, { toValue: focused ? 1 : 0, friction: 5, useNativeDriver: true }).start();
  }, [focused, lift]);

  useEffect(() => {
    if (focused) {
      ripple.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(ripple, { toValue: 1, duration: 1600, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.delay(900),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [focused, ripple]);

  const scale = lift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  const translateY = lift.interpolate({ inputRange: [0, 1], outputRange: [0, -3] });
  const rippleScale = ripple.interpolate({ inputRange: [0, 1], outputRange: [1, 1.45] });
  const rippleOpacity = ripple.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.45, 0] });

  return (
    <View style={styles.anchor}>
      <Animated.View style={[styles.ripple, { opacity: rippleOpacity, transform: [{ scale: rippleScale }] }]} />
      <Animated.View style={[styles.outer, { transform: [{ translateY }, { scale }] }]}>
        <LinearGradient
          colors={focused ? ['#6D5BD0', '#4A3AB0'] : ['#8E7CF3', '#5B4BC4']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.disc}
        >
          <View style={styles.shine} />
          <ShieldGlyph size={30} />
        </LinearGradient>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  button: { alignItems: 'center', justifyContent: 'center' },
  buttonInner: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  anchor: {
    width: SIZE + 12,
    height: SIZE + 12,
    marginTop: -34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ripple: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: colors.brandPurple,
  },
  outer: {
    width: SIZE + 8,
    height: SIZE + 8,
    borderRadius: (SIZE + 8) / 2,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.brandPurple,
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  disc: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  shine: {
    position: 'absolute',
    top: -SIZE * 0.35,
    left: -SIZE * 0.1,
    width: SIZE * 1.2,
    height: SIZE * 0.7,
    borderRadius: SIZE,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
});

/**
 * Replaces the default tab button for the centre slot. The stock button
 * draws a rectangular Android ripple over the whole slot, which gets
 * clipped at the top of the bar and looks like a stray box behind the
 * raised disc. Here there is no ripple — the disc itself presses in and
 * springs back.
 */
export function InsuranceTabButton({
  children,
  onPress,
  onLongPress,
  style,
  accessibilityState,
  accessibilityLabel,
  testID,
}: {
  children: ReactNode;
  onPress?: (e: GestureResponderEvent) => void;
  onLongPress?: ((e: GestureResponderEvent) => void) | null;
  style?: StyleProp<ViewStyle>;
  accessibilityState?: { selected?: boolean };
  accessibilityLabel?: string;
  testID?: string;
}) {
  const press = useRef(new Animated.Value(1)).current;
  const to = (v: number) => Animated.spring(press, { toValue: v, friction: 5, tension: 180, useNativeDriver: true }).start();

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress ?? undefined}
      onPressIn={() => to(0.88)}
      onPressOut={() => to(1)}
      android_ripple={null}
      accessibilityRole="button"
      accessibilityState={accessibilityState}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      style={[style, styles.button]}
    >
      <Animated.View style={[styles.buttonInner, { transform: [{ scale: press }] }]}>{children}</Animated.View>
    </Pressable>
  );
}
