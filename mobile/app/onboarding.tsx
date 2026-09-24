import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import BeatingHeart from '../src/components/BeatingHeart';
import { FamilyArt, MedicineArt, RecordsArt, ShieldArt } from '../src/components/Illustrations';
import { markOnboardingSeen } from '../src/lib/onboarding';
import { colors, radius, spacing } from '../src/theme';
import { useConfirmExit } from '../src/lib/useBackHandler';

const SLIDES = [
  {
    key: 'records',
    Art: RecordsArt,
    title: 'All your records,\none secure locker',
    body: 'Upload reports, prescriptions and scans. AI reads them and builds your health timeline automatically.',
  },
  {
    key: 'insurance',
    Art: ShieldArt,
    title: 'Understand your\ninsurance instantly',
    body: 'Ask what your policy covers, check waiting periods and estimate a claim before you reach the hospital desk.',
  },
  {
    key: 'medicines',
    Art: MedicineArt,
    title: 'Never miss\na dose',
    body: 'Track every medicine with dosage and reminders, and keep an emergency card ready for paramedics.',
  },
  {
    key: 'family',
    Art: FamilyArt,
    title: 'Care for the\nwhole family',
    body: 'One login, separate profiles for parents and children. You decide which doctor sees what — and for how long.',
  },
] as const;

export default function Onboarding() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const listRef = useRef<FlatList>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const [index, setIndex] = useState(0);

  const isLast = index === SLIDES.length - 1;

  // Back steps through the slides in reverse before offering to exit.
  useConfirmExit(() => {
    if (index === 0) return false;
    listRef.current?.scrollToIndex({ index: index - 1, animated: true });
    setIndex(index - 1);
    return true;
  });

  async function finish() {
    await markOnboardingSeen();
    router.replace('/login');
  }

  function next() {
    if (isLast) return void finish();
    listRef.current?.scrollToIndex({ index: index + 1, animated: true });
  }

  function onMomentumEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <View style={styles.brandRow}>
          <BeatingHeart size={30} />
          <Text style={styles.brand}>HealthNow</Text>
        </View>
        {!isLast && (
          <Pressable onPress={finish} hitSlop={10}>
            <Text style={styles.skip}>Skip</Text>
          </Pressable>
        )}
      </View>

      <Animated.FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={(s) => s.key}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: false })}
        onMomentumScrollEnd={onMomentumEnd}
        renderItem={({ item, index: i }) => {
          const range = [(i - 1) * width, i * width, (i + 1) * width];
          const artScale = scrollX.interpolate({ inputRange: range, outputRange: [0.7, 1, 0.7], extrapolate: 'clamp' });
          const textShift = scrollX.interpolate({ inputRange: range, outputRange: [60, 0, -60], extrapolate: 'clamp' });
          const opacity = scrollX.interpolate({ inputRange: range, outputRange: [0, 1, 0], extrapolate: 'clamp' });
          return (
            <View style={[styles.slide, { width }]}>
              <Animated.View style={[styles.artWrap, { transform: [{ scale: artScale }], opacity }]}>
                <item.Art width={Math.min(width - 48, 320)} />
              </Animated.View>
              <Animated.View style={{ transform: [{ translateX: textShift }], opacity }}>
                <Text style={styles.title}>{item.title}</Text>
                <Text style={styles.body}>{item.body}</Text>
              </Animated.View>
            </View>
          );
        }}
      />

      <View style={styles.footer}>
        <View style={styles.dots}>
          {SLIDES.map((s, i) => {
            const dotWidth = scrollX.interpolate({
              inputRange: [(i - 1) * width, i * width, (i + 1) * width],
              outputRange: [8, 24, 8],
              extrapolate: 'clamp',
            });
            const dotOpacity = scrollX.interpolate({
              inputRange: [(i - 1) * width, i * width, (i + 1) * width],
              outputRange: [0.3, 1, 0.3],
              extrapolate: 'clamp',
            });
            // Dot width is a layout prop, which is why the scroll event above
            // runs on the JS driver rather than the native one.
            return <Animated.View key={s.key} style={[styles.dot, { width: dotWidth, opacity: dotOpacity }]} />;
          })}
        </View>

        <Pressable onPress={next} style={({ pressed }) => [styles.cta, isLast && styles.ctaWide, pressed && { opacity: 0.85 }]}>
          {isLast ? (
            <Text style={styles.ctaText}>Get started</Text>
          ) : (
            <Feather name="arrow-right" size={22} color={colors.white} />
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.card },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    height: 52,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  brand: { fontSize: 17, fontWeight: '800', color: colors.ink900 },
  skip: { fontSize: 15, fontWeight: '600', color: colors.ink500 },
  slide: { flex: 1, paddingHorizontal: spacing.xxl, justifyContent: 'center' },
  artWrap: { alignItems: 'center', marginBottom: spacing.xxxl },
  title: { fontSize: 30, lineHeight: 38, fontWeight: '800', color: colors.ink900 },
  body: { fontSize: 15, lineHeight: 23, color: colors.ink500, marginTop: spacing.md },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xxl,
    paddingBottom: spacing.xl,
    paddingTop: spacing.md,
  },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { height: 8, borderRadius: 4, backgroundColor: colors.brandPurple },
  cta: {
    height: 58,
    minWidth: 58,
    borderRadius: 29,
    backgroundColor: colors.brandPurple,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.brandPurple,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6,
  },
  ctaWide: { paddingHorizontal: spacing.xxl, borderRadius: radius.pill },
  ctaText: { color: colors.white, fontSize: 16, fontWeight: '700' },
});
