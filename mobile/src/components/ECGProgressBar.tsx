import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path, ClipPath, Rect, Defs } from 'react-native-svg';

import { colors, spacing } from '../theme';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedRect = Animated.createAnimatedComponent(Rect);

const WIDTH = 300;
const HEIGHT = 60;
const MID_Y = HEIGHT / 2;

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
const FULL_WIDTH = CYCLES * 60;

type Props = {
  progress: number; // 0 to 1
  isComplete?: boolean;
};

export default function ECGProgressBar({ progress, isComplete }: Props) {
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (isComplete) {
      pulse.value = 1;
    } else {
      pulse.value = withRepeat(
        withSequence(
          withTiming(0.4, { duration: 300 }),
          withTiming(1, { duration: 300 }),
        ),
        -1,
        true,
      );
    }
  }, [isComplete, pulse]);

  const clipWidth = Math.max(0, Math.min(1, progress)) * WIDTH;

  const clipProps = useAnimatedProps(() => ({
    width: clipWidth,
  }));

  const percent = Math.round(progress * 100);

  return (
    <View style={styles.container}>
      <View style={styles.svgRow}>
        <Svg width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
          <Defs>
            <ClipPath id="progress-clip">
              <AnimatedRect x="0" y="0" height={HEIGHT} animatedProps={clipProps} />
            </ClipPath>
          </Defs>
          {/* Background faded ECG line */}
          <Path
            d={ECG_PATH}
            stroke={colors.border}
            strokeWidth={1.5}
            fill="none"
          />
          {/* Revealed ECG line based on progress */}
          <Path
            d={ECG_PATH}
            stroke={isComplete ? '#22c55e' : colors.brandPurple}
            strokeWidth={2.5}
            fill="none"
            clipPath="url(#progress-clip)"
          />
        </Svg>
      </View>
      <Text style={[styles.percent, isComplete && styles.percentDone]}>
        {isComplete ? 'Uploaded' : `${percent}%`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  svgRow: {
    overflow: 'hidden',
    borderRadius: 8,
  },
  percent: {
    marginTop: spacing.sm,
    fontSize: 13,
    fontWeight: '600',
    color: colors.brandPurple,
  },
  percentDone: {
    color: '#22c55e',
  },
});
