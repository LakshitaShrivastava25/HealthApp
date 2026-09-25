import { Feather } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { Alert, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';

import { Badge, Button, Card, EmptyState, ErrorNote, Row, Screen } from '../../src/components/ui';
import { adminApi, unwrap } from '../../src/lib/api';
import { colors, radius, spacing, type } from '../../src/theme';

type AdminAccount = {
  id: string;
  phone_number: string;
  email: string | null;
  role: string;
  is_active: boolean;
  date_joined: string;
};

export default function AdminAccounts() {
  const [search, setSearch] = useState('');
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async (term: string) => {
    setError(null);
    try {
      const { data } = await adminApi.accounts(term || undefined);
      setAccounts(unwrap<AdminAccount>(data));
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      setError(
        status === 403
          ? 'Account management is restricted to full administrators.'
          : "Couldn't load accounts."
      );
    }
  }, []);

  useEffect(() => {
    const id = setTimeout(() => void load(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search, load]);

  async function onRefresh() {
    setRefreshing(true);
    await load(search.trim());
    setRefreshing(false);
  }

  function confirmDeactivate(acc: AdminAccount) {
    Alert.alert(
      'Deactivate this account?',
      `${acc.phone_number} will be signed out immediately and unable to sign back in. Their medical records are not deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Deactivate',
          style: 'destructive',
          onPress: async () => {
            setActing(acc.id);
            try {
              await adminApi.deactivateAccount(acc.id);
              await load(search.trim());
            } catch {
              setError("Couldn't deactivate that account.");
            } finally {
              setActing(null);
            }
          },
        },
      ]
    );
  }

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.ink900} />}>
      <View style={styles.searchWrap}>
        <Feather name="search" size={15} color={colors.ink300} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search by phone number"
          placeholderTextColor={colors.ink300}
          style={styles.searchInput}
          keyboardType="phone-pad"
        />
      </View>

      {!!error && <ErrorNote message={error} onRetry={() => load(search.trim())} />}

      {!error && accounts.length === 0 && (
        <EmptyState
          title={search ? 'No accounts match' : 'No patient accounts yet'}
          note={search ? 'Try a different number.' : undefined}
        />
      )}

      {accounts.map((acc) => (
        <Card key={acc.id}>
          <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <Text style={type.title}>{acc.phone_number}</Text>
              <Text style={type.micro}>
                {acc.email || 'No email'} · joined {acc.date_joined.slice(0, 10)}
              </Text>
            </View>
            <Badge tone={acc.is_active ? 'success' : 'danger'}>
              {acc.is_active ? 'active' : 'deactivated'}
            </Badge>
          </Row>

          {acc.is_active && (
            <Button
              variant="danger"
              onPress={() => confirmDeactivate(acc)}
              loading={acting === acc.id}
              style={{ marginTop: spacing.md }}
            >
              Deactivate account
            </Button>
          )}
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
});
