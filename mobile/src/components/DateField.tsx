import { Feather } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, type } from '../theme';

/** "YYYY-MM-DD" from local date parts — toISOString() would shift by timezone. */
export function toIsoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function fromIsoDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export function formatIsoDate(iso: string | null | undefined) {
  const d = fromIsoDate(iso);
  return d ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : null;
}

/**
 * A tappable field that opens the platform calendar. Value in and out is an
 * ISO "YYYY-MM-DD" string (or '' for unset), matching what the API stores.
 */
export default function DateField({
  label,
  value,
  onChange,
  placeholder = 'Select a date',
  maximumDate,
  minimumDate,
}: {
  label: string;
  value: string;
  onChange: (iso: string) => void;
  placeholder?: string;
  maximumDate?: Date;
  minimumDate?: Date;
}) {
  const [open, setOpen] = useState(false);
  const current = fromIsoDate(value);

  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        style={({ pressed }) => [styles.field, open && styles.fieldActive, pressed && { opacity: 0.8 }]}
      >
        <Feather name="calendar" size={16} color={colors.brandPurple} />
        <Text style={[styles.value, !current && { color: colors.ink300 }]}>
          {formatIsoDate(value) ?? placeholder}
        </Text>
        {!!current && (
          <Pressable onPress={() => onChange('')} hitSlop={10}>
            <Feather name="x-circle" size={16} color={colors.ink300} />
          </Pressable>
        )}
      </Pressable>

      {open && (
        <View style={Platform.OS === 'ios' ? styles.iosSheet : undefined}>
          <DateTimePicker
            value={current ?? new Date(1990, 0, 1)}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'calendar'}
            maximumDate={maximumDate}
            minimumDate={minimumDate}
            accentColor={colors.brandPurple}
            onChange={(event, selected) => {
              // Android shows a dialog that closes itself; iOS stays inline.
              if (Platform.OS !== 'ios') setOpen(false);
              if (event.type === 'set' && selected) onChange(toIsoDate(selected));
            }}
          />
          {Platform.OS === 'ios' && (
            <Pressable onPress={() => setOpen(false)} style={styles.done}>
              <Text style={styles.doneText}>Done</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { ...type.caption, marginBottom: spacing.xs },
  field: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  fieldActive: { borderColor: colors.brandPurple },
  value: { flex: 1, fontSize: 15, color: colors.ink900 },
  iosSheet: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  done: { alignSelf: 'flex-end', padding: spacing.md },
  doneText: { fontSize: 14, fontWeight: '700', color: colors.brandPurple },
});
