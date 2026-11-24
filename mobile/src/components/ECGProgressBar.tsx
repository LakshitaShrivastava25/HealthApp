import { useEffect, useId } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { ClipPath, Defs, Path, Rect } from 'react-native-svg';

import { colors, spacing } from '../theme';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedRect = Animated.createAnimatedComponent(Rect);

const WIDTH = 300;
const HEIGHT = 60;
const MID_Y = HEIGHT / 2;
/** Width of the lit window that sweeps across in indeterminate mode. */
const SWEEP = 90;

// PQRST waveform pattern — one heartbeat cycle (~60px wide)
function buildECGPath(cycles: number): string {
  const parts: string[] = [`M 0 ${MID_Y}`];
  const cycleWidth = 60;
  for (let i = 0; i < cycles; i++) {
    const x = i * cycleWidth;
    parts.push(
      `L ${x + 8} ${MID_Y}`,          // flat baseline
      `L ${x + 12} ${MID_Y - 4}`,     // P wave up
      `L ${x + 16} ${MID_Y}`,         // P wave down
      `L ${x + 20} ${MID_Y}`,         // PR segment
      `L ${x + 22} ${MID_Y + 6}`,     // Q dip
      `L ${x + 26} ${MID_Y - 24}`,    // R spike up
      `L ${x + 30} ${MID_Y + 10}`,    // S dip
      `L ${x + 34} ${MID_Y}`,         // back to baseline
      `L ${x + 40} ${MID_Y - 6}`,     // T wave up
      `L ${x + 46} ${MID_Y}`,         // T wave down
      `L ${x + 60} ${MID_Y}`,         // baseline to next cycle
    );
  }
  return parts.join(' ');
}

const CYCLES = Math.ceil(WIDTH / 60) + 1;
const ECG_PATH = buildECGPath(CYCLES);

type Props = {
  /**
   * 0 to 1. `null` when the size of the work is unknown — the phone did not
   * report upload progress, or the server is reading the file — and a lit
   * window sweeps across the line instead, so it never looks frozen.
   */
  progress: number | null;
  isComplete?: boolean;
  /** Replaces the percentage under the line (e.g. "Reading your policy…"). */
  caption?: string;
};

export default function ECGProgressBar({ progress, isComplete, caption }: Props) {
  // useId gives each bar its own clip path: two bars on screen used to share
  // one id, and the second drew with the first one's clip.
  const clipId = `ecg-clip-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const indeterminate = progress === null && !isComplete;

  const pulse = useSharedValue(1);
  const sweepX = useSharedValue(-SWEEP);

  useEffect(() => {
    if (isComplete) {
      cancelAnimation(pulse);
      pulse.value = 1;
      return;
    }
    // The heartbeat: the lit part of the line breathes while work is going on.
    pulse.value = withRepeat(
      withSequence(withTiming(0.45, { duration: 450 }), withTiming(1, { duration: 450 })),
      -1,
      false,
    );
    return () => cancelAnimation(pulse);
  }, [isComplete, pulse]);

  useEffect(() => {
    if (!indeterminate) {
      cancelAnimation(sweepX);
      return;
    }
    sweepX.value = -SWEEP;
    sweepX.value = withRepeat(
      withTiming(WIDTH, { duration: 1400, easing: Easing.inOut(Easing.quad) }),
      -1,
      false,
    );
    return () => cancelAnimation(sweepX);
  }, [indeterminate, sweepX]);

  const litProps = useAnimatedProps(() => ({ strokeOpacity: pulse.value }));
  const sweepProps = useAnimatedProps(() => ({ x: sweepX.value }));

  const fraction = isComplete ? 1 : Math.max(0, Math.min(1, progress ?? 0));
  const stroke = isComplete ? colors.success : colors.brandPurple;

  return (
    <View style={styles.container} accessibilityRole="progressbar" accessibilityValue={
      indeterminate ? undefined : { min: 0, max: 100, now: Math.round(fraction * 100) }
    }>
      {/* Scales down on narrow phones instead of overflowing the card. */}
      <View style={styles.svgBox}>
        <Svg width="100%" height="100%" viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
          <Defs>
            <ClipPath id={clipId}>
              {indeterminate ? (
                <AnimatedRect y="0" width={SWEEP} height={HEIGHT} animatedProps={sweepProps} />
              ) : (
                <Rect x="0" y="0" width={fraction * WIDTH} height={HEIGHT} />
              )}
            </ClipPath>
          </Defs>
          {/* Background faded ECG line */}
          <Path d={ECG_PATH} stroke={colors.border} strokeWidth={1.5} fill="none" />
          {/* Lit part: progress so far, or the sweeping window */}
          <AnimatedPath
            d={ECG_PATH}
            stroke={stroke}
            strokeWidth={2.5}
            fill="none"
            clipPath={`url(#${clipId})`}
            animatedProps={litProps}
          />
        </Svg>
      </View>
      <Text style={[styles.percent, isComplete && styles.percentDone]}>
        {isComplete ? 'Uploaded' : caption ?? (indeterminate ? 'Uploading…' : `${Math.round(fraction * 100)}%`)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  svgBox: {
    width: '100%',
    maxWidth: WIDTH,
    aspectRatio: WIDTH / HEIGHT,
    overflow: 'hidden',
    borderRadius: 8,
  },
  percent: {
    marginTop: spacing.sm,
    fontSize: 13,
    fontWeight: '600',
    color: colors.brandPurple,
    textAlign: 'center',
  },
  percentDone: {
    color: colors.success,
  },
});
