import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Badge, Button, Card, EmptyState, ErrorNote, Row, Screen } from '../../../src/components/ui';
import { adminApi, unwrap } from '../../../src/lib/api';
import { colors, radius, spacing, type } from '../../../src/theme';

type AdminDoc = {
  id: string;
  profile: string;
  title: string;
  category: string;
  status: string;
  raw_ocr_text: string;
  structured_data: Record<string, unknown>;
  uploaded_at: string;
};

const FILTERS = [
  { label: 'Needs review', value: 'needs_review' },
  { label: 'Processing', value: 'processing' },
  { label: 'Processed', value: 'processed' },
  { label: 'All', value: '' },
];

export default function AdminDocuments() {
  const [filter, setFilter] = useState('needs_review');
  const [docs, setDocs] = useState<AdminDoc[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [approving, setApproving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data } = await adminApi.documents(filter || undefined);
      setDocs(unwrap<AdminDoc>(data));
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      setError(
        status === 403
          ? 'Your role does not have access to the document review queue. This queue is for OCR reviewers and administrators.'
          : "Couldn't load the review queue. Pull down to retry."
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

  async function approve(doc: AdminDoc) {
    setApproving(doc.id);
    try {
      // The backend stamps status=processed and processed_at itself on any
      // PATCH here — the structured data is sent back unchanged, which is
      // what "approve as read" means for this queue.
      await adminApi.approveDocument(doc.id, doc.structured_data ?? {});
      await load();
    } catch {
      setError("Couldn't approve that document. Please try again.");
    } finally {
      setApproving(null);
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

      {!error && docs.length === 0 && (
        <EmptyState title="Nothing in this queue" note="Documents appear here once patients upload them." />
      )}

      {docs.map((d) => {
        const expanded = expandedId === d.id;
        const entries = Object.entries(d.structured_data ?? {}).filter(([k]) => !k.startsWith('_'));
        return (
          <Card key={d.id}>
            <Pressable onPress={() => setExpandedId(expanded ? null : d.id)}>
              <Row style={{ alignItems: 'flex-start' }}>
                <View style={styles.icon}>
                  <Feather name="file-text" size={16} color={colors.ink500} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={type.title} numberOfLines={1}>
                    {d.title || 'Untitled document'}
                  </Text>
                  <Text style={type.micro}>Uploaded {d.uploaded_at.slice(0, 10)}</Text>
                  <Row style={{ marginTop: spacing.sm }}>
                    <Badge tone="neutral">{d.category}</Badge>
                    <Badge tone={d.status === 'needs_review' ? 'warning' : 'success'}>
                      {d.status.replace('_', ' ')}
                    </Badge>
                  </Row>
                </View>
                <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.ink300} />
              </Row>
            </Pressable>

            {expanded && (
              <View style={styles.expanded}>
                <Text style={[type.caption, { marginBottom: spacing.sm }]}>Extracted data</Text>
                {entries.length === 0 ? (
                  <Text style={type.micro}>Nothing was extracted from this document.</Text>
                ) : (
                  entries.map(([k, v]) => (
                    <Row key={k} style={styles.dataRow}>
                      <Text style={[type.micro, { flex: 1, textTransform: 'capitalize' }]}>
                        {k.replace(/_/g, ' ')}
                      </Text>
                      <Text style={[type.caption, { flex: 1, textAlign: 'right' }]} numberOfLines={3}>
                        {v === null || v === '' ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v)}
                      </Text>
                    </Row>
                  ))
                )}

                {!!d.raw_ocr_text && (
                  <>
                    <Text style={[type.caption, { marginTop: spacing.md, marginBottom: spacing.xs }]}>
                      Raw OCR text
                    </Text>
                    <Text style={styles.rawText} numberOfLines={12}>
                      {d.raw_ocr_text}
                    </Text>
                  </>
                )}

                {d.status !== 'processed' && (
                  <Button
                    onPress={() => approve(d)}
                    loading={approving === d.id}
                    style={{ marginTop: spacing.md }}
                  >
                    Approve as reviewed
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
  dataRow: { paddingVertical: 5 },
  rawText: {
    ...type.micro,
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    padding: spacing.sm,
  },
});
