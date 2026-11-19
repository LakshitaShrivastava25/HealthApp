import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, type } from '../theme';

export const MPIN_LENGTH = 4;

/**
 * Four dots and a keypad of our own.
 *
 * Not a TextInput with the system keyboard, for two reasons. A PIN is a
 * credential that lives for years, and a third-party keyboard on either
 * platform can see every key — fine for a one-time code, not for this. And
 * the dots never render the digits, so nothing is readable over a shoulder
 * or in a screen recording.
 */

export function MpinDots({ filled, error }: { filled: number; error?: boolean }) {
  return (
    <View style={styles.dots}>
      {Array.from({ length: MPIN_LENGTH }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            i < filled && styles.dotFilled,
            error && styles.dotError,
          ]}
        />
      ))}
    </View>
  );
}

export default function MpinKeypad({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  function press(digit: string) {
    if (disabled || value.length >= MPIN_LENGTH) return;
    onChange(value + digit);
  }

  function backspace() {
    if (disabled || !value.length) return;
    onChange(value.slice(0, -1));
  }

  return (
    <View style={styles.pad}>
      {['123', '456', '789'].map((row) => (
        <View key={row} style={styles.row}>
          {row.split('').map((digit) => (
            <Key key={digit} label={digit} onPress={() => press(digit)} disabled={disabled} />
          ))}
        </View>
      ))}
      <View style={styles.row}>
        {/* Keeps 0 centred under 8 without a stray third key. */}
        <View style={styles.key} />
        <Key label="0" onPress={() => press('0')} disabled={disabled} />
        <Key
          label="⌫"
          onPress={backspace}
          disabled={disabled || !value.length}
          accessibilityLabel="Delete"
          icon
        />
      </View>
    </View>
  );
}

function Key({
  label,
  onPress,
  disabled,
  accessibilityLabel,
  icon,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  icon?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [
        styles.key,
        pressed && !disabled && styles.keyPressed,
        disabled && { opacity: 0.35 },
      ]}
    >
      {icon ? (
        <Feather name="delete" size={22} color={colors.ink700} />
      ) : (
        <Text style={styles.keyText}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  dots: { flexDirection: 'row', justifyContent: 'center', gap: spacing.md },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: 'transparent',
  },
  dotFilled: { backgroundColor: colors.brandPurple, borderColor: colors.brandPurple },
  dotError: { borderColor: colors.danger },
  pad: { gap: spacing.sm, alignSelf: 'center', width: '100%', maxWidth: 300 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  key: {
    flex: 1,
    height: 62,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  keyPressed: { backgroundColor: colors.surface },
  keyText: { ...type.h2, color: colors.ink900, fontWeight: '600' },
});
