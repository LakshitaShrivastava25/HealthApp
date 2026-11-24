import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Card, CardHeader, Input } from './ui';
import DateField from './DateField';
import { colors, radius, spacing, type } from '../theme';

/**
 * The "Review what we read" form.
 *
 * Moved out of the document screen unchanged so two flows can share it: the
 * original one, where it edits a document already saved and awaiting review,
 * and the locker upload, where it collects the same details BEFORE the file
 * is sent. Markup, styles and wording are exactly as they were — a move, not
 * a redesign.
 */

export const CATEGORIES = [
  { value: 'prescription', label: 'Prescription' },
  { value: 'report', label: 'Report' },
  { value: 'scan', label: 'Scan' },
  { value: 'discharge', label: 'Discharge Summary' },
  { value: 'other', label: 'Other' },
];

export type ReviewForm = {
  title: string;
  category: string;
  document_date: string;
  hospital_name: string;
  doctor_name: string;
};

export type FieldErrors = Partial<Record<keyof ReviewForm, string>>;

export default function ReviewDetailsForm({
  form,
  setField,
  subtitle,
  suggestedTitle,
  fieldErrors = {},
  error,
  busy,
  confirmLabel = 'Confirm these details are correct',
  onConfirm,
  children,
}: {
  form: ReviewForm;
  setField: (key: keyof ReviewForm, value: string) => void;
  /** The line under the heading. The upload flow says something different
   *  because nothing has been read yet. */
  subtitle: string;
  suggestedTitle?: string;
  fieldErrors?: FieldErrors;
  error?: string | null;
  busy: boolean;
  confirmLabel?: string;
  onConfirm: () => void;
  /** Slot above the button — the upload flow puts its progress bar here. */
  children?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader title="Review what we read" subtitle={subtitle} />
      <Input label="Title" value={form.title} onChangeText={(v) => setField('title', v)} error={fieldErrors.title} />
      {suggestedTitle && suggestedTitle !== form.title ? (
        <Pressable
          onPress={() => setField('title', suggestedTitle)}
          style={{ marginTop: -spacing.sm, marginBottom: spacing.md }}
        >
          <Text style={[type.micro, { color: colors.brandPurple }]}>
            Use suggested title: “{suggestedTitle}”
          </Text>
        </Pressable>
      ) : null}

      <Text style={[type.caption, { marginBottom: spacing.xs }]}>Category</Text>
      <View style={styles.chipRow}>
        {CATEGORIES.map((c) => (
          <Pressable
            key={c.value}
            onPress={() => setField('category', c.value)}
            style={[styles.chip, form.category === c.value && styles.chipActive]}
          >
            <Text style={[styles.chipText, form.category === c.value && styles.chipTextActive]}>
              {c.label}
            </Text>
          </Pressable>
        ))}
      </View>
      {!!fieldErrors.category && <Text style={styles.fieldError}>{fieldErrors.category}</Text>}

      <DateField
        label="Document date"
        value={form.document_date}
        onChange={(v) => setField('document_date', v)}
        maximumDate={new Date()}
      />
      {!!fieldErrors.document_date && (
        <Text style={[styles.fieldError, { marginTop: -spacing.sm }]}>{fieldErrors.document_date}</Text>
      )}

      <Input
        label="Hospital / source"
        value={form.hospital_name}
        onChangeText={(v) => setField('hospital_name', v)}
        error={fieldErrors.hospital_name}
      />
      <Input
        label="Doctor"
        value={form.doctor_name}
        onChangeText={(v) => setField('doctor_name', v)}
        error={fieldErrors.doctor_name}
      />

      {children}

      {!!error && <Text style={styles.fieldError}>{error}</Text>}
      <Button onPress={onConfirm} loading={busy}>
        {confirmLabel}
      </Button>
    </Card>
  );
}

const styles = StyleSheet.create({
  fieldError: { ...type.micro, color: colors.danger, marginBottom: spacing.md },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  chipActive: { backgroundColor: colors.brandPurple, borderColor: colors.brandPurple },
  chipText: { fontSize: 13, fontWeight: '500' as const, color: colors.ink700 },
  chipTextActive: { color: colors.white },
});
