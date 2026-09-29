import { forwardRef, ReactNode, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type RefreshControlProps,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { colors, radius, shadow, spacing, tones, type ToneName, type as typeScale } from '../theme';
import { EmptyArt } from './Illustrations';

/**
 * The native counterpart of the web app's components/ui.tsx — the same
 * vocabulary (Card, Badge, Button, EmptyState) so a screen ported from web
 * reads the same way here.
 */

export function Card({
  children,
  style,
  onPress,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}) {
  const content = <View style={[styles.card, style]}>{children}</View>;
  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
      {content}
    </Pressable>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

export function CardHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.cardHeader}>
      <Text style={typeScale.title}>{title}</Text>
      {!!subtitle && <Text style={[typeScale.caption, { marginTop: 2 }]}>{subtitle}</Text>}
    </View>
  );
}

export function Badge({ tone = 'neutral', children }: { tone?: ToneName; children: ReactNode }) {
  const t = tones[tone];
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }]}>
      <Text style={[styles.badgeText, { color: t.fg }]}>{children}</Text>
    </View>
  );
}

export function Button({
  children,
  onPress,
  disabled,
  loading,
  variant = 'primary',
  style,
}: {
  children: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
  style?: StyleProp<ViewStyle>;
}) {
  const isDisabled = disabled || loading;
  const palette = {
    primary: { bg: colors.brandPurple, fg: colors.white },
    secondary: { bg: colors.brandLavender, fg: colors.brandPurple },
    danger: { bg: colors.dangerBg, fg: colors.danger },
  }[variant];

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: palette.bg },
        isDisabled && styles.buttonDisabled,
        pressed && !isDisabled && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} size="small" />
      ) : (
        <Text style={[styles.buttonText, { color: palette.fg }]}>{children}</Text>
      )}
    </Pressable>
  );
}

type InputProps = TextInputProps & {
  label?: string;
  /** Quiet helper line under the field. */
  hint?: string;
  /** Replaces the hint and turns the border red. */
  error?: string | null;
};

/**
 * Text field with a visible focus ring, so it is always obvious which box
 * the keyboard is typing into. Forwards its ref so screens can move focus
 * from one field to the next with the keyboard's "next" key.
 */
export const Input = forwardRef<TextInput, InputProps>(function Input(props, ref) {
  const { label, hint, error, style, onFocus, onBlur, ...rest } = props;
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ marginBottom: spacing.md }}>
      {!!label && <Text style={styles.inputLabel}>{label}</Text>}
      <TextInput
        ref={ref}
        placeholderTextColor={colors.ink300}
        {...rest}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[
          styles.input,
          rest.multiline && styles.inputMultiline,
          focused && styles.inputFocused,
          !!error && styles.inputError,
          style,
        ]}
      />
      {error ? (
        <Text style={[styles.inputHint, { color: colors.danger }]}>{error}</Text>
      ) : hint ? (
        <Text style={styles.inputHint}>{hint}</Text>
      ) : null}
    </View>
  );
});

export function EmptyState({ title, note }: { title: string; note?: string }) {
  return (
    <Card style={styles.emptyState}>
      <View style={{ marginBottom: spacing.md }}>
        <EmptyArt width={130} />
      </View>
      <Text style={[typeScale.title, { textAlign: 'center' }]}>{title}</Text>
      {!!note && (
        <Text style={[typeScale.caption, { textAlign: 'center', marginTop: spacing.xs }]}>{note}</Text>
      )}
    </Card>
  );
}

export function Loading({ label }: { label?: string }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.brandPurple} />
      {!!label && <Text style={[typeScale.caption, { marginTop: spacing.sm }]}>{label}</Text>}
    </View>
  );
}

/**
 * A failure the person can actually act on. Screens use this instead of
 * silently rendering an empty list when a request fails — an empty locker
 * and an unreachable server look identical otherwise, and only one of them
 * is the person's fault to fix.
 */
export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card style={{ borderColor: colors.danger, backgroundColor: colors.dangerBg }}>
      <Text style={[typeScale.body, { color: colors.danger }]}>{message}</Text>
      {!!onRetry && (
        <Pressable onPress={onRetry} style={{ marginTop: spacing.sm }}>
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      )}
    </Card>
  );
}

/**
 * Standard page body: consistent padding and a pull-to-refresh slot.
 *
 * Keyboard-aware on both platforms: when a field is focused the page grows
 * by the keyboard's height and scrolls that field into view, following the
 * keyboard's own animation. A plain KeyboardAvoidingView cannot do this
 * reliably here — Android draws edge-to-edge, so the window no longer
 * shrinks for the keyboard, and screens under a header or tab bar would
 * need hand-tuned offsets.
 */
export function Screen({
  children,
  refreshControl,
  contentStyle,
}: {
  children: ReactNode;
  refreshControl?: React.ReactElement<RefreshControlProps>;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  return (
    <KeyboardAwareScrollView
      style={{ flex: 1, backgroundColor: colors.surface }}
      contentContainerStyle={[styles.screenContent, contentStyle]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      bottomOffset={spacing.xl}
      refreshControl={refreshControl}
    >
      {children}
    </KeyboardAwareScrollView>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    ...shadow.card,
  },
  pressed: { opacity: 0.75 },
  cardHeader: { marginBottom: spacing.sm },
  sectionTitle: {
    ...typeScale.label,
    color: colors.ink700,
    marginBottom: spacing.sm,
    marginTop: spacing.xs,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  badgeText: { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  button: {
    minHeight: 46,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
  },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { fontSize: 15, fontWeight: '600', flexShrink: 1, textAlign: 'center' },
  inputLabel: { ...typeScale.caption, marginBottom: spacing.xs },
  input: {
    minHeight: 46,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: 15,
    color: colors.ink900,
  },
  inputMultiline: { minHeight: 88, paddingTop: spacing.md, textAlignVertical: 'top' },
  inputFocused: { borderColor: colors.brandPurple, backgroundColor: colors.white },
  inputError: { borderColor: colors.danger },
  inputHint: { ...typeScale.micro, color: colors.ink500, marginTop: spacing.xs },
  emptyState: { paddingVertical: spacing.xxl, alignItems: 'center' },
  loading: { paddingVertical: spacing.xxxl, alignItems: 'center' },
  retryText: { fontSize: 13, fontWeight: '600', color: colors.danger },
  // Capped and centred so tablets and landscape get a readable column, not a stretched one.
  screenContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
