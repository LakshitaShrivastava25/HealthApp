import { Feather } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Badge, Button, Card, CardHeader, EmptyState, ErrorNote, Input, Row, Screen } from '../../../src/components/ui';
import { useAuth } from '../../../src/context/AuthContext';
import { insuranceApi, unwrap, type UploadFile } from '../../../src/lib/api';
import { pickDocument } from '../../../src/lib/pickFile';
import { colors, radius, spacing, type } from '../../../src/theme';

type Exclusion = { id: string; description: string };
type WaitingPeriod = { id: string; condition: string; months: number; waiting_until: string | null };
type SubLimit = { id: string; category: string; limit_text: string };

type Policy = {
  id: string;
  insurer: string;
  plan_name: string;
  status: string;
  policy_number: string;
  sum_insured: string | null;
  premium_amount: string | null;
  premium_due_date: string | null;
  coverage_start: string | null;
  coverage_end: string | null;
  room_rent_limit: string;
  co_payment_percent: string | null;
  structured_data: Record<string, unknown>;
  exclusions: Exclusion[];
  waiting_periods: WaitingPeriod[];
  sub_limits: SubLimit[];
};

type ChatMessage = { id: string; role: 'user' | 'ai'; content: string };
type Estimate = {
  eligible: boolean;
  estimated_insurer_share: string | null;
  estimated_out_of_pocket: string | null;
  reasoning_summary: string;
};

const statusTone = { validated: 'success', needs_review: 'warning', processing: 'neutral' } as const;

function money(value: string | null) {
  if (!value) return '—';
  const n = Number(value);
  if (Number.isNaN(n)) return value;
  return `₹${n.toLocaleString('en-IN')}`;
}

export default function Insurance() {
  const { activeProfile } = useAuth();

  const [policies, setPolicies] = useState<Policy[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState('');
  const [chatBusy, setChatBusy] = useState(false);

  const [claimCategory, setClaimCategory] = useState('');
  const [claimBill, setClaimBill] = useState('');
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [estimating, setEstimating] = useState(false);

  const [confirming, setConfirming] = useState(false);

  const active = policies.find((p) => p.id === activeId) ?? null;

  const load = useCallback(
    async (selectId?: string) => {
      if (!activeProfile) return;
      setError(null);
      try {
        const { data } = await insuranceApi.list(activeProfile.id);
        const list = unwrap<Policy>(data);
        setPolicies(list);
        setActiveId((current) => {
          if (selectId && list.some((p) => p.id === selectId)) return selectId;
          if (current && list.some((p) => p.id === current)) return current;
          return list[0]?.id ?? null;
        });
      } catch {
        setError("Couldn't load your policies. Pull down to retry.");
      }
    },
    [activeProfile]
  );

  useEffect(() => {
    void load();
  }, [load]);

  // Chat history belongs to a policy, so it reloads whenever the selected
  // policy changes rather than accumulating across them.
  useEffect(() => {
    setEstimate(null);
    setChat([]);
    if (!active) return;
    insuranceApi
      .chatHistory(active.id)
      .then((r) => setChat(unwrap<ChatMessage>(r.data)))
      .catch(() => setChat([]));
  }, [active?.id]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function handleUpload() {
    if (!activeProfile) return;
    let file: UploadFile | null = null;
    try {
      file = await pickDocument();
    } catch {
      setError("Couldn't open the file picker.");
      return;
    }
    if (!file) return;

    setUploading(true);
    setError(null);
    try {
      const { data } = await insuranceApi.upload(activeProfile.id, file);
      await load(data.id);
    } catch {
      setError('Upload failed. A policy must be a PDF, JPG or PNG.');
    } finally {
      setUploading(false);
    }
  }

  async function handleAsk() {
    if (!active || !question.trim()) return;
    const q = question.trim();
    setQuestion('');
    setChat((c) => [...c, { id: `local-${Date.now()}`, role: 'user', content: q }]);
    setChatBusy(true);
    try {
      const { data } = await insuranceApi.chat(active.id, q);
      setChat((c) => [...c, data]);
    } catch {
      setChat((c) => [
        ...c,
        { id: `err-${Date.now()}`, role: 'ai', content: "Couldn't reach the assistant. Please try again." },
      ]);
    } finally {
      setChatBusy(false);
    }
  }

  async function handleEstimate() {
    if (!active || !claimCategory.trim() || !claimBill.trim()) return;
    setEstimating(true);
    try {
      const { data } = await insuranceApi.estimate(active.id, claimCategory.trim(), claimBill.trim());
      setEstimate(data);
    } catch {
      setError("Couldn't produce an estimate. Please try again.");
    } finally {
      setEstimating(false);
    }
  }

  async function handleConfirm() {
    if (!active) return;
    setConfirming(true);
    try {
      await insuranceApi.confirm(active.id);
      await load(active.id);
    } catch {
      setError("Couldn't confirm those details.");
    } finally {
      setConfirming(false);
    }
  }

  const extractionFailed = !!active?.structured_data?._extraction_failed;

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brandPurple} />}>
      {!!error && <ErrorNote message={error} onRetry={load} />}

      <Button onPress={handleUpload} loading={uploading}>
        Add a policy
      </Button>

      {policies.length === 0 && !uploading && !error && (
        <EmptyState
          title="No policy uploaded yet"
          note="Upload a policy PDF and its coverage, exclusions and waiting periods are read out automatically."
        />
      )}

      {policies.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {policies.map((p) => (
            <Pressable
              key={p.id}
              onPress={() => setActiveId(p.id)}
              style={[styles.chip, activeId === p.id && styles.chipActive]}
            >
              <Text style={[styles.chipText, activeId === p.id && styles.chipTextActive]}>
                {p.insurer || 'Untitled policy'}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {active && (
        <>
          <Card>
            <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <Text style={type.h2}>{active.insurer || 'Policy'}</Text>
                {!!active.plan_name && <Text style={type.caption}>{active.plan_name}</Text>}
              </View>
              <Badge tone={statusTone[active.status as keyof typeof statusTone] ?? 'neutral'}>
                {active.status.replace('_', ' ')}
              </Badge>
            </Row>

            {extractionFailed && (
              <View style={{ marginTop: spacing.md }}>
                <ErrorNote
                  message={
                    (active.structured_data?.note as string) ??
                    "The text of this policy couldn't be read, so nothing was extracted from it."
                  }
                />
              </View>
            )}

            <View style={styles.factGrid}>
              {[
                ['Policy number', active.policy_number || '—'],
                ['Sum insured', money(active.sum_insured)],
                ['Premium', money(active.premium_amount)],
                ['Co-payment', active.co_payment_percent ? `${active.co_payment_percent}%` : '—'],
                ['Coverage from', active.coverage_start || '—'],
                ['Coverage to', active.coverage_end || '—'],
                ['Room rent limit', active.room_rent_limit || '—'],
                ['Premium due', active.premium_due_date || '—'],
              ].map(([label, value]) => (
                <View key={label} style={styles.fact}>
                  <Text style={type.micro}>{label}</Text>
                  <Text style={type.label}>{value}</Text>
                </View>
              ))}
            </View>

            {active.status !== 'validated' && !extractionFailed && (
              <>
                <Text style={[type.caption, { marginTop: spacing.md }]}>
                  These details were read automatically. Check them against your policy document, then
                  confirm — nothing is treated as verified until you do.
                </Text>
                <Button
                  variant="secondary"
                  onPress={handleConfirm}
                  loading={confirming}
                  style={{ marginTop: spacing.md }}
                >
                  These details are correct
                </Button>
              </>
            )}
          </Card>

          {active.exclusions.length > 0 && (
            <Card>
              <CardHeader title="Exclusions" subtitle="What this policy will not pay for" />
              {active.exclusions.map((e) => (
                <Row key={e.id} style={styles.bulletRow}>
                  <Feather name="x-circle" size={14} color={colors.danger} />
                  <Text style={[type.caption, { flex: 1 }]}>{e.description}</Text>
                </Row>
              ))}
            </Card>
          )}

          {active.waiting_periods.length > 0 && (
            <Card>
              <CardHeader title="Waiting periods" />
              {active.waiting_periods.map((w) => (
                <Row key={w.id} style={styles.bulletRow}>
                  <Feather name="clock" size={14} color={colors.warning} />
                  <View style={{ flex: 1 }}>
                    <Text style={type.caption}>{w.condition}</Text>
                    <Text style={type.micro}>
                      {w.months} months{w.waiting_until ? ` · covered from ${w.waiting_until}` : ''}
                    </Text>
                  </View>
                </Row>
              ))}
            </Card>
          )}

          {active.sub_limits.length > 0 && (
            <Card>
              <CardHeader title="Sub-limits" />
              {active.sub_limits.map((s) => (
                <Row key={s.id} style={styles.bulletRow}>
                  <Feather name="layers" size={14} color={colors.info} />
                  <View style={{ flex: 1 }}>
                    <Text style={type.caption}>{s.category}</Text>
                    <Text style={type.micro}>{s.limit_text}</Text>
                  </View>
                </Row>
              ))}
            </Card>
          )}

          {/* Claim estimator */}
          <Card>
            <CardHeader
              title="Estimate a claim"
              subtitle="Checked against your real exclusions, waiting periods and co-payment"
            />
            <Input
              label="What is the claim for?"
              value={claimCategory}
              onChangeText={setClaimCategory}
              placeholder="e.g. Knee surgery"
            />
            <Input
              label="Estimated bill"
              value={claimBill}
              onChangeText={setClaimBill}
              placeholder="e.g. 150000"
              keyboardType="numeric"
            />
            <Button
              onPress={handleEstimate}
              disabled={!claimCategory.trim() || !claimBill.trim()}
              loading={estimating}
            >
              Estimate
            </Button>

            {estimate && (
              <View style={[styles.estimate, { backgroundColor: estimate.eligible ? colors.successBg : colors.dangerBg }]}>
                <Row>
                  <Feather
                    name={estimate.eligible ? 'check-circle' : 'x-circle'}
                    size={16}
                    color={estimate.eligible ? colors.success : colors.danger}
                  />
                  <Text style={[type.label, { color: estimate.eligible ? colors.success : colors.danger }]}>
                    {estimate.eligible ? 'Likely eligible' : 'Likely not eligible'}
                  </Text>
                </Row>
                {estimate.eligible && (
                  <Row style={{ marginTop: spacing.sm, gap: spacing.xl }}>
                    <View>
                      <Text style={type.micro}>Insurer pays</Text>
                      <Text style={type.title}>{money(estimate.estimated_insurer_share)}</Text>
                    </View>
                    <View>
                      <Text style={type.micro}>You pay</Text>
                      <Text style={type.title}>{money(estimate.estimated_out_of_pocket)}</Text>
                    </View>
                  </Row>
                )}
                <Text style={[type.caption, { marginTop: spacing.sm }]}>{estimate.reasoning_summary}</Text>
                <Text style={[type.micro, { marginTop: spacing.sm }]}>
                  An estimate, not a decision from your insurer.
                </Text>
              </View>
            )}
          </Card>

          {/* Policy Q&A */}
          <Card>
            <CardHeader title="Ask about this policy" subtitle="Answers are grounded in this document" />
            {chat.map((m) => (
              <View
                key={m.id}
                style={[styles.bubble, m.role === 'user' ? styles.bubbleUser : styles.bubbleAi]}
              >
                <Text style={[type.caption, m.role === 'user' && { color: colors.white }]}>
                  {m.content}
                </Text>
              </View>
            ))}
            {chatBusy && <ActivityIndicator color={colors.brandPurple} style={{ marginVertical: spacing.sm }} />}

            <View style={styles.askRow}>
              <TextInput
                value={question}
                onChangeText={setQuestion}
                placeholder="e.g. Is dental treatment covered?"
                placeholderTextColor={colors.ink300}
                style={styles.askInput}
                onSubmitEditing={handleAsk}
                returnKeyType="send"
              />
              <Pressable
                onPress={handleAsk}
                disabled={chatBusy || !question.trim()}
                style={[styles.askSend, (chatBusy || !question.trim()) && { opacity: 0.4 }]}
              >
                <Feather name="arrow-up" size={16} color={colors.white} />
              </Pressable>
            </View>
          </Card>
        </>
      )}
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
  chipActive: { backgroundColor: colors.brandPurple, borderColor: colors.brandPurple },
  chipText: { fontSize: 13, fontWeight: '500', color: colors.ink700 },
  chipTextActive: { color: colors.white },
  factGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.md },
  fact: { width: '50%', paddingVertical: spacing.sm, paddingRight: spacing.sm },
  bulletRow: { alignItems: 'flex-start', paddingVertical: spacing.sm },
  estimate: { marginTop: spacing.md, borderRadius: radius.md, padding: spacing.md },
  bubble: {
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    maxWidth: '90%',
  },
  bubbleUser: { alignSelf: 'flex-end', backgroundColor: colors.brandPurple },
  bubbleAi: { alignSelf: 'flex-start', backgroundColor: colors.surface },
  askRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    paddingVertical: spacing.xs,
    marginTop: spacing.sm,
  },
  askInput: { flex: 1, fontSize: 14, color: colors.ink900, paddingVertical: spacing.sm },
  askSend: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.brandPurple,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
