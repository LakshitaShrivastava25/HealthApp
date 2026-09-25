import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { colors } from '../theme';
import { LogoMark } from './Illustrations';

/**
 * The brand mark with a real heartbeat rhythm: a strong "lub", a softer
 * "dub", then rest — rather than a uniform pulse, which reads as a loading
 * spinner instead of a heart.
 */
export default function BeatingHeart({
  size = 40,
  tile = true,
  halo = false,
}: {
  size?: number;
  tile?: boolean;
  /** An expanding ring on each beat — for hero spots, not headers. */
  halo?: boolean;
}) {
  const beat = useRef(new Animated.Value(1)).current;
  const ring = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const out = (to: number, ms: number) =>
      Animated.timing(beat, { toValue: to, duration: ms, easing: Easing.out(Easing.quad), useNativeDriver: true });
    const back = (ms: number) =>
      Animated.timing(beat, { toValue: 1, duration: ms, easing: Easing.in(Easing.quad), useNativeDriver: true });

    const heartbeat = Animated.loop(
      Animated.sequence([
        out(1.16, 110), // lub
        back(110),
        out(1.09, 100), // dub
        back(160),
        Animated.delay(700),
      ])
    );
    const ripple = Animated.loop(
      Animated.sequence([
        Animated.timing(ring, { toValue: 1, duration: 900, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(ring, { toValue: 0, duration: 0, useNativeDriver: true }),
        Animated.delay(280),
      ])
    );

    heartbeat.start();
    if (halo) ripple.start();
    return () => {
      heartbeat.stop();
      ripple.stop();
    };
  }, [beat, halo, ring]);

  const ringScale = ring.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] });
  const ringOpacity = ring.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] });

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {halo && (
        <Animated.View
          style={[
            styles.ring,
            {
              width: size,
              height: size,
              borderRadius: size * 0.28,
              opacity: ringOpacity,
              transform: [{ scale: ringScale }],
            },
          ]}
        />
      )}
      <Animated.View style={{ transform: [{ scale: beat }] }}>
        <LogoMark size={size} tile={tile} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  ring: { position: 'absolute', borderWidth: 2, borderColor: colors.brandPurple },
});
