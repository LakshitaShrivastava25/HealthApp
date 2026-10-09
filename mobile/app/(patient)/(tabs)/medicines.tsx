import { Feather } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Platform, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { Badge, Button, Card, EmptyState, ErrorNote, Input, Row, Screen, SectionTitle, Loading } from '../../../src/components/ui';
import { useAuth } from '../../../src/context/AuthContext';
import { medicinesApi, unwrap } from '../../../src/lib/api';
import { syncMedicineReminders } from '../../../src/lib/notifications';
import { colors, radius, spacing, type, type ToneName } from '../../../src/theme';
import { useFocusRefresh } from '../../../src/hooks/useFocusRefresh';

type Reminder = { id: string; time_of_day: string; days_of_week: string };
type HistoryEntry = {
  date: string | null;
  doctor_name: string;
  hospital_name: string;
  name: string;
  strength: string;
  dosage: string;
  frequency: string;
  instructions: string;
  duration: string;
  action: string;
  action_text: string;
  source_deleted: boolean;
  documents: { id: string; title: string }[];
};
type Suggestion = { id: string; name: string; reason: string };
type Medication = {
  id: string;
  name: string;
  dosage: string;
  instructions: string;
  frequency: string;
  is_active: boolean;
  reminders: Reminder[];
  generic_name: string;
  brand_names: string[];
  status: string;
  status_reason: string;
  newer_prescriptions_without: number;
  possible_duplicates: Suggestion[];
  origin: string;
  history: HistoryEntry[];
};
type DoseLog = { id: string; reminder: string; status: string; scheduled_for: string };

const STATUS: Record<string, { label: string; tone: ToneName }> = {
  active: { label: 'Active', tone: 'success' },
  continued: { label: 'Continued', tone: 'success' },
  modified: { label: 'Dose changed', tone: 'info' },
  needs_review: { label: 'Needs review', tone: 'warning' },
  discontinued: { label: 'Stopped', tone: 'neutral' },
  completed: { label: 'Course completed', tone: 'neutral' },
  one_time: { label: 'One-time dose', tone: 'neutral' },
};

const ACTION_LABEL: Record<string, string> = {
  start: 'Started',
  continue: 'Continue',
  change: 'Changed',
  stop: 'Stop',
  hold: 'Temporarily withheld',
  one_time: 'One-time',
};

function todayIso() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatTime(hhmmss: string) {
  return hhmmss?.slice(0, 5) ?? '';
}

/** "2026-06-03" -> "3 Jun 2026", without a timezone shift. */
function formatDate(iso: string | null) {
  if (!iso) return 'Undated';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d} ${months[m - 1]} ${y}`;
}

function doctorLabel(name: string) {
  if (!name) return '';
  return /^dr\b/i.test(name) ? name : `Dr ${name}`;
}

function needsAttention(m: Medication) {
  return m.is_active && (m.status === 'needs_review' || m.newer_prescriptions_without > 0 || m.possible_duplicates.length > 0);
}

export default function Medicines() {
  const { activeProfile, profiles } = useAuth();
  const profileId = activeProfile?.id ?? null;
  const router = useRouter();

  const [medications, setMedications] = useState<Medication[]>([]);
  const [takenToday, setTakenToday] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  // False until the first load finishes: a loader, not "nothing here yet".
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showPast, setShowPast] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [dosage, setDosage] = useState('');
  const [instructions, setInstructions] = useState('');
  const [frequency, setFrequency] = useState('daily');
  const [reminderTime, setReminderTime] = useState(new Date(new Date().setHours(8, 0, 0, 0)));
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profileId) return;
    setError(null);
    try {
      // Current and past together: one request, split on screen.
      const [meds, logs] = await Promise.all([
        medicinesApi.list(profileId, 'all'),
        medicinesApi.listDoseLogs(profileId),
      ]);
      setMedications(unwrap<Medication>(meds.data));
      const today = todayIso();
      setTakenToday(
        new Set(
          unwrap<DoseLog>(logs.data)
            .filter((l) => l.status === 'taken' && l.scheduled_for?.slice(0, 10) === today)
            .map((l) => l.reminder)
        )
      );
    } catch {
      setError("Couldn't load your medicines. Pull down to retry.");
    } finally {
      setLoaded(true);
    }
  }, [profileId]);

  // Not on every tab switch: see useFocusRefresh.
  useFocusRefresh(load, profileId ? `medicines:${profileId}` : null);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function markTaken(reminderId: string) {
    // Marked locally first so the tap feels instant, then reconciled — a
    // failed write reverts rather than leaving a dose falsely logged.
    setTakenToday((prev) => new Set(prev).add(reminderId));
    try {
      await medicinesApi.logDose(reminderId, 'taken', new Date().toISOString());
    } catch {
      setTakenToday((prev) => {
        const next = new Set(prev);
        next.delete(reminderId);
        return next;
      });
      setError("Couldn't record that dose. Check your connection and try again.");
    }
  }

  async function handleAdd() {
    if (!activeProfile || !name.trim()) return;
    setFormError(null);
    setSaving(true);
    let medication: Medication;
    try {
      // If this medicine is already on the list from a prescription, the
      // backend answers with that one record, so the reminder lands there.
      ({ data: medication } = await medicinesApi.create({
        profile: activeProfile.id,
        name: name.trim(),
        dosage: dosage.trim(),
        instructions: instructions.trim(),
        frequency: frequency.trim() || 'daily',
      }));
    } catch {
      setFormError("Couldn't save that medicine. Check your connection and try again.");
      setSaving(false);
      return;
    }

    // The medicine exists from here on. If only the reminder fails, say so
    // and close the form — a retry would create the medicine a second time.
    let reminderFailed = false;
    try {
      const hh = String(reminderTime.getHours()).padStart(2, '0');
      const mm = String(reminderTime.getMinutes()).padStart(2, '0');
      await medicinesApi.addReminder(medication.id, `${hh}:${mm}`);
    } catch {
      reminderFailed = true;
    }

    setName('');
    setDosage('');
    setInstructions('');
    setFrequency('daily');
    setShowForm(false);
    setSaving(false);
    await load();
    if (reminderFailed) {
      setError(
        `${medication.name} was saved, but its reminder couldn't be set. Remove the medicine and add it again to get a reminder.`
      );
    }
    void syncMedicineReminders(profiles);
  }

  async function handleDelete(id: string) {
    setConfirmDeleteId(null);
    try {
      await medicinesApi.delete(id);
      await load();
      void syncMedicineReminders(profiles);
    } catch {
      setError("Couldn't remove that medicine.");
    }
  }

  /** Runs a change, reloads (statuses are recomputed server-side) and resyncs reminders. */
  async function act(run: () => Promise<unknown>) {
    try {
      await run();
      await load();
      void syncMedicineReminders(profiles);
    } catch {
      setError("That change couldn't be saved. Check your connection and try again.");
    }
  }

  const attention = medications.filter(needsAttention);
  const current = medications.filter((m) => m.is_active && !needsAttention(m));
  const past = medications.filter((m) => !m.is_active);

  function renderCard(m: Medication) {
    return (
      <MedicineCard
        key={m.id}
        m={m}
        takenToday={takenToday}
        onMarkTaken={markTaken}
        confirmingDelete={confirmDeleteId === m.id}
        onAskDelete={() => setConfirmDeleteId(m.id)}
        onCancelDelete={() => setConfirmDeleteId(null)}
        onDelete={() => handleDelete(m.id)}
        onSetStatus={(status) => act(() => medicinesApi.setStatus(m.id, status))}
        onMerge={(otherId) => act(() => medicinesApi.merge(m.id, otherId))}
        onKeepSeparate={(otherId) => act(() => medicinesApi.keepSeparate(m.id, otherId))}
        onOpenDocument={(id) => router.push(`/(patient)/document/${id}`)}
      />
    );
  }

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brandPurple} />}>
      {!!error && <ErrorNote message={error} onRetry={load} />}

      <Button variant={showForm ? 'secondary' : 'primary'} onPress={() => setShowForm((v) => !v)}>
        {showForm ? 'Cancel' : 'Add a medicine'}
      </Button>

      {showForm && (
        <Card>
          <Text style={[type.title, { marginBottom: spacing.md }]}>New medicine</Text>
          <Input label="Name" value={name} onChangeText={setName} placeholder="e.g. Paracetamol 650mg" />
          <Input label="Dosage" value={dosage} onChangeText={setDosage} placeholder="e.g. 1 tablet" />
          <Input
            label="Instructions"
            value={instructions}
            onChangeText={setInstructions}
            placeholder="e.g. After food"
          />
          <Input label="Frequency" value={frequency} onChangeText={setFrequency} placeholder="e.g. daily" />

          <Text style={[type.caption, { marginBottom: spacing.xs }]}>Reminder time</Text>
          <Pressable style={styles.timeButton} onPress={() => setShowTimePicker(true)}>
            <Feather name="clock" size={15} color={colors.brandPurple} />
            <Text style={type.label}>
              {String(reminderTime.getHours()).padStart(2, '0')}:
              {String(reminderTime.getMinutes()).padStart(2, '0')}
            </Text>
          </Pressable>

          {showTimePicker && (
            <DateTimePicker
              value={reminderTime}
              mode="time"
              is24Hour
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={(_event, selected) => {
                // Android dismisses itself; iOS keeps the spinner mounted.
                if (Platform.OS !== 'ios') setShowTimePicker(false);
                if (selected) setReminderTime(selected);
              }}
            />
          )}

          {!!formError && (
            <View style={{ marginVertical: spacing.md }}>
              <ErrorNote message={formError} />
            </View>
          )}

          <Button onPress={handleAdd} disabled={!name.trim()} loading={saving} style={{ marginTop: spacing.md }}>
            Save medicine
          </Button>
        </Card>
      )}

      {!loaded && !error && <Loading />}
      {loaded && medications.length === 0 && !showForm && !error && (
        <EmptyState
          title="No medicines on file"
          note="Medicines are added automatically when a prescription is processed, or add one above."
        />
      )}

      {attention.length > 0 && (
        <>
          <SectionTitle>Needs your attention ({attention.length})</SectionTitle>
          <Text style={[type.caption, styles.sectionNote]}>
            Prescriptions that disagree, medicines missing from newer prescriptions, or entries that may be the same medicine.
          </Text>
          {attention.map(renderCard)}
        </>
      )}

      {current.length > 0 && (
        <>
          <SectionTitle>Current medicines ({current.length})</SectionTitle>
          {current.map(renderCard)}
        </>
      )}

      {past.length > 0 && (
        <>
          <Pressable onPress={() => setShowPast((v) => !v)} hitSlop={8} style={styles.pastToggle}>
            <Feather name={showPast ? 'chevron-down' : 'chevron-right'} size={15} color={colors.ink700} />
            <Text style={styles.pastToggleText}>Past medicines ({past.length})</Text>
          </Pressable>
          {showPast && past.map(renderCard)}
        </>
      )}
    </Screen>
  );
}

function MedicineCard({
  m,
  takenToday,
  onMarkTaken,
  confirmingDelete,
  onAskDelete,
  onCancelDelete,
  onDelete,
  onSetStatus,
  onMerge,
  onKeepSeparate,
  onOpenDocument,
}: {
  m: Medication;
  takenToday: Set<string>;
  onMarkTaken: (reminderId: string) => void;
  confirmingDelete: boolean;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
  onSetStatus: (status: 'taking' | 'stopped') => void;
  onMerge: (otherId: string) => void;
  onKeepSeparate: (otherId: string) => void;
  onOpenDocument: (id: string) => void;
}) {
  const [showHistory, setShowHistory] = useState(false);
  const status = STATUS[m.status] ?? STATUS.active;
  const firstIngredient = (m.generic_name || '').toLowerCase().split(' + ')[0];
  const showGeneric = !!m.generic_name && !m.name.toLowerCase().includes(firstIngredient);
  const subtitle = [showGeneric ? m.generic_name : '', m.brand_names?.length ? `Brand: ${m.brand_names.join(', ')}` : '']
    .filter(Boolean)
    .join(' · ');

  return (
    <Card style={!m.is_active && { opacity: 0.85 }}>
      <Row>
        <View style={styles.pillIcon}>
          <Feather name="circle" size={17} color={colors.brandPurple} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={type.title}>{m.name}</Text>
          {!!subtitle && <Text style={type.caption}>{subtitle}</Text>}
          <Text style={type.micro}>
            {[m.dosage, m.instructions].filter(Boolean).join(' · ') || 'No dosage recorded'}
          </Text>
          {!!m.frequency && <Text style={type.micro}>{m.frequency}</Text>}
        </View>
      </Row>
      <View style={{ marginTop: spacing.sm, alignSelf: 'flex-start' }}>
        <Badge tone={status.tone}>{status.label}</Badge>
      </View>
      {!!m.status_reason && <Text style={[type.caption, styles.reason]}>{m.status_reason}</Text>}

      {m.is_active && m.reminders.length > 0 && (
        <View style={styles.reminderRow}>
          {m.reminders.map((r) => {
            const taken = takenToday.has(r.id);
            return (
              <Pressable
                key={r.id}
                disabled={taken}
                onPress={() => onMarkTaken(r.id)}
                style={[styles.doseChip, taken ? styles.doseChipTaken : styles.doseChipDue]}
              >
                <Feather name={taken ? 'check' : 'clock'} size={12} color={taken ? colors.success : colors.warning} />
                <Text style={[styles.doseText, { color: taken ? colors.success : colors.warning }]}>
                  {formatTime(r.time_of_day)} · {taken ? 'Taken today' : 'Mark taken'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {m.is_active && m.newer_prescriptions_without > 0 && (
        <View style={[styles.prompt, { backgroundColor: colors.warningBg }]}>
          <Text style={[type.label, { marginBottom: spacing.sm }]}>Are you still taking this?</Text>
          <Row>
            <Button variant="secondary" onPress={() => onSetStatus('taking')} style={styles.smallButton}>
              Yes, still taking
            </Button>
            <Button variant="danger" onPress={() => onSetStatus('stopped')} style={styles.smallButton}>
              No, stopped
            </Button>
          </Row>
        </View>
      )}

      {m.possible_duplicates.map((s) => (
        <View key={s.id} style={[styles.prompt, { backgroundColor: colors.infoBg }]}>
          <Text style={[type.caption, { color: colors.ink700, marginBottom: spacing.sm }]}>
            Possibly the same medicine as <Text style={{ fontWeight: '700' }}>{s.name}</Text> — {s.reason.toLowerCase()}.
          </Text>
          <Row>
            <Button variant="secondary" onPress={() => onMerge(s.id)} style={styles.smallButton}>
              Same — merge
            </Button>
            <Button variant="secondary" onPress={() => onKeepSeparate(s.id)} style={styles.smallButton}>
              Different
            </Button>
          </Row>
        </View>
      ))}

      <View style={styles.cardFooter}>
        {confirmingDelete ? (
          <Row>
            <Text style={[type.caption, { color: colors.danger, flex: 1 }]}>Remove {m.name}?</Text>
            <Pressable onPress={onDelete} hitSlop={10} style={styles.actionTap}>
              <Text style={styles.dangerAction}>Yes, remove</Text>
            </Pressable>
            <Pressable onPress={onCancelDelete} hitSlop={10} style={styles.actionTap}>
              <Text style={styles.mutedAction}>Cancel</Text>
            </Pressable>
          </Row>
        ) : (
          <Row style={{ flexWrap: 'wrap' }}>
            {m.history.length > 0 && (
              <Pressable onPress={() => setShowHistory((v) => !v)} hitSlop={10} style={styles.actionTap}>
                <Row>
                  <Feather name="clock" size={13} color={colors.brandPurple} />
                  <Text style={styles.linkAction}>
                    {showHistory ? 'Hide history' : `History (${m.history.length})`}
                  </Text>
                </Row>
              </Pressable>
            )}
            {!m.is_active && (
              <Pressable onPress={() => onSetStatus('taking')} hitSlop={10} style={styles.actionTap}>
                <Text style={styles.mutedAction}>Still taking it</Text>
              </Pressable>
            )}
            {m.is_active && m.newer_prescriptions_without === 0 && m.origin === 'prescription' && (
              <Pressable onPress={() => onSetStatus('stopped')} hitSlop={10} style={styles.actionTap}>
                <Text style={styles.mutedAction}>Mark stopped</Text>
              </Pressable>
            )}
            <View style={{ flex: 1 }} />
            <Pressable onPress={onAskDelete} hitSlop={10} style={styles.actionTap}>
              <Row>
                <Feather name="trash-2" size={13} color={colors.ink500} />
                <Text style={styles.mutedAction}>Remove</Text>
              </Row>
            </Pressable>
          </Row>
        )}
      </View>

      {showHistory &&
        m.history.map((h, i) => (
          <View key={i} style={styles.historyItem}>
            <Row style={{ flexWrap: 'wrap' }}>
              <Text style={[type.label, { color: colors.ink900 }]}>{formatDate(h.date)}</Text>
              {!!h.doctor_name && <Text style={type.caption}>{doctorLabel(h.doctor_name)}</Text>}
              {!!h.action && (
                <Badge tone={h.action === 'stop' ? 'danger' : 'neutral'}>{ACTION_LABEL[h.action] ?? h.action}</Badge>
              )}
            </Row>
            <Text style={[type.caption, { marginTop: 2 }]}>
              {[h.name, h.dosage && h.dosage !== h.strength ? h.dosage : '', h.frequency, h.instructions, h.duration]
                .filter(Boolean)
                .join(' · ')}
            </Text>
            {!!h.action_text && <Text style={[type.micro, { fontStyle: 'italic' }]}>“{h.action_text}”</Text>}
            {h.source_deleted ? (
              <Text style={type.micro}>From a document that was later deleted from the locker.</Text>
            ) : (
              h.documents.map((d) => (
                <Pressable key={d.id} onPress={() => onOpenDocument(d.id)} hitSlop={6}>
                  <Text style={styles.linkAction}>{d.title || 'View prescription'} →</Text>
                </Pressable>
              ))
            )}
          </View>
        ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  actionTap: { paddingVertical: 6, paddingHorizontal: 4 },
  pillIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.brandLavender,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    alignSelf: 'flex-start',
  },
  sectionNote: { marginTop: -spacing.sm },
  reason: { marginTop: spacing.sm, color: colors.ink700, lineHeight: 17 },
  reminderRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  doseChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.md,
  },
  doseChipDue: { backgroundColor: colors.warningBg },
  doseChipTaken: { backgroundColor: colors.successBg },
  doseText: { fontSize: 12, fontWeight: '600' },
  prompt: { marginTop: spacing.md, borderRadius: radius.md, padding: spacing.md },
  smallButton: { flex: 1, paddingVertical: 8, minHeight: 0 },
  cardFooter: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  historyItem: {
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  pastToggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  pastToggleText: { fontSize: 14, fontWeight: '600', color: colors.ink700 },
  dangerAction: { fontSize: 12, fontWeight: '600', color: colors.danger },
  mutedAction: { fontSize: 12, fontWeight: '600', color: colors.ink500 },
  linkAction: { fontSize: 12, fontWeight: '600', color: colors.brandPurple },
});
