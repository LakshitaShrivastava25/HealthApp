import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Badge, Button, Card, EmptyState, ErrorNote, Row, Screen } from '../../../src/components/ui';
import { adminApi, unwrap } from '../../../src/lib/api';
import { absoluteUrl } from '../../../src/lib/config';
import { colors, radius, spacing, type } from '../../../src/theme';

type AdminDoctor = {
  id: string;
  full_name: string;
  specialization: string;
  qualification: string;
  experience_years: number;
  registration_number: string;
  clinic_name: string;
  clinic_address: string;
  consultation_fee: string | null;
  booking_phone_number: string;
  account_phone_number: string;
  license_document: string | null;
  verification_status: 'pending' | 'verified' | 'rejected';
};

const FILTERS = [
  { label: 'Pending', value: 'pending' },
  { label: 'Verified', value: 'verified' },
  { label: 'Rejected', value: 'rejected' },
  { label: 'All', value: '' },
];

const statusTone = { verified: 'success', rejected: 'danger', pending: 'warning' } as const;

export default function AdminDoctors() {
  const [filter, setFilter] = useState('pending');
  const [doctors, setDoctors] = useState<AdminDoctor[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data } = await adminApi.doctorVerification();
      setDoctors(unwrap<AdminDoctor>(data));
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      setError(
        status === 403
          ? 'Doctor verification is restricted to full administrators.'
          : "Couldn't load the verification queue. Pull down to retry."
      );
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function decide(doctor: AdminDoctor, action: 'approve' | 'reject') {
    setActing(doctor.id);
    try {
      if (action === 'approve') await adminApi.approveDoctor(doctor.id);
      else await adminApi.rejectDoctor(doctor.id);
      await load();
    } catch {
      setError(`Couldn't ${action} that doctor. Please try again.`);
    } finally {
      setActing(null);
    }
  }

  function confirmApprove(doctor: AdminDoctor) {
    Alert.alert(
      `Verify Dr. ${doctor.full_name}?`,
      `Approving means you have checked registration number ${doctor.registration_number || '(none provided)'} against the medical council. A verified doctor becomes visible to patients in Find Care and may request access to medical records.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Verify', onPress: () => decide(doctor, 'approve') },
      ]
    );
  }

  const visible = filter ? doctors.filter((d) => d.verification_status === filter) : doctors;

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.ink900} />}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {FILTERS.map((f) => (
          <Pressable
            key={f.value}
            onPress={() => setFilter(f.value)}
            style={[styles.chip, filter === f.value && styles.chipActive]}
          >
            <Text style={[styles.chipText, filter === f.value && styles.chipTextActive]}>{f.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {!!error && <ErrorNote message={error} onRetry={load} />}

      {!error && visible.length === 0 && (
        <EmptyState title="Nothing here" note="Doctor registrations appear in this queue as they arrive." />
      )}

      {visible.map((d) => {
        const licenceUrl = absoluteUrl(d.license_document);
        return (
          <Card key={d.id}>
            <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <Text style={type.title}>Dr. {d.full_name}</Text>
                <Text style={type.micro}>
                  {[d.specialization, d.qualification].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <Badge tone={statusTone[d.verification_status]}>{d.verification_status}</Badge>
            </Row>

            <View style={styles.detailBlock}>
              {[
                ['Registration number', d.registration_number || '—'],
                ['Experience', `${d.experience_years} years`],
                ['Clinic', d.clinic_name || '—'],
                ['Address', d.clinic_address || '—'],
                ['Booking number (public)', d.booking_phone_number || '—'],
                ['Login number (private)', d.account_phone_number || '—'],
                ['Consultation fee', d.consultation_fee ? `₹${d.consultation_fee}` : '—'],
              ].map(([label, value]) => (
                <Row key={label} style={styles.factRow}>
                  <Text style={[type.micro, { flex: 1 }]}>{label}</Text>
                  <Text style={[type.caption, { flex: 1, textAlign: 'right' }]}>{value}</Text>
                </Row>
              ))}
            </View>

            {licenceUrl ? (
              <Pressable onPress={() => Linking.openURL(licenceUrl)} style={styles.licenceRow}>
                <Feather name="paperclip" size={15} color={colors.brandPurple} />
                <Text style={styles.licenceText}>Open licence document</Text>
              </Pressable>
            ) : (
              <Row style={{ marginTop: spacing.md }}>
                <Feather name="alert-triangle" size={14} color={colors.warning} />
                <Text style={[type.micro, { color: colors.warning, flex: 1 }]}>
                  No licence document was uploaded — verify by another means before approving.
                </Text>
              </Row>
            )}

            {d.verification_status !== 'verified' && (
              <Row style={{ gap: spacing.sm, marginTop: spacing.md }}>
                <Button style={{ flex: 1 }} onPress={() => confirmApprove(d)} loading={acting === d.id}>
                  Verify
                </Button>
                <Button
                  variant="danger"
                  style={{ flex: 1 }}
                  onPress={() => decide(d, 'reject')}
                  disabled={acting === d.id}
                >
                  Reject
                </Button>
              </Row>
            )}
          </Card>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chipRow: { gap: spacing.sm, paddingVertical: 2 },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  chipActive: { backgroundColor: colors.ink900, borderColor: colors.ink900 },
  chipText: { fontSize: 13, fontWeight: '500', color: colors.ink700 },
  chipTextActive: { color: colors.white },
  detailBlock: {
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  factRow: { paddingVertical: 4 },
  licenceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  licenceText: { fontSize: 13, fontWeight: '600', color: colors.brandPurple },
});
