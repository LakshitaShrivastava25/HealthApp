import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, type } from '../theme';

/**
 * Choice lists for a Profile, straight from backend/family/models.py
 * (Profile.Relation, Profile.Gender, AllergyRecord.Kind) and the website's
 * add-family-member modal, so both clients offer and store the same values.
 */

export type Option = { value: string; label: string };

/** Profile.Relation minus `self` — a new member is always someone else. */
export const RELATIONS: Option[] = [
  { value: 'father', label: 'Father' },
  { value: 'mother', label: 'Mother' },
  { value: 'spouse', label: 'Spouse' },
  { value: 'son', label: 'Son' },
  { value: 'daughter', label: 'Daughter' },
  { value: 'other', label: 'Other' },
];

export const GENDERS: Option[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

/** Matches the language list on the website's Settings and add-member forms. */
export const LANGUAGES = ['English', 'Hindi', 'Marathi', 'Tamil', 'Telugu', 'Bengali'];

export const ALLERGY_KINDS: Option[] = [
  { value: 'drug', label: 'Drug' },
  { value: 'food', label: 'Food' },
  { value: 'environmental', label: 'Environmental' },
  { value: 'other', label: 'Other' },
];

/** Snake-case choice value in sentence case: "prefer_not_to_say" -> "Prefer not to say". */
function sentenceCase(value: string) {
  const words = value.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function relationLabel(relation?: string | null) {
  if (!relation) return '';
  if (relation === 'self') return 'Self';
  return RELATIONS.find((r) => r.value === relation)?.label ?? sentenceCase(relation);
}

export function genderLabel(gender?: string | null) {
  if (!gender) return null;
  return GENDERS.find((g) => g.value === gender)?.label ?? sentenceCase(gender);
}

export function allergyKindLabel(kind?: string | null) {
  if (!kind) return '';
  return ALLERGY_KINDS.find((k) => k.value === kind)?.label ?? sentenceCase(kind);
}

/**
 * A row of pill buttons for picking one value. With `allowClear`, tapping the
 * selected pill again clears it (for optional fields).
 */
export function ChipSelect({
  label,
  options,
  value,
  onChange,
  allowClear = false,
}: {
  label?: string;
  options: (Option | string)[];
  value: string;
  onChange: (value: string) => void;
  allowClear?: boolean;
}) {
  return (
    <>
      {!!label && <Text style={[type.caption, { marginBottom: spacing.sm }]}>{label}</Text>}
      <View style={styles.chipRow}>
        {options.map((o) => {
          const opt = typeof o === 'string' ? { value: o, label: o } : o;
          const active = value === opt.value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => onChange(active && allowClear ? '' : opt.value)}
              style={[styles.chip, active && styles.chipActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
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
  chipText: { fontSize: 13, fontWeight: '500', color: colors.ink700 },
  chipTextActive: { color: colors.white },
});
