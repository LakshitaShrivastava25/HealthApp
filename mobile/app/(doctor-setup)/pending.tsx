import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, StyleSheet, Text, View } from 'react-native';

import { Badge, Button, Card, Row, Screen } from '../../src/components/ui';
import { useAuth } from '../../src/context/AuthContext';
import { colors, radius, spacing, type } from '../../src/theme';
import { useConfirmExit } from '../../src/lib/useBackHandler';

/**
 * Where a registered-but-unverified doctor waits.
 *
 * Also where a rejected doctor lands, which is why editing the profile
 * stays reachable from here: a rejection is only actionable if the details
 * that caused it can be corrected.
 */
export default function PendingVerification() {
  useConfirmExit();
  const { doctor, refreshDoctor, logout } = useAuth();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const rejected = doctor?.verification_status === 'rejected';

  async function onRefresh() {
    setRefreshing(true);
    await refreshDoctor();
    setRefreshing(false);
    // A doctor approved since the last check should not have to restart the
    // app to notice — the index route re-evaluates the portal for them.
    router.replace('/');
  }

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
          {rejected ? 'Registration not approved' : 'Verification in progress'}
        </Text>

        <Text style={[type.caption, styles.centered]}>
          {rejected
            ? 'An administrator reviewed your registration and did not approve it. Correcting your details below resubmits you for review.'
            : 'An administrator is checking your registration number and licence. You will be able to request patient access once you are verified.'}
        </Text>

        <Row style={{ justifyContent: 'center', marginTop: spacing.md }}>
          <Badge tone={rejected ? 'danger' : 'warning'}>
            {doctor?.verification_status ?? 'pending'}
          </Badge>
        </Row>
      </Card>

      {!!doctor && (
        <Card>
          {[
            ['Name', `Dr. ${doctor.full_name}`],
            ['Specialization', doctor.specialization],
            ['Registration number', doctor.registration_number || '—'],
            ['Clinic', doctor.clinic_name || '—'],
          ].map(([label, value]) => (
            <Row key={label} style={styles.factRow}>
              <Text style={[type.caption, { flex: 1 }]}>{label}</Text>
              <Text style={type.label}>{value}</Text>
            </Row>
          ))}
        </Card>
      )}

      <Card>
        <Text style={type.caption}>
          Pull down to check whether an administrator has reviewed your registration.
        </Text>
      </Card>

      <Button
        variant="secondary"
        onPress={async () => {
          await logout();
          router.replace('/login');
        }}
      >
        Sign out
      </Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
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
  factRow: {
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
});
