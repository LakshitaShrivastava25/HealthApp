import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, StyleSheet, Text, View } from 'react-native';

import { Badge, Card, CardHeader, ErrorNote, Row, Screen, SectionTitle } from '../../../src/components/ui';
import { useAuth } from '../../../src/context/AuthContext';
import { adminApi } from '../../../src/lib/api';
import { colors, radius, spacing, type } from '../../../src/theme';

type Summary = {
  total_users: number;
  documents_needing_review: number;
  policies_needing_review: number;
  doctor_verification_queue: number;
};

export default function AdminOverview() {
  const { account } = useAuth();
  const router = useRouter();

  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data } = await adminApi.dashboardSummary();
      setSummary(data);
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      setError(
        status === 403
          ? 'This dashboard is for full administrators. Your role can still use the queues it has access to.'
          : "Couldn't load the dashboard. Pull down to retry."
      );
    }
  }, []);

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

  const queues: { label: string; value: number; icon: keyof typeof Feather.glyphMap; href: Href }[] = [
    {
      label: 'Documents to review',
      value: summary?.documents_needing_review ?? 0,
      icon: 'file-text' as const,
      href: '/(admin)/(tabs)/documents',
    },
    {
      label: 'Policies to validate',
      value: summary?.policies_needing_review ?? 0,
      icon: 'shield' as const,
      href: '/(admin)/(tabs)/policies',
    },
    {
      label: 'Doctors awaiting verification',
      value: summary?.doctor_verification_queue ?? 0,
      icon: 'user-check' as const,
      href: '/(admin)/(tabs)/doctors',
    },
  ];

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.ink900} />}>
      <Row style={{ justifyContent: 'space-between' }}>
        <View>
          <Text style={type.h1}>Operations</Text>
          <Text style={type.caption}>{account?.phone_number}</Text>
        </View>
        <Badge tone="neutral">{account?.role}</Badge>
      </Row>

      {!!error && <ErrorNote message={error} onRetry={load} />}

      <Card>
        <CardHeader title="Registered patients" />
        <Text style={styles.bigNumber}>{summary?.total_users ?? '—'}</Text>
        <Text style={type.micro}>Accounts with the patient role</Text>
      </Card>

      <SectionTitle>Work queues</SectionTitle>
      {queues.map((q) => (
        <Card key={q.label} onPress={() => router.push(q.href)}>
          <Row>
            <View style={[styles.icon, q.value > 0 && { backgroundColor: colors.warningBg }]}>
              <Feather name={q.icon} size={17} color={q.value > 0 ? colors.warning : colors.ink300} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={type.title}>{q.label}</Text>
              <Text style={type.micro}>
                {q.value === 0 ? 'Nothing waiting' : `${q.value} waiting`}
              </Text>
            </View>
            <Text style={styles.queueCount}>{q.value}</Text>
            <Feather name="chevron-right" size={16} color={colors.ink300} />
          </Row>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  bigNumber: { fontSize: 32, fontWeight: '700', color: colors.ink900 },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  queueCount: { fontSize: 18, fontWeight: '700', color: colors.ink900, marginRight: spacing.xs },
});
