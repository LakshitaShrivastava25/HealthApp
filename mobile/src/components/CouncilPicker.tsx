import { Feather } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { COUNCILS, councilName } from '../lib/councils';
import { colors, radius, spacing, type } from '../theme';

/**
 * "State Medical Council" — the council the doctor is registered with. The
 * NMC register is searched per council, so this is what makes a
 * registration number checkable. A searchable sheet rather than a 30-item
 * scroll, styled to sit among the form's Inputs.
 */
export default function CouncilPicker({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (code: string) => void;
  error?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNCILS;
    return COUNCILS.filter((c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase() === q);
  }, [query]);

  function close() {
    setOpen(false);
    setQuery('');
  }

  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={styles.label}>State Medical Council</Text>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`State Medical Council: ${councilName(value) || 'not chosen'}`}
        style={[styles.field, !!error && { borderColor: colors.danger }]}
      >
        <Text style={[styles.fieldText, !value && { color: colors.ink300 }]} numberOfLines={1}>
          {councilName(value) || 'Choose the council you registered with'}
        </Text>
        <Feather name="chevron-down" size={16} color={colors.ink500} />
      </Pressable>
      {!!error && <Text style={styles.error}>{error}</Text>}

      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <Pressable style={styles.backdrop} onPress={close}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={[type.title, { marginBottom: spacing.md }]}>State Medical Council</Text>
            <View style={styles.search}>
              <Feather name="search" size={15} color={colors.ink300} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search, e.g. Maharashtra"
                placeholderTextColor={colors.ink300}
                autoFocus
                style={styles.searchInput}
              />
            </View>
            <FlatList
              data={matches}
              keyExtractor={(c) => c.code}
              keyboardShouldPersistTaps="handled"
              style={{ maxHeight: 380 }}
              ListEmptyComponent={<Text style={[type.caption, { padding: spacing.md }]}>No council matches that.</Text>}
              renderItem={({ item }) => {
                const active = item.code === value;
                return (
                  <Pressable
                    onPress={() => {
                      onChange(item.code);
                      close();
                    }}
                    style={[styles.option, active && styles.optionActive]}
                  >
                    <Text style={[type.label, { flex: 1 }]}>{item.name}</Text>
                    {active && <Feather name="check" size={16} color={colors.brandPurple} />}
                  </Pressable>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { ...type.caption, marginBottom: spacing.xs },
  field: {
    minHeight: 46,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  fieldText: { flex: 1, fontSize: 15, color: colors.ink900 },
  error: { ...type.caption, color: colors.danger, marginTop: spacing.xs },
  backdrop: { flex: 1, backgroundColor: 'rgba(31,36,48,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  searchInput: { flex: 1, minHeight: 42, fontSize: 15, color: colors.ink900 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  optionActive: { backgroundColor: colors.brandLavender },
});
