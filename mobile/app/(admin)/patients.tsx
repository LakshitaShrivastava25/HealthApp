import { Feather } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';

import { Badge, Card, EmptyState, ErrorNote, Row, Screen } from '../../src/components/ui';
import { adminApi, unwrap } from '../../src/lib/api';
import { colors, radius, spacing, type } from '../../src/theme';

type AdminProfile = {
  id: string;
  full_name: string;
  relation: string;
  account: string;
  account_phone_number: string;
  created_at: string;
};

export default function AdminPatients() {
  const [search, setSearch] = useState('');
  const [profiles, setProfiles] = useState<AdminProfile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (term: string) => {
    setError(null);
    try {
      const { data } = await adminApi.patients(term || undefined);
      setProfiles(unwrap<AdminProfile>(data));
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      setError(
        status === 403
          ? 'The patient directory is restricted to full administrators.'
          : "Couldn't load the patient directory."
      );
    }
  }, []);

  // Debounced so typing does not fire a request per keystroke.
  useEffect(() => {
    const id = setTimeout(() => void load(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search, load]);

  async function onRefresh() {
    setRefreshing(true);
    await load(search.trim());
    setRefreshing(false);
  }

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.ink900} />}>
      <View style={styles.searchWrap}>
        <Feather name="search" size={15} color={colors.ink300} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name or phone number"
          placeholderTextColor={colors.ink300}
          style={styles.searchInput}
          autoCapitalize="none"
        />
      </View>

      <Card>
        <Row style={{ alignItems: 'flex-start' }}>
          <Feather name="info" size={14} color={colors.ink500} />
          <Text style={[type.micro, { flex: 1 }]}>
            A directory of who exists, not a medical record view. Clinical data is only reachable
            through the individually audited review queues.
          </Text>
        </Row>
      </Card>

      {!!error && <ErrorNote message={error} onRetry={() => load(search.trim())} />}

      {!error && profiles.length === 0 && (
        <EmptyState
          title={search ? 'No profiles match' : 'No patient profiles yet'}
          note={search ? 'Try a different name or number.' : undefined}
        />
      )}

      {profiles.map((p) => (
        <Card key={p.id}>
          <Row>
            <View style={styles.avatar}>
              <Feather name="user" size={16} color={colors.ink500} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={type.title}>{p.full_name}</Text>
              <Text style={type.micro}>
                {p.account_phone_number} · joined {p.created_at.slice(0, 10)}
              </Text>
            </View>
            <Badge tone="neutral">{p.relation}</Badge>
          </Row>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  searchInput: { flex: 1, paddingVertical: spacing.md, fontSize: 14, color: colors.ink900 },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
