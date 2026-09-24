import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, StyleSheet, Text, View } from 'react-native';

import { Badge, Card, CardHeader, EmptyState, ErrorNote, Row, Screen, SectionTitle } from '../../../src/components/ui';
import { useAuth } from '../../../src/context/AuthContext';
import { accessApi, profilesApi, unwrap } from '../../../src/lib/api';
import { colors, radius, spacing, type } from '../../../src/theme';

type Grant = {
  id: string;
  profile: string;
  status: string;
  requested_at: string;
  responded_at: string | null;
};

export default function MyPatients() {
  const { doctor } = useAuth();
  const router = useRouter();

  const [grants, setGrants] = useState<Grant[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data } = await accessApi.list();
      setGrants(unwrap<Grant>(data));

      // Names come from /api/profiles/, which includes any profile this
      // doctor has an APPROVED grant for — so the list is exactly the
      // patients whose names the doctor is allowed to know.
      const profileRes = await profilesApi.list();
      const map: Record<string, string> = {};
      unwrap<{ id: string; full_name: string }>(profileRes.data).forEach((p) => {
        map[p.id] = p.full_name;
      });
      setNames(map);
    } catch {
      setError("Couldn't load your patients. Pull down to retry.");
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

  const approved = grants.filter((g) => g.status === 'approved');
  const pending = grants.filter((g) => g.status === 'pending');
  const closed = grants.filter((g) => ['denied', 'revoked', 'expired'].includes(g.status));

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brandTeal} />}>
      {!!error && <ErrorNote message={error} onRetry={load} />}

      <Card>
        <Row>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {doctor?.full_name?.trim().split(' ').slice(-1)[0]?.[0] ?? 'D'}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={type.title}>Dr. {doctor?.full_name}</Text>
            <Text style={type.micro}>
              {[doctor?.specialization, doctor?.clinic_name].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <Badge tone="success">verified</Badge>
        </Row>
      </Card>

      <SectionTitle>Patients who approved you ({approved.length})</SectionTitle>
      {approved.length === 0 ? (
        <EmptyState
          title="No patients yet"
          note="Ask a patient for their reference ID, then send a request from the Request tab. They must approve before you see anything."
        />
      ) : (
        approved.map((g) => (
          <Card key={g.id} onPress={() => router.push(`/(doctor)/patient/${g.profile}`)}>
            <Row>
              <View style={[styles.avatar, { backgroundColor: colors.successBg }]}>
                <Feather name="user" size={17} color={colors.success} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={type.title}>{names[g.profile] ?? 'Patient'}</Text>
                <Text style={type.micro}>
                  Approved{g.responded_at ? ` on ${g.responded_at.slice(0, 10)}` : ''}
                </Text>
              </View>
              <Feather name="chevron-right" size={16} color={colors.ink300} />
            </Row>
          </Card>
        ))
      )}

      {pending.length > 0 && (
        <>
          <SectionTitle>Awaiting patient approval ({pending.length})</SectionTitle>
          <Card>
            <CardHeader title="Requests you have sent" subtitle="You see nothing until the patient approves" />
            {pending.map((g) => (
              <Row key={g.id} style={styles.plainRow}>
                <Feather name="clock" size={14} color={colors.warning} />
                <View style={{ flex: 1 }}>
                  <Text style={type.caption} numberOfLines={1}>
                    {names[g.profile] ?? g.profile}
                  </Text>
                  <Text style={type.micro}>Requested {g.requested_at.slice(0, 10)}</Text>
                </View>
                <Badge tone="warning">pending</Badge>
              </Row>
            ))}
          </Card>
        </>
      )}

      {closed.length > 0 && (
        <Card>
          <CardHeader title="Closed requests" />
          {closed.map((g) => (
            <Row key={g.id} style={styles.plainRow}>
              <Text style={[type.caption, { flex: 1 }]} numberOfLines={1}>
                {names[g.profile] ?? g.profile}
              </Text>
              <Badge tone={g.status === 'denied' ? 'danger' : 'neutral'}>{g.status}</Badge>
            </Row>
          ))}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    backgroundColor: colors.brandLavender,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 16, fontWeight: '700', color: colors.brandPurple },
  plainRow: {
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
});
