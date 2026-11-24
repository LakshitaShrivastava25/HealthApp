import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, spacing, type } from '../theme';

/**
 * The "← Back" at the top of every sign-in and PIN step — the same control
 * the website shows (frontend/src/shared/auth/BackButton). Steps used to
 * have only a small "Change" next to the number, or nothing at all.
 */
export default function BackLink({
  onPress,
  label = 'Back',
  disabled,
}: {
  onPress: () => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={12}
      style={[styles.row, disabled && { opacity: 0.5 }]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Feather name="arrow-left" size={16} color={colors.ink500} />
      <Text style={styles.text}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginBottom: spacing.md },
  text: { ...type.caption, color: colors.ink500, fontWeight: '600' },
});
