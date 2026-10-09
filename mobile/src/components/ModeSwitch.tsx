import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth, type Mode } from '../context/AuthContext';
import { DOCTOR_STATUS_LABEL, DOCTOR_STATUS_TONE } from '../lib/councils';
import { colors, radius, spacing, type } from '../theme';
import { Badge, Card, Row } from './ui';
import { resetTo } from '../lib/navigation';

const MODES: Record<Mode, { label: string; icon: keyof typeof Feather.glyphMap; color: string; bg: string }> = {
  patient: { label: 'User', icon: 'user', color: colors.brandPurple, bg: colors.brandLavender },
  doctor: { label: 'Doctor', icon: 'briefcase', color: colors.brandTeal, bg: '#E0F7F7' },
};

/**
 * The User / Doctor switch. Renders nothing until the account has registered
 * as a doctor — the "Register as a doctor" entry on More is the way in.
 *
 * Switching goes back through the index route, which opens the right place
 * for the new mode: the doctor tabs, or the pending screen while an admin is
 * still verifying the registration. The website has the same control
 * (frontend/src/shared/session/ModeSwitch.tsx).
 */
export function useModeSwitch() {
  const { mode, switchMode, hasRegistered } = useAuth();
  const target: Mode = mode === 'doctor' ? 'patient' : 'doctor';
  return {
    available: hasRegistered,
    target,
    switchTo: (next: Mode = target) => {
      switchMode(next);
      // The whole previous area goes, not just its top screen, so Back can't
      // land on a stale copy of it.
      resetTo('/');
    },
  };
}

/** Compact header pill: shows the mode a tap switches TO. */
export function ModeSwitchPill() {
  const { available, target, switchTo } = useModeSwitch();
  if (!available) return null;
  const m = MODES[target];
  return (
    <Pressable
      onPress={() => switchTo()}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={`Switch to ${m.label} mode`}
      style={({ pressed }) => [styles.pill, { backgroundColor: m.bg }, pressed && { opacity: 0.7 }]}
    >
      <Feather name="repeat" size={12} color={m.color} />
      <Feather name={m.icon} size={14} color={m.color} />
      <Text style={[styles.pillText, { color: m.color }]}>{m.label}</Text>
    </Pressable>
  );
}

/** A labelled row for More / Profile / the pending screen. */
export function ModeSwitchCard() {
  const { doctor } = useAuth();
  const { available, target, switchTo } = useModeSwitch();
  if (!available) return null;
  const m = MODES[target];
  const status = doctor?.verification_status;
  return (
    <Card onPress={() => switchTo()}>
      <Row>
        <View style={[styles.icon, { backgroundColor: m.bg }]}>
          <Feather name={m.icon} size={17} color={m.color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={type.label}>Switch to {m.label.toLowerCase()} mode</Text>
          <Text style={type.micro}>
            {target === 'doctor'
              ? status === 'verified'
                ? 'Your patients, access requests and records'
                : 'See where your registration is'
              : "Your own and your family's records"}
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
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 6,
  },
  pillText: { fontSize: 12, fontWeight: '700' },
  icon: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
