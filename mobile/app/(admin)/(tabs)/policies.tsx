import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Badge, Button, Card, EmptyState, ErrorNote, Input, Row, Screen } from '../../../src/components/ui';
import { adminApi, unwrap } from '../../../src/lib/api';
import { colors, radius, spacing, type } from '../../../src/theme';

type AdminPolicy = {
  id: string;
  profile: string;
  insurer: string;
  policy_number: string;
  status: string;
  raw_text: string;
  structured_data: Record<string, unknown>;
  uploaded_at: string;
};

const FILTERS = [
  { label: 'Needs review', value: 'needs_review' },
  { label: 'Processing', value: 'processing' },
  { label: 'Validated', value: 'validated' },
  { label: 'All', value: '' },
];

export default function AdminPolicies() {
  const [filter, setFilter] = useState('needs_review');
  const [policies, setPolicies] = useState<AdminPolicy[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  // Corrections an operator types before validating — keyed by policy so
  // switching between rows never carries one policy's edit onto another.
  const [edits, setEdits] = useState<Record<string, { insurer: string; policy_number: string }>>({});

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data } = await adminApi.policies(filter || undefined);
      setPolicies(unwrap<AdminPolicy>(data));
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      setError(
        status === 403
          ? 'Your role does not have access to the policy queue. This queue is for claims operations and administrators.'
          : "Couldn't load the policy queue. Pull down to retry."
      );
    }
  }, [filter]);

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

  function editFor(p: AdminPolicy) {
    return edits[p.id] ?? { insurer: p.insurer, policy_number: p.policy_number };
  }

  async function validate(p: AdminPolicy) {
    setSaving(p.id);
    try {
      // A PATCH here stamps status=validated server-side, so the corrected
      // insurer and policy number land in the same write that approves it.
      await adminApi.validatePolicy(p.id, editFor(p));
      setEdits((prev) => {
        const next = { ...prev };
        delete next[p.id];
        return next;
      });
      await load();
    } catch {
      setError("Couldn't validate that policy. Please try again.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.ink900} />}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {FILTERS.map((f) => (
          <Pressable
            key={f.value}
            onPress={() => setFilter(f.value)}
            style={[styles.chip, filter === f.value && styles.chipActive]}
          >
            <Text style={[styles.chipText, filter === f.value && styles.chipTextActive]}>{f.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {!!error && <ErrorNote message={error} onRetry={load} />}

      {!error && policies.length === 0 && (
        <EmptyState title="Nothing in this queue" note="Policies appear here once patients upload them." />
      )}

      {policies.map((p) => {
        const expanded = expandedId === p.id;
        const edit = editFor(p);
        return (
          <Card key={p.id}>
            <Pressable onPress={() => setExpandedId(expanded ? null : p.id)}>
              <Row style={{ alignItems: 'flex-start' }}>
                <View style={styles.icon}>
                  <Feather name="shield" size={16} color={colors.ink500} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={type.title}>{p.insurer || 'Unknown insurer'}</Text>
                  <Text style={type.micro}>
                    {p.policy_number || 'No policy number'} · uploaded {p.uploaded_at.slice(0, 10)}
                  </Text>
                  <Row style={{ marginTop: spacing.sm }}>
                    <Badge tone={p.status === 'validated' ? 'success' : 'warning'}>
                      {p.status.replace('_', ' ')}
                    </Badge>
                  </Row>
                </View>
                <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.ink300} />
              </Row>
            </Pressable>

            {expanded && (
              <View style={styles.expanded}>
                <Text style={[type.caption, { marginBottom: spacing.sm }]}>
                  Correct anything the extraction got wrong, then validate.
                </Text>
                <Input
                  label="Insurer"
                  value={edit.insurer}
                  onChangeText={(v) => setEdits((prev) => ({ ...prev, [p.id]: { ...edit, insurer: v } }))}
                />
                <Input
                  label="Policy number"
                  value={edit.policy_number}
                  onChangeText={(v) => setEdits((prev) => ({ ...prev, [p.id]: { ...edit, policy_number: v } }))}
                />

                {!!p.raw_text && (
                  <>
                    <Text style={[type.caption, { marginBottom: spacing.xs }]}>Extracted text</Text>
                    <Text style={styles.rawText} numberOfLines={14}>
                      {p.raw_text}
                    </Text>
                  </>
                )}

                {p.status !== 'validated' && (
                  <Button onPress={() => validate(p)} loading={saving === p.id} style={{ marginTop: spacing.md }}>
                    Validate policy
                  </Button>
                )}
              </View>
            )}
          </Card>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chipRow: { gap: spacing.sm, paddingVertical: 2 },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  chipActive: { backgroundColor: colors.ink900, borderColor: colors.ink900 },
  chipText: { fontSize: 13, fontWeight: '500', color: colors.ink700 },
  chipTextActive: { color: colors.white },
  icon: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expanded: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  rawText: {
    ...type.micro,
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    padding: spacing.sm,
  },
});
