import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import DateField from './DateField';
import { ALLERGY_KINDS, BLOOD_GROUPS, ChipSelect, GENDERS, LANGUAGES, RELATIONS } from './profileOptions';
import { Button, ErrorNote, Input, Row } from './ui';
import { allergiesApi, profilesApi } from '../lib/api';
import { colors, radius, spacing, type } from '../theme';

type AllergyDraft = { kind: string; substance: string; reaction: string };

/** The server's own wording where it has some (e.g. a rejected date of birth). */
export function serverMessage(err: unknown, fallback: string) {
  const detail = (err as { response?: { data?: unknown } })?.response?.data;
  if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
    const first = Object.values(detail as Record<string, unknown>)[0];
    if (Array.isArray(first) && typeof first[0] === 'string') return first[0];
    if (typeof first === 'string') return first;
  }
  return fallback;
}

/**
 * The full add-a-person form, matching the website's AddFamilyMemberModal:
 * a member added with only a name and relation looks complete in the
 * switcher while having no blood group, date of birth or allergies.
 *
 * Allergies are a separate model (AllergyRecord), so they are posted after
 * the profile exists and has an id.
 */
export default function AddFamilyMemberForm({
  onDone,
  onCancel,
}: {
  /** Called after the profile is created. `warning` is set when some allergies failed to save. */
  onDone: (warning?: string) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [fullName, setFullName] = useState('');
  const [relation, setRelation] = useState('father');
  const [dob, setDob] = useState('');
  const [gender, setGender] = useState('');
  const [bloodGroup, setBloodGroup] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [language, setLanguage] = useState('English');
  const [allergies, setAllergies] = useState<AllergyDraft[]>([]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateAllergy(i: number, patch: Partial<AllergyDraft>) {
    setAllergies((list) => list.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
  }

  async function handleSave() {
    if (!fullName.trim()) return;
    setError(null);
    setSaving(true);

    let profileId: string;
    try {
      const { data } = await profilesApi.create({
        full_name: fullName.trim(),
        relation,
        // Omitted rather than sent empty: '' is a value to store (and fails
        // date/integer parsing), a missing field is "not provided".
        ...(dob ? { date_of_birth: dob } : {}),
        ...(gender ? { gender } : {}),
        ...(bloodGroup ? { blood_group: bloodGroup } : {}),
        ...(heightCm.trim() ? { height_cm: Number(heightCm) } : {}),
        ...(weightKg.trim() ? { weight_kg: Number(weightKg) } : {}),
        preferred_language: language,
      });
      profileId = data.id;
    } catch (err) {
      setError(serverMessage(err, 'Could not add this family member. Please try again.'));
      setSaving(false);
      return;
    }

    // The profile now exists, so a failure from here on must not leave the
    // form open for a retry that would create the same person twice.
    let failed = 0;
    for (const a of allergies) {
      if (!a.substance.trim()) continue;
      try {
        await allergiesApi.create({
          profile: profileId,
          kind: a.kind,
          substance: a.substance.trim(),
          reaction: a.reaction.trim(),
        });
      } catch {
        failed += 1;
      }
    }

    setSaving(false);
    await onDone(
      failed
        ? `${fullName.trim()} was added, but ${failed} ${failed === 1 ? 'allergy' : 'allergies'} couldn't be saved. Add ${failed === 1 ? 'it' : 'them'} again from Settings.`
        : undefined
    );
  }

  return (
    <View style={{ marginTop: spacing.md }}>
      <Input
        label="Full name *"
        value={fullName}
        onChangeText={setFullName}
        placeholder="e.g. Ramesh Sharma"
        autoCapitalize="words"
      />

      <ChipSelect label="Relation *" options={RELATIONS} value={relation} onChange={setRelation} />

      {/* Capped at today; the server rejects a future date of birth too. */}
      <DateField
        label="Date of birth"
        value={dob}
        onChange={setDob}
        placeholder="Select date of birth"
        maximumDate={new Date()}
        minimumDate={new Date(1900, 0, 1)}
      />

      <ChipSelect label="Gender" options={GENDERS} value={gender} onChange={setGender} allowClear />
      <ChipSelect label="Blood group" options={BLOOD_GROUPS} value={bloodGroup} onChange={setBloodGroup} allowClear />

      <Row style={{ gap: spacing.md }}>
        <View style={{ flex: 1 }}>
          <Input label="Height (cm)" value={heightCm} onChangeText={setHeightCm} keyboardType="numeric" placeholder="170" />
        </View>
        <View style={{ flex: 1 }}>
          <Input label="Weight (kg)" value={weightKg} onChangeText={setWeightKg} keyboardType="numeric" placeholder="65" />
        </View>
      </Row>

      <ChipSelect label="Preferred language" options={LANGUAGES} value={language} onChange={setLanguage} />

      <View style={styles.allergyHeader}>
        <Text style={type.caption}>Allergies</Text>
        <Pressable
          onPress={() => setAllergies((l) => [...l, { kind: 'drug', substance: '', reaction: '' }])}
          hitSlop={8}
          style={styles.addAllergy}
        >
          <Feather name="plus" size={13} color={colors.brandPurple} />
          <Text style={styles.addAllergyText}>Add allergy</Text>
        </Pressable>
      </View>
      {allergies.length === 0 ? (
        <Text style={[type.micro, { marginBottom: spacing.md }]}>None recorded. You can add these later too.</Text>
      ) : (
        allergies.map((a, i) => (
          <View key={i} style={styles.allergyBox}>
            <Row style={{ justifyContent: 'space-between', marginBottom: spacing.sm }}>
              <Text style={type.label}>Allergy {i + 1}</Text>
              <Pressable
                onPress={() => setAllergies((l) => l.filter((_, idx) => idx !== i))}
                hitSlop={10}
                accessibilityLabel={`Remove allergy ${i + 1}`}
              >
                <Feather name="x" size={16} color={colors.ink500} />
              </Pressable>
            </Row>
            <ChipSelect options={ALLERGY_KINDS} value={a.kind} onChange={(kind) => updateAllergy(i, { kind })} />
            <Input
              value={a.substance}
              onChangeText={(substance) => updateAllergy(i, { substance })}
              placeholder="Substance (e.g. Penicillin)"
            />
            <Input
              value={a.reaction}
              onChangeText={(reaction) => updateAllergy(i, { reaction })}
              placeholder="Reaction (optional)"
            />
          </View>
        ))
      )}

      {!!error && <ErrorNote message={error} />}

      <Row style={{ gap: spacing.sm }}>
        <Button style={{ flex: 1 }} onPress={handleSave} disabled={!fullName.trim()} loading={saving}>
          Add member
        </Button>
        <Button variant="secondary" style={{ flex: 1 }} onPress={onCancel} disabled={saving}>
          Cancel
        </Button>
      </Row>
    </View>
  );
}

const styles = StyleSheet.create({
  allergyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  addAllergy: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addAllergyText: { fontSize: 12, fontWeight: '600', color: colors.brandPurple },
  allergyBox: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
});
