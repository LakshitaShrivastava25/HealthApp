import { Feather } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Platform, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { Button, Card, EmptyState, ErrorNote, Input, Row, Screen } from '../../../src/components/ui';
import { useAuth } from '../../../src/context/AuthContext';
import { medicinesApi, unwrap } from '../../../src/lib/api';
import { colors, radius, spacing, type } from '../../../src/theme';

type Reminder = { id: string; time_of_day: string; days_of_week: string };
type Medication = {
  id: string;
  name: string;
  dosage: string;
  instructions: string;
  frequency: string;
  reminders: Reminder[];
};
type DoseLog = { id: string; reminder: string; status: string; scheduled_for: string };

function todayIso() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatTime(hhmmss: string) {
  return hhmmss?.slice(0, 5) ?? '';
}

export default function Medicines() {
  const { activeProfile } = useAuth();

  const [medications, setMedications] = useState<Medication[]>([]);
  const [takenToday, setTakenToday] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

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
    if (!activeProfile) return;
    setError(null);
    try {
      const [meds, logs] = await Promise.all([
        medicinesApi.list(activeProfile.id),
        medicinesApi.listDoseLogs(activeProfile.id),
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
    try {
      const { data: medication } = await medicinesApi.create({
        profile: activeProfile.id,
        name: name.trim(),
        dosage: dosage.trim(),
        instructions: instructions.trim(),
        frequency: frequency.trim() || 'daily',
      });
      const hh = String(reminderTime.getHours()).padStart(2, '0');
      const mm = String(reminderTime.getMinutes()).padStart(2, '0');
      await medicinesApi.addReminder(medication.id, `${hh}:${mm}`);

      setName('');
      setDosage('');
      setInstructions('');
      setFrequency('daily');
      setShowForm(false);
      await load();
    } catch {
      setFormError("Couldn't save that medicine. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setConfirmDeleteId(null);
    try {
      await medicinesApi.delete(id);
      await load();
    } catch {
      setError("Couldn't remove that medicine.");
    }
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

      {medications.length === 0 && !showForm && !error && (
        <EmptyState
          title="No medicines on file"
          note="Add one manually above. Medicines are also meant to be created automatically from processed prescriptions."
        />
      )}

      {medications.map((m) => (
        <Card key={m.id}>
          <Row>
            <View style={styles.pillIcon}>
              <Feather name="circle" size={17} color={colors.brandPurple} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={type.title}>{m.name}</Text>
              <Text style={type.micro}>
                {[m.dosage, m.instructions].filter(Boolean).join(' · ') || 'No dosage recorded'}
              </Text>
              {!!m.frequency && <Text style={type.micro}>{m.frequency}</Text>}
            </View>
          </Row>

          {m.reminders.length > 0 && (
            <View style={styles.reminderRow}>
              {m.reminders.map((r) => {
                const taken = takenToday.has(r.id);
                return (
                  <Pressable
                    key={r.id}
                    disabled={taken}
                    onPress={() => markTaken(r.id)}
                    style={[styles.doseChip, taken ? styles.doseChipTaken : styles.doseChipDue]}
                  >
                    <Feather
                      name={taken ? 'check' : 'clock'}
                      size={12}
                      color={taken ? colors.success : colors.warning}
                    />
                    <Text style={[styles.doseText, { color: taken ? colors.success : colors.warning }]}>
                      {formatTime(r.time_of_day)} · {taken ? 'Taken today' : 'Mark taken'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          <View style={styles.cardFooter}>
            {confirmDeleteId === m.id ? (
              <Row>
                <Text style={[type.caption, { color: colors.danger, flex: 1 }]}>Remove {m.name}?</Text>
                <Pressable onPress={() => handleDelete(m.id)}>
                  <Text style={styles.dangerAction}>Yes, remove</Text>
                </Pressable>
                <Pressable onPress={() => setConfirmDeleteId(null)}>
                  <Text style={styles.mutedAction}>Cancel</Text>
                </Pressable>
              </Row>
            ) : (
              <Pressable onPress={() => setConfirmDeleteId(m.id)}>
                <Row>
                  <Feather name="trash-2" size={13} color={colors.ink500} />
                  <Text style={styles.mutedAction}>Remove</Text>
                </Row>
              </Pressable>
            )}
          </View>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
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
  cardFooter: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  dangerAction: { fontSize: 12, fontWeight: '600', color: colors.danger },
  mutedAction: { fontSize: 12, fontWeight: '600', color: colors.ink500 },
});
