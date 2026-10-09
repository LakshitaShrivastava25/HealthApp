import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { RefreshControl, StyleSheet, Text, View } from 'react-native';

import { ModeSwitchCard } from '../../src/components/ModeSwitch';
import { Badge, Button, Card, Row, Screen } from '../../src/components/ui';
import { useAuth } from '../../src/context/AuthContext';
import { DOCTOR_STATUS_LABEL, DOCTOR_STATUS_TONE } from '../../src/lib/councils';
import { colors, radius, spacing, type } from '../../src/theme';
import { useConfirmExit } from '../../src/lib/useBackHandler';
import { useConfirmLogout } from '../../src/hooks/useConfirmLogout';
import { resetTo } from '../../src/lib/navigation';

/**
 * Where a registered-but-unverified doctor waits.
 *
 * Also where a rejected doctor lands, which is why editing the registration
 * stays reachable from here: a rejection is only actionable if the details
 * that caused it can be corrected.
 *
 * The rest of the account keeps working meanwhile — "Switch to user mode"
 * returns to the person's own records on the same sign-in.
 */
export default function PendingVerification() {
  useConfirmExit();
  const { doctor, refreshDoctor } = useAuth();
  const confirmLogout = useConfirmLogout();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const status = doctor?.verification_status ?? 'pending';
  const rejected = status === 'rejected';

  async function onRefresh() {
    setRefreshing(true);
    await refreshDoctor();
    setRefreshing(false);
  }

  // A doctor approved since the last check goes straight to Doctor mode —
  // only then, rather than rebuilding this screen on every pull-to-refresh.
  useEffect(() => {
    if (status === 'verified') resetTo('/');
  }, [status]);

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brandPurple} />}>
      <Card>
        <View style={styles.iconWrap}>
          <Feather
            name={rejected ? 'x-circle' : 'clock'}
            size={26}
            color={rejected ? colors.danger : colors.warning}
          />
        </View>

        <Text style={[type.h2, { textAlign: 'center' }]}>
          {rejected ? 'Registration not approved' : status === 'pending' ? 'Verification pending' : 'Under review'}
        </Text>

        <Text style={[type.caption, styles.centered]}>
          {rejected
            ? 'An administrator reviewed your registration and did not approve it. Correcting your details below resubmits you for review.'
            : status === 'failed'
              ? "We couldn't reach the medical register right now — your registration will be verified shortly. An admin can still review it in the meantime."
              : 'An administrator is checking your registration number and licence. You will be able to request patient access once you are verified.'}
        </Text>

        <Row style={{ justifyContent: 'center', marginTop: spacing.md }}>
          <Badge tone={DOCTOR_STATUS_TONE[status] ?? 'warning'}>{DOCTOR_STATUS_LABEL[status] ?? status}</Badge>
        </Row>

        {rejected && !!doctor?.rejection_reason && (
          <View style={[styles.note, { backgroundColor: colors.dangerBg }]}>
            <Text style={[type.caption, { color: colors.danger }]}>
              <Text style={{ fontWeight: '700' }}>Reason: </Text>
              {doctor.rejection_reason}
            </Text>
          </View>
        )}

        {/* What the NMC register check found, so the doctor knows where
            their registration stands before an admin gets to it. */}
        {!rejected && doctor?.nmc_result === 'found' && (
          <View style={[styles.note, { backgroundColor: colors.successBg }]}>
            <Text style={[type.caption, { color: colors.success }]}>
              Found on the NMC register as <Text style={{ fontWeight: '700' }}>{doctor.nmc_name}</Text>
              {doctor.nmc_qualification ? ` (${doctor.nmc_qualification})` : ''}.
            </Text>
          </View>
        )}
        {!rejected && doctor?.nmc_result === 'not_found' && (
          <View style={[styles.note, { backgroundColor: colors.warningBg }]}>
            <Text style={[type.caption, { color: colors.warning }]}>
              Your registration number wasn't found in {doctor.state_council_name || 'that council'} on the NMC
              register. If it's mistyped, correct it below.
            </Text>
          </View>
        )}
      </Card>

      {!!doctor && (
        <Card>
          {[
            ['Name', `Dr. ${doctor.full_name}`],
            ['Specialization', doctor.specialization],
            ['Registration number', doctor.registration_number || '—'],
            ['Medical council', doctor.state_council_name || '—'],
            ['Clinic', doctor.clinic_name || '—'],
          ].map(([label, value]) => (
            <Row key={label} style={styles.factRow}>
              <Text style={[type.caption, { flex: 1 }]}>{label}</Text>
              <Text style={[type.label, styles.factValue]}>{value}</Text>
            </Row>
          ))}
        </Card>
      )}

      <Button variant="secondary" onPress={() => router.push('/(doctor-setup)/register')}>
        {rejected ? 'Correct my details' : 'Edit my details'}
      </Button>

      <Card>
        <Text style={type.caption}>
          Pull down to check whether an administrator has reviewed your registration.
        </Text>
      </Card>

      <ModeSwitchCard />

      <Button
        variant="secondary"
        onPress={confirmLogout}
      >
        Sign out
      </Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  factValue: { flexShrink: 1, textAlign: 'right', marginLeft: spacing.md },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  centered: { textAlign: 'center', marginTop: spacing.sm },
  note: { borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md },
  factRow: {
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
});
