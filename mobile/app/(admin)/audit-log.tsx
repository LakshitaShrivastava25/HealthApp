import { Feather } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, StyleSheet, Text, View } from 'react-native';

import { Badge, Card, EmptyState, ErrorNote, Row, Screen } from '../../src/components/ui';
import { adminApi, unwrap } from '../../src/lib/api';
import { colors, radius, spacing, type } from '../../src/theme';

type AuditEntry = {
  id: string;
  staff: string | null;
  action: string;
  target_type: string;
  target_id: string;
  detail: Record<string, unknown>;
  created_at: string;
};

const actionIcon: Record<string, keyof typeof Feather.glyphMap> = {
  approve_doctor: 'user-check',
  reject_doctor: 'user-x',
  approve_document: 'file-text',
  validate_policy: 'shield',
  deactivate_account: 'slash',
  update: 'edit-2',
  delete: 'trash-2',
};

const actionTone = (action: string) =>
  action.startsWith('reject') || action.startsWith('deactivate') || action === 'delete'
    ? 'danger'
    : action.startsWith('approve') || action.startsWith('validate')
      ? 'success'
      : 'neutral';

function whenLabel(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} · ${d.toLocaleTimeString(
    'en-IN',
    { hour: '2-digit', minute: '2-digit' }
  )}`;
}

export default function AuditLog() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data } = await adminApi.auditLog();
      setEntries(unwrap<AuditEntry>(data));
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      setError(
        status === 403
          ? 'The audit log is restricted to full administrators.'
          : "Couldn't load the audit log. Pull down to retry."
      );
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.ink900} />}>
      <Card>
        <Row style={{ alignItems: 'flex-start' }}>
          <Feather name="info" size={14} color={colors.ink500} />
          <Text style={[type.micro, { flex: 1 }]}>
            Every staff write action is recorded here — who did it, to what, and when. Entries
            cannot be edited or removed.
          </Text>
        </Row>
      </Card>

      {!!error && <ErrorNote message={error} onRetry={load} />}

      {!error && entries.length === 0 && (
        <EmptyState title="No activity yet" note="Staff actions appear here as they happen." />
      )}

      {entries.map((e) => (
        <Card key={e.id}>
          <Row style={{ alignItems: 'flex-start' }}>
            <View style={styles.icon}>
              <Feather name={actionIcon[e.action] ?? 'activity'} size={15} color={colors.ink500} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[type.label, { textTransform: 'capitalize' }]}>
                {e.action.replace(/_/g, ' ')}
              </Text>
              <Text style={type.micro}>
                {e.target_type} · {e.target_id.slice(0, 8)}…
              </Text>
              <Text style={type.micro}>{whenLabel(e.created_at)}</Text>
            </View>
            <Badge tone={actionTone(e.action)}>{e.target_type}</Badge>
          </Row>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  icon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
