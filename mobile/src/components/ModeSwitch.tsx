import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import type { Href } from 'expo-router';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { useAuth, type Mode } from '../context/AuthContext';
import { DOCTOR_STATUS_LABEL, DOCTOR_STATUS_TONE } from '../lib/councils';
import { resetTo } from '../lib/navigation';
import { colors, radius, spacing, type } from '../theme';
import { Badge, Card, Row } from './ui';

/** The same look as the website's switch (frontend/src/shared/session/ModeSwitch.tsx). */
export const MODE_STYLE: Record<
  Mode,
  { label: string; icon: 'account' | 'stethoscope'; color: string; soft: string; note: string }
> = {
  patient: {
    label: 'User',
    icon: 'account',
    color: colors.brandPurple,
    soft: colors.brandLavender,
    note: "Your own and your family's records",
  },
  doctor: {
    label: 'Doctor',
    icon: 'stethoscope',
    color: colors.brandTeal,
    soft: '#E0F7F7',
    note: 'Your patients, access requests and records',
  },
};

const ORDER: Mode[] = ['patient', 'doctor'];

/**
 * Switching User / Doctor mode. Renders nothing until the account has
 * registered as a doctor — "Register as a doctor" on More is the way in.
 *
 * The switch goes through app/switch-mode.tsx: the current area is left
 * first, while the mode is still unchanged, and the mode flips there. Flipping
 * it in place made the open area's guard redirect at the same moment the
 * switch navigated — a loop that closed the app.
 */
export function useModeSwitch() {
  const { mode, hasRegistered } = useAuth();
  const target: Mode = mode === 'doctor' ? 'patient' : 'doctor';
  return {
    available: hasRegistered,
    mode,
    target,
    switchTo: (next: Mode = target) => {
      if (next === mode) return;
      resetTo({ pathname: '/switch-mode', params: { to: next } } as unknown as Href);
    },
  };
}

/**
 * The header control: "User | Doctor", the current mode filled in. Icons
 * only on narrow screens (as the website does on phones), with labels when
 * there is room or `labels` is set.
 */
export function ModeToggle({ labels }: { labels?: boolean }) {
  const { available, mode, switchTo } = useModeSwitch();
  const { width } = useWindowDimensions();
  if (!available) return null;
  const showLabels = labels ?? width >= 480;

  return (
    <View style={styles.toggle} accessibilityRole="radiogroup" accessibilityLabel="Switch between User and Doctor mode">
      {ORDER.map((option) => {
        const selected = option === mode;
        const s = MODE_STYLE[option];
        return (
          <Pressable
            key={option}
            onPress={() => switchTo(option)}
            disabled={selected}
            hitSlop={6}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={`${s.label} mode`}
            accessibilityHint={selected ? undefined : `Switch to ${s.label} mode`}
            style={({ pressed }) => [
              styles.segment,
              !showLabels && styles.segmentIconOnly,
              selected && [styles.segmentSelected, { backgroundColor: s.color }],
              pressed && !selected && { backgroundColor: colors.card },
            ]}
          >
            <MaterialCommunityIcons name={s.icon} size={15} color={selected ? colors.white : colors.ink500} />
            {showLabels && (
              <Text style={[styles.segmentText, { color: selected ? colors.white : colors.ink500 }]}>{s.label}</Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

/** A labelled row for More / Profile / the pending screen. */
export function ModeSwitchCard() {
  const { doctor } = useAuth();
  const { available, target, switchTo } = useModeSwitch();
  if (!available) return null;
  const m = MODE_STYLE[target];
  const status = doctor?.verification_status;
  return (
    <Card onPress={() => switchTo()}>
      <Row>
        <View style={[styles.icon, { backgroundColor: m.soft }]}>
          <MaterialCommunityIcons name={m.icon} size={19} color={m.color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={type.label}>Switch to {m.label.toLowerCase()} mode</Text>
          <Text style={type.micro}>
            {target === 'doctor' && status !== 'verified' ? 'See where your registration is' : m.note}
          </Text>
        </View>
        {target === 'doctor' && status && status !== 'verified' && (
          <Badge tone={DOCTOR_STATUS_TONE[status] ?? 'warning'}>{DOCTOR_STATUS_LABEL[status] ?? status}</Badge>
        )}
        <Feather name="repeat" size={16} color={colors.ink300} />
      </Row>
    </Card>
  );
}

const styles = StyleSheet.create({
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    padding: 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  segment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
  },
  segmentIconOnly: { paddingHorizontal: 9 },
  segmentSelected: {
    shadowColor: '#101828',
    shadowOpacity: 0.12,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  segmentText: { fontSize: 12, fontWeight: '700' },
  icon: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
