import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { TimelineArt } from '../../src/components/Illustrations';
import { Badge, ErrorNote, Loading, Screen } from '../../src/components/ui';
import { useAuth } from '../../src/context/AuthContext';
import { timelineApi, unwrap } from '../../src/lib/api';
import { colors, radius, shadow, spacing, type, type ToneName } from '../../src/theme';

type TimelineEvent = {
  id: string;
  event_date: string;
  event_type: string;
  title: string;
  summary: string;
  source_document: string | null;
};

const eventTone: Record<string, ToneName> = {
  report: 'info',
  prescription: 'success',
  scan: 'warning',
  discharge: 'neutral',
  diagnosis: 'danger',
  allergy: 'warning',
  test: 'info',
};

const toneDot: Record<ToneName, string> = {
  info: colors.info,
  success: colors.success,
  warning: colors.warning,
  danger: colors.danger,
  neutral: colors.brandPurple,
};

/** Every dated health event for the active profile, newest first, grouped by year. */
export default function Timeline() {
  const { activeProfile } = useAuth();
  const router = useRouter();

  const [events, setEvents] = useState<TimelineEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!activeProfile) return;
    setError(null);
    try {
      const { data } = await timelineApi.list(activeProfile.id);
      setEvents(unwrap<TimelineEvent>(data));
    } catch {
      setError("Couldn't load the timeline. Pull down to retry.");
      setEvents((prev) => prev ?? []);
    }
  }, [activeProfile]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const grouped = (events ?? []).reduce<Record<string, TimelineEvent[]>>((acc, e) => {
    const year = e.event_date.slice(0, 4);
    (acc[year] ||= []).push(e);
    return acc;
  }, {});
  const years = Object.keys(grouped).sort().reverse();

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brandPurple} />}>
      {!!error && <ErrorNote message={error} onRetry={load} />}

      {events === null ? (
        <Loading label="Loading your timeline" />
      ) : years.length === 0 ? (
        <View style={styles.empty}>
          <TimelineArt width={220} />
          <Text style={[type.h2, { textAlign: 'center' }]}>Your health story starts here</Text>
          <Text style={[type.caption, { textAlign: 'center' }]}>
            Timeline events are built automatically from reports and prescriptions you upload to the Locker.
          </Text>
          <Pressable onPress={() => router.push('/(patient)/(tabs)/locker')} style={styles.emptyCta}>
            <Feather name="upload" size={15} color={colors.white} />
            <Text style={styles.emptyCtaText}>Upload a document</Text>
          </Pressable>
        </View>
      ) : (
        years.map((year) => (
          <View key={year}>
            <View style={styles.yearChip}>
              <Text style={styles.yearText}>{year}</Text>
              <Text style={styles.yearCount}>{grouped[year].length} events</Text>
            </View>
            {grouped[year].map((e, i) => {
              const tone = eventTone[e.event_type] ?? 'neutral';
              const last = i === grouped[year].length - 1;
              const date = new Date(e.event_date);
              return (
                <View key={e.id} style={styles.eventRow}>
                  <View style={styles.dateCol}>
                    <Text style={styles.day}>{date.toLocaleDateString('en-IN', { day: '2-digit' })}</Text>
                    <Text style={styles.month}>{date.toLocaleDateString('en-IN', { month: 'short' })}</Text>
                  </View>
                  <View style={styles.rail}>
                    <View style={[styles.dot, { backgroundColor: toneDot[tone] }]} />
                    {!last && <View style={styles.line} />}
                  </View>
                  <Pressable
                    disabled={!e.source_document}
                    onPress={() => e.source_document && router.push(`/(patient)/document/${e.source_document}`)}
                    style={({ pressed }) => [styles.eventCard, pressed && { opacity: 0.75 }]}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }}>
                      <Text style={styles.eventTitle} numberOfLines={2}>{e.title}</Text>
                      <Badge tone={tone}>{e.event_type}</Badge>
                    </View>
                    {!!e.summary && <Text style={[type.caption, { marginTop: 4 }]} numberOfLines={3}>{e.summary}</Text>}
                    {!!e.source_document && (
                      <View style={styles.sourceRow}>
                        <Feather name="paperclip" size={12} color={colors.brandPurple} />
                        <Text style={styles.sourceText}>View source document</Text>
                      </View>
                    )}
                  </Pressable>
                </View>
              );
            })}
          </View>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xxl, paddingHorizontal: spacing.lg },
  emptyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.brandPurple,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  emptyCtaText: { color: colors.white, fontWeight: '700', fontSize: 14 },
  yearChip: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
    marginBottom: spacing.md,
    marginTop: spacing.sm,
  },
  yearText: { fontSize: 20, fontWeight: '800', color: colors.ink900 },
  yearCount: { fontSize: 12, fontWeight: '500', color: colors.ink500 },
  eventRow: { flexDirection: 'row', gap: spacing.sm },
  dateCol: { width: 38, alignItems: 'center', paddingTop: spacing.md },
  day: { fontSize: 17, fontWeight: '800', color: colors.ink900 },
  month: { fontSize: 11, fontWeight: '600', color: colors.ink500, textTransform: 'uppercase' },
  rail: { width: 16, alignItems: 'center' },
  dot: { width: 12, height: 12, borderRadius: 6, marginTop: spacing.lg, borderWidth: 2, borderColor: colors.white },
  line: { flex: 1, width: 2, backgroundColor: colors.border, marginTop: 2 },
  eventCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadow.card,
  },
  eventTitle: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.ink900 },
  sourceRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.sm },
  sourceText: { fontSize: 12, fontWeight: '600', color: colors.brandPurple },
});
