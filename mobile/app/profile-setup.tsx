import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, ErrorNote, Input } from '../src/components/ui';
import { useAuth } from '../src/context/AuthContext';
import { profilesApi } from '../src/lib/api';
import { colors, radius, spacing, type } from '../src/theme';
import { useConfirmExit } from '../src/lib/useBackHandler';

const GENDERS = [
  { label: 'Male', value: 'male' },
  { label: 'Female', value: 'female' },
  { label: 'Other', value: 'other' },
  { label: 'Prefer not to say', value: 'prefer_not_to_say' },
];

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];

/** yyyy-mm-dd built from local parts — toISOString() uses UTC and can land
 *  on the wrong day for anyone near midnight. */
function isoToday() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * First run for a brand-new account. Creates the 'self' Profile that every
 * other record in the system hangs off — without it the patient screens
 * have nothing to scope to.
 */
export default function ProfileSetup() {
  useConfirmExit();
  const { refreshProfiles } = useAuth();
  const router = useRouter();

  const [fullName, setFullName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState('');
  const [bloodGroup, setBloodGroup] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dobValid = !dateOfBirth || (/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) && dateOfBirth <= isoToday());

  async function handleSave() {
    if (!fullName.trim()) return;
    setError(null);
    setSaving(true);
    try {
      await profilesApi.create({
        full_name: fullName.trim(),
        relation: 'self',
        // Blank optional fields are omitted rather than sent empty: a bare
        // '' fails DateField parsing server-side.
        ...(dateOfBirth ? { date_of_birth: dateOfBirth } : {}),
        ...(gender ? { gender } : {}),
        ...(bloodGroup ? { blood_group: bloodGroup } : {}),
      });
      await refreshProfiles();
      router.replace('/(patient)/(tabs)');
    } catch {
      setError("Couldn't save your profile. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View>
            <Text style={type.h1}>Set up your profile</Text>
            <Text style={[type.caption, { marginTop: spacing.xs }]}>
              This is your own record. You can add family members later — each one keeps their
              documents, medicines and insurance separately.
            </Text>
          </View>

          <Card>
            <Input
              label="Full name"
              value={fullName}
              onChangeText={setFullName}
              placeholder="e.g. Priya Sharma"
              autoCapitalize="words"
            />

            <Input
              label="Date of birth (optional)"
              value={dateOfBirth}
              onChangeText={setDateOfBirth}
              placeholder="YYYY-MM-DD"
              keyboardType="numbers-and-punctuation"
            />
            {!dobValid && (
              <Text style={styles.fieldError}>
                Enter a real past date in YYYY-MM-DD form.
              </Text>
            )}

            <Text style={styles.groupLabel}>Gender (optional)</Text>
            <View style={styles.chipRow}>
              {GENDERS.map((g) => (
                <Pressable
                  key={g.value}
                  onPress={() => setGender((v) => (v === g.value ? '' : g.value))}
                  style={[styles.chip, gender === g.value && styles.chipActive]}
                >
                  <Text style={[styles.chipText, gender === g.value && styles.chipTextActive]}>
                    {g.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.groupLabel}>Blood group (optional)</Text>
            <View style={styles.chipRow}>
              {BLOOD_GROUPS.map((b) => (
                <Pressable
                  key={b}
                  onPress={() => setBloodGroup((v) => (v === b ? '' : b))}
                  style={[styles.chip, bloodGroup === b && styles.chipActive]}
                >
                  <Text style={[styles.chipText, bloodGroup === b && styles.chipTextActive]}>{b}</Text>
                </Pressable>
              ))}
            </View>

            {!!error && (
              <View style={{ marginBottom: spacing.md }}>
                <ErrorNote message={error} />
              </View>
            )}

            <Button onPress={handleSave} disabled={!fullName.trim() || !dobValid} loading={saving}>
              Continue
            </Button>
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  scroll: { padding: spacing.lg, gap: spacing.lg, flexGrow: 1, justifyContent: 'center' },
  groupLabel: { ...type.caption, marginBottom: spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  chipActive: { backgroundColor: colors.brandPurple, borderColor: colors.brandPurple },
  chipText: { fontSize: 13, color: colors.ink700, fontWeight: '500' },
  chipTextActive: { color: colors.white },
  fieldError: { ...type.caption, color: colors.danger, marginTop: -spacing.sm, marginBottom: spacing.md },
});
