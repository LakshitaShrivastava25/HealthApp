import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';

import { Badge, Card, ErrorNote, Row, Screen } from '../../../src/components/ui';
import { useAuth } from '../../../src/context/AuthContext';
import {
  doctorAccessApi,
  documentsApi,
  insuranceApi,
  medicinesApi,
  notificationsApi,
  profilesApi,
  unwrap,
} from '../../../src/lib/api';
import { colors, radius, shadow, spacing, type } from '../../../src/theme';

type Doc = {
  id: string;
  title: string;
  category: string;
  status: string;
  document_date: string | null;
  hospital_name: string;
};
type Med = { id: string; name: string; dosage: string; instructions: string };
type Grant = {
  id: string;
  status: string;
  doctor_detail: { full_name: string; specialization: string; clinic_name: string } | null;
};
type Notif = { id: string; title: string; message: string; is_read: boolean };
type FeatherName = keyof typeof Feather.glyphMap;

const categoryTone = {
  report: 'info',
  prescription: 'success',
  scan: 'warning',
  discharge: 'neutral',
  other: 'neutral',
} as const;

const SUGGESTIONS = ['Summarise my latest report', 'Which medicines am I taking?', 'Am I covered for surgery?'];

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function todayLabel() {
  return new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
}

export default function Dashboard() {
  const { activeProfile, profiles } = useAuth();
  const router = useRouter();

  const [documents, setDocuments] = useState<Doc[]>([]);
  const [documentCount, setDocumentCount] = useState(0);
  const [medications, setMedications] = useState<Med[]>([]);
  const [policyCount, setPolicyCount] = useState(0);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [notifications, setNotifications] = useState<Notif[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [question, setQuestion] = useState('');
  const [asked, setAsked] = useState<string | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  const load = useCallback(async () => {
    if (!activeProfile) return;
    setLoadError(null);
    try {
      const [docs, meds, policies, access, notifs] = await Promise.all([
        documentsApi.list(activeProfile.id),
        medicinesApi.list(activeProfile.id),
        insuranceApi.list(activeProfile.id),
        doctorAccessApi.listForProfile(activeProfile.id),
        notificationsApi.list(activeProfile.id),
      ]);
      const allDocs = unwrap<Doc>(docs.data);
      setDocuments(allDocs.slice(0, 4));
      setDocumentCount(allDocs.length);
      setMedications(unwrap<Med>(meds.data));
      setPolicyCount(unwrap(policies.data).length);
      setGrants(unwrap<Grant>(access.data));
      setNotifications(unwrap<Notif>(notifs.data).filter((n) => !n.is_read));
    } catch {
      setLoadError("Couldn't load your dashboard. Check your connection and pull down to retry.");
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

  async function ask(text: string) {
    if (!activeProfile || !text.trim() || asking) return;
    const submitted = text.trim();
    setAsked(submitted);
    setQuestion('');
    setAnswer(null);
    setAsking(true);
    try {
      const { data } = await profilesApi.ask(activeProfile.id, submitted);
      setAnswer(data.answer);
    } catch {
      setAnswer('Something went wrong reaching the AI assistant. Is the backend running?');
    } finally {
      setAsking(false);
    }
  }

  const pendingRequests = grants.filter((g) => g.status === 'pending');
  const approvedCount = grants.filter((g) => g.status === 'approved').length;

  // The same explainable readiness signals the web dashboard uses — real
  // account facts, never presented as a medical measurement.
  const checks: { label: string; done: boolean; href: Href }[] = [
    { label: 'Add your blood group', done: !!activeProfile?.blood_group, href: '/(patient)/settings' },
    { label: 'Upload a document', done: documentCount > 0, href: '/(patient)/(tabs)/locker' },
    { label: 'Track a medicine', done: medications.length > 0, href: '/(patient)/(tabs)/medicines' },
    { label: 'Add a family member', done: profiles.length > 1, href: '/(patient)/settings' },
  ];
  const doneCount = checks.filter((c) => c.done).length;
  const score = Math.round((doneCount / checks.length) * 100);
  const scoreTone = score >= 75 ? colors.success : score >= 40 ? colors.warning : colors.brandPurple;
  const scoreLabel = score >= 75 ? 'Well set up' : score >= 40 ? 'Getting there' : 'Just started';

  const firstName = activeProfile?.full_name.split(' ')[0] ?? '';

  const stats: { label: string; value: number; icon: FeatherName; tint: string; bg: string; href: Href }[] = [
    { label: 'Medicines', value: medications.length, icon: 'clock', tint: colors.brandPurple, bg: colors.brandLavender, href: '/(patient)/(tabs)/medicines' },
    { label: 'Documents', value: documentCount, icon: 'file-text', tint: colors.info, bg: colors.infoBg, href: '/(patient)/(tabs)/locker' },
    { label: 'Policies', value: policyCount, icon: 'shield', tint: colors.brandTeal, bg: '#E3F6F6', href: '/(patient)/(tabs)/insurance' },
    { label: 'Doctors', value: approvedCount, icon: 'user-check', tint: colors.success, bg: colors.successBg, href: '/(patient)/doctor-access' },
  ];

  const quickActions: { label: string; icon: FeatherName; href: Href }[] = [
    { label: 'Upload', icon: 'upload', href: '/(patient)/(tabs)/locker' },
    { label: 'Timeline', icon: 'activity', href: '/(patient)/timeline' },
    { label: 'Emergency', icon: 'alert-triangle', href: '/(patient)/emergency' },
    { label: 'Find care', icon: 'search', href: '/(patient)/find-care' },
  ];

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brandPurple} />}>
      {/* Greeting */}
      <View>
        <Text style={styles.dateLabel}>{todayLabel()}</Text>
        <Text style={styles.greeting}>
          {greeting()}
          {firstName ? `, ${firstName}` : ''}
        </Text>
      </View>

      {!!loadError && <ErrorNote message={loadError} onRetry={load} />}

      {/* AI Health Assistant */}
      <View style={styles.aiCard}>
        <View style={styles.aiGlow} />
        <Row>
          <View style={styles.aiIcon}>
            <Feather name="zap" size={16} color={colors.brandPurple} />
          </View>
          <Text style={styles.aiKicker}>AI Health Assistant</Text>
        </Row>
        <Text style={styles.aiHeadline}>Ask anything about your health, reports or medicines.</Text>

        {!asked && (
          <View style={styles.chipRow}>
            {SUGGESTIONS.map((s) => (
              <Pressable key={s} onPress={() => ask(s)} style={({ pressed }) => [styles.chip, pressed && { opacity: 0.7 }]}>
                <Text style={styles.chipText}>{s}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {!!asked && (
          <View style={styles.askedBubble}>
            <Text style={styles.aiBubbleText}>{asked}</Text>
          </View>
        )}
        {asking && (
          <View style={styles.answerBubble}>
            <ActivityIndicator color={colors.white} size="small" />
          </View>
        )}
        {!!answer && !asking && (
          <View style={styles.answerBubble}>
            <Text style={styles.aiBubbleText}>{answer}</Text>
          </View>
        )}

        <View style={styles.askRow}>
          <TextInput
            value={question}
            onChangeText={setQuestion}
            placeholder="Type your question..."
            placeholderTextColor="rgba(255,255,255,0.65)"
            style={styles.askInput}
            onSubmitEditing={() => ask(question)}
            returnKeyType="send"
          />
          <Pressable
            onPress={() => ask(question)}
            disabled={asking || !question.trim()}
            style={[styles.askSend, (asking || !question.trim()) && { opacity: 0.5 }]}
          >
            <Feather name="arrow-up" size={18} color={colors.brandPurple} />
          </Pressable>
        </View>
      </View>

      {/* Pending consent requests — the one thing needing an actual decision */}
      {pendingRequests.length > 0 && (
        <Pressable onPress={() => router.push('/(patient)/doctor-access')} style={styles.alertCard}>
          <View style={[styles.iconTile, { backgroundColor: colors.card }]}>
            <Feather name="alert-circle" size={18} color={colors.warning} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={type.title}>
              {pendingRequests.length} doctor{pendingRequests.length > 1 ? 's are' : ' is'} requesting access
            </Text>
            <Text style={type.caption} numberOfLines={2}>
              {pendingRequests.map((g) => `Dr. ${g.doctor_detail?.full_name ?? 'A doctor'}`).join(', ')} — nothing is
              shared until you approve.
            </Text>
          </View>
          <Feather name="chevron-right" size={18} color={colors.ink500} />
        </Pressable>
      )}

      {/* Health at a glance — a true 2x2 grid */}
      <SectionHeader title="Health at a glance" />
      <View style={styles.statGrid}>
        {[stats.slice(0, 2), stats.slice(2, 4)].map((pair, i) => (
          <View key={i} style={styles.statRow}>
            {pair.map((s) => (
              <Pressable
                key={s.label}
                onPress={() => router.push(s.href)}
                style={({ pressed }) => [styles.statCard, pressed && styles.pressed]}
              >
                <Row style={{ justifyContent: 'space-between' }}>
                  <View style={[styles.iconTile, { backgroundColor: s.bg }]}>
                    <Feather name={s.icon} size={18} color={s.tint} />
                  </View>
                  <Feather name="arrow-up-right" size={16} color={colors.ink300} />
                </Row>
                <Text style={styles.statValue}>{s.value}</Text>
                <Text style={styles.statLabel}>{s.label}</Text>
              </Pressable>
            ))}
          </View>
        ))}
      </View>

      {/* Quick actions */}
      <SectionHeader title="Quick actions" />
      <View style={styles.quickRow}>
        {quickActions.map((a) => (
          <Pressable
            key={a.label}
            onPress={() => router.push(a.href)}
            style={({ pressed }) => [styles.quickItem, pressed && styles.pressed]}
          >
            <View style={styles.quickIcon}>
              <Feather name={a.icon} size={20} color={colors.brandPurple} />
            </View>
            <Text style={styles.quickLabel} numberOfLines={1}>{a.label}</Text>
          </Pressable>
        ))}
      </View>

      {/* Readiness — hidden once everything is done */}
      {score < 100 && (
        <Card>
          <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <Text style={type.title}>Complete your profile</Text>
              <Text style={[type.caption, { marginTop: 2 }]}>
                {doneCount} of {checks.length} done · {scoreLabel}
              </Text>
            </View>
            <View style={[styles.scorePill, { backgroundColor: scoreTone + '1A' }]}>
              <Text style={[styles.scoreValue, { color: scoreTone }]}>{score}%</Text>
            </View>
          </Row>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${score}%`, backgroundColor: scoreTone }]} />
          </View>
          {checks.map((c, i) => (
            <Pressable
              key={c.label}
              disabled={c.done}
              onPress={() => router.push(c.href)}
              style={[styles.checkRow, i === checks.length - 1 && { borderBottomWidth: 0 }]}
            >
              <View style={[styles.checkDot, c.done && styles.checkDotDone]}>
                {c.done && <Feather name="check" size={12} color={colors.white} />}
              </View>
              <Text style={[styles.checkLabel, c.done && styles.checkLabelDone]}>{c.label}</Text>
              {!c.done && <Feather name="chevron-right" size={16} color={colors.ink300} />}
            </Pressable>
          ))}
        </Card>
      )}

      {notifications.length > 0 && (
        <>
          <SectionHeader title="Reminders" />
          <Card style={styles.listCard}>
            {notifications.slice(0, 4).map((n, i) => (
              <Pressable
                key={n.id}
                onPress={async () => {
                  await notificationsApi.markRead(n.id);
                  setNotifications((prev) => prev.filter((x) => x.id !== n.id));
                }}
                style={[styles.listRow, i === Math.min(notifications.length, 4) - 1 && { borderBottomWidth: 0 }]}
              >
                <View style={[styles.iconTile, { backgroundColor: colors.warningBg }]}>
                  <Feather name="bell" size={16} color={colors.warning} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{n.title}</Text>
                  <Text style={type.caption} numberOfLines={2}>{n.message}</Text>
                </View>
                <Feather name="check" size={16} color={colors.ink300} />
              </Pressable>
            ))}
          </Card>
        </>
      )}

      {/* Recent records */}
      <SectionHeader title="Recent records" action="See all" onAction={() => router.push('/(patient)/(tabs)/locker')} />
      <Card style={styles.listCard}>
        {documents.length === 0 ? (
          <EmptyRow icon="file-plus" text="No documents yet — upload one from the Locker." />
        ) : (
          documents.map((d, i) => (
            <Pressable
              key={d.id}
              onPress={() => router.push(`/(patient)/document/${d.id}`)}
              style={[styles.listRow, i === documents.length - 1 && { borderBottomWidth: 0 }]}
            >
              <View style={[styles.iconTile, { backgroundColor: colors.infoBg }]}>
                <Feather name="file-text" size={16} color={colors.info} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle} numberOfLines={1}>{d.title || 'Untitled document'}</Text>
                <Text style={type.micro} numberOfLines={1}>
                  {[d.document_date, d.hospital_name].filter(Boolean).join(' · ') || 'No date recorded'}
                </Text>
              </View>
              <Badge tone={categoryTone[d.category as keyof typeof categoryTone] ?? 'neutral'}>{d.category}</Badge>
            </Pressable>
          ))
        )}
      </Card>

      {/* Active medicines */}
      <SectionHeader title="Active medicines" action="See all" onAction={() => router.push('/(patient)/(tabs)/medicines')} />
      <Card style={styles.listCard}>
        {medications.length === 0 ? (
          <EmptyRow icon="plus-circle" text="No medicines on file yet." />
        ) : (
          medications.slice(0, 4).map((m, i, arr) => (
            <Pressable
              key={m.id}
              onPress={() => router.push('/(patient)/(tabs)/medicines')}
              style={[styles.listRow, i === arr.length - 1 && { borderBottomWidth: 0 }]}
            >
              <View style={[styles.iconTile, { backgroundColor: colors.brandLavender }]}>
                <Feather name="clock" size={16} color={colors.brandPurple} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{m.name}</Text>
                <Text style={type.micro} numberOfLines={1}>
                  {[m.dosage, m.instructions].filter(Boolean).join(' · ') || 'No dosage recorded'}
                </Text>
              </View>
            </Pressable>
          ))
        )}
      </Card>
    </Screen>
  );
}

function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <Row style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {!!action && (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={styles.sectionAction}>{action}</Text>
        </Pressable>
      )}
    </Row>
  );
}

function EmptyRow({ icon, text }: { icon: FeatherName; text: string }) {
  return (
    <Row style={{ paddingVertical: spacing.md }}>
      <Feather name={icon} size={16} color={colors.ink300} />
      <Text style={[type.caption, { flex: 1 }]}>{text}</Text>
    </Row>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },

  dateLabel: { fontSize: 12, fontWeight: '600', color: colors.ink500, textTransform: 'uppercase', letterSpacing: 0.6 },
  greeting: { fontSize: 26, fontWeight: '800', color: colors.ink900, marginTop: 2 },

  aiCard: {
    backgroundColor: colors.brandPurple,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md,
    overflow: 'hidden',
    shadowColor: colors.brandPurple,
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  aiGlow: {
    position: 'absolute',
    right: -50,
    top: -60,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  aiIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiKicker: { color: colors.white, fontSize: 13, fontWeight: '700', opacity: 0.95 },
  aiHeadline: { color: colors.white, fontSize: 18, fontWeight: '700', lineHeight: 24 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  chipText: { color: colors.white, fontSize: 12, fontWeight: '600' },
  askedBubble: {
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: radius.md,
    borderBottomRightRadius: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    maxWidth: '85%',
  },
  answerBubble: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: radius.md,
    borderBottomLeftRadius: 4,
    padding: spacing.md,
    maxWidth: '95%',
  },
  aiBubbleText: { color: colors.white, fontSize: 14, lineHeight: 20 },
  askRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: radius.pill,
    paddingLeft: spacing.lg,
    paddingRight: 5,
    paddingVertical: 5,
    gap: spacing.sm,
  },
  askInput: { flex: 1, color: colors.white, fontSize: 14, paddingVertical: spacing.sm },
  askSend: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },

  alertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.warningBg,
    borderWidth: 1,
    borderColor: '#FBD9A5',
  },

  sectionHeader: { justifyContent: 'space-between', marginTop: spacing.sm, marginBottom: -spacing.xs },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.ink900 },
  sectionAction: { fontSize: 13, fontWeight: '600', color: colors.brandPurple },

  statGrid: { gap: spacing.md },
  statRow: { flexDirection: 'row', gap: spacing.md },
  statCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    ...shadow.card,
  },
  iconTile: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: { fontSize: 28, fontWeight: '800', color: colors.ink900, marginTop: spacing.md },
  statLabel: { fontSize: 13, fontWeight: '500', color: colors.ink500, marginTop: 2 },

  quickRow: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.lg,
    ...shadow.card,
  },
  quickItem: { flex: 1, alignItems: 'center', gap: spacing.sm },
  quickIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.brandLavender,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLabel: { fontSize: 12, fontWeight: '600', color: colors.ink700 },

  scorePill: { paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.pill },
  scoreValue: { fontSize: 15, fontWeight: '800' },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.surface,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  progressFill: { height: 8, borderRadius: 4 },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  checkDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.ink300,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkDotDone: { backgroundColor: colors.success, borderColor: colors.success },
  checkLabel: { flex: 1, fontSize: 14, fontWeight: '500', color: colors.ink900 },
  checkLabelDone: { color: colors.ink300, textDecorationLine: 'line-through' },

  listCard: { paddingVertical: spacing.xs },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowTitle: { fontSize: 14, fontWeight: '600', color: colors.ink900 },
});
