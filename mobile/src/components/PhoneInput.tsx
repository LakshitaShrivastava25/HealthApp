import { Feather } from '@expo/vector-icons';
import { forwardRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';

import { colors, radius, spacing, type } from '../theme';

/** Indian mobile numbers: ten digits after the +91 country code. */
export const PHONE_DIGITS = 10;

/**
 * Pull the ten local digits out of whatever was typed or pasted —
 * "+91 98765 43210", "09876543210", "919876543210" and "98765-43210" all
 * come out as "9876543210".
 */
export function localDigits(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  if (digits.length > PHONE_DIGITS && digits.startsWith('91')) digits = digits.slice(2);
  if (digits.length > PHONE_DIGITS && digits.startsWith('0')) digits = digits.slice(1);
  return digits.slice(0, PHONE_DIGITS);
}

/** "9876543210" → "+919876543210", the form the backend stores. */
export function toE164(digits: string): string {
  return `+91${localDigits(digits)}`;
}

export function isValidPhone(digits: string): boolean {
  return /^[6-9]\d{9}$/.test(localDigits(digits));
}

/** "9876543210" → "98765 43210", the way the number is read aloud. */
function formatForDisplay(digits: string): string {
  return digits.length > 5 ? `${digits.slice(0, 5)} ${digits.slice(5)}` : digits;
}

type Props = Omit<TextInputProps, 'value' | 'onChangeText' | 'keyboardType' | 'maxLength' | 'style'> & {
  /** Applied to the bordered field, prefix included. */
  style?: StyleProp<ViewStyle>;
  label?: string;
  hint?: string;
  error?: string | null;
  /** The ten local digits, without the +91. */
  value: string;
  onChangeText: (digits: string) => void;
};

/**
 * Phone field with a fixed +91 prefix. It opens the plain number pad (no
 * "+", "*" or "#" to mistype), spaces the number as it is typed, stops at
 * ten digits and ticks once the number is complete.
 */
const PhoneInput = forwardRef<TextInput, Props>(function PhoneInput(
  { label, hint, error, value, onChangeText, onFocus, onBlur, style, ...rest },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const digits = localDigits(value);
  const complete = isValidPhone(digits);
  const startsWrong = digits.length > 0 && !/^[6-9]/.test(digits);
  const shownError = error ?? (startsWrong ? 'Indian mobile numbers start with 6, 7, 8 or 9.' : null);

  return (
    <View style={styles.wrap}>
      {!!label && <Text style={styles.label}>{label}</Text>}
      <View
        style={[
          styles.field,
          focused && styles.fieldFocused,
          !!shownError && styles.fieldError,
          style,
        ]}
      >
        <View style={styles.prefix}>
          <Text style={styles.prefixText}>+91</Text>
        </View>
        <TextInput
          ref={ref}
          {...rest}
          value={formatForDisplay(digits)}
          onChangeText={(text) => onChangeText(localDigits(text))}
          keyboardType="number-pad"
          inputMode="numeric"
          textContentType="telephoneNumber"
          autoComplete="tel-national"
          // No maxLength: a pasted "+91 98765 43210" must arrive whole so
          // localDigits can strip the country code; it caps at ten itself.
          placeholder={rest.placeholder ?? '98765 43210'}
          placeholderTextColor={colors.ink300}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={styles.input}
        />
        {complete && <Feather name="check-circle" size={18} color={colors.success} style={styles.tick} />}
      </View>
      {shownError ? (
        <Text style={[styles.hint, { color: colors.danger }]}>{shownError}</Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
});

export default PhoneInput;

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.md },
  label: { ...type.caption, marginBottom: spacing.xs },
  field: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  fieldFocused: { borderColor: colors.brandPurple, backgroundColor: colors.white },
  fieldError: { borderColor: colors.danger },
  prefix: {
    alignSelf: 'stretch',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  prefixText: { fontSize: 16, fontWeight: '600', color: colors.ink700 },
  input: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 18,
    letterSpacing: 0.5,
    color: colors.ink900,
  },
  tick: { marginRight: spacing.md },
  hint: { ...type.micro, color: colors.ink500, marginTop: spacing.xs },
});
