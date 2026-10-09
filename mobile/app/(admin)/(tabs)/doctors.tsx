import { Feather } from '@expo/vector-icons';
import { useCallback, useRef, useState } from 'react';
import {
  Alert,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Badge, Button, Card, EmptyState, ErrorNote, Row, Screen } from '../../../src/components/ui';
import { adminApi, unwrap } from '../../../src/lib/api';
import { absoluteUrl } from '../../../src/lib/config';
import { DOCTOR_STATUS_LABEL } from '../../../src/lib/councils';
import { colors, radius, spacing, type, type ToneName } from '../../../src/theme';
import { openFile } from '../../../src/lib/viewer';
import { useFocusRefresh } from '../../../src/hooks/useFocusRefresh';

type AdminDoctor = {
  id: string;
  full_name: string;
  specialization: string;
  qualification: string;
  experience_years: number;
  registration_number: string;
  state_council_id: string;
  state_council_name: string | null;
  registration_year: number | null;
  clinic_name: string;
  clinic_address: string;
  consultation_fee: string | null;
  booking_phone_number: string;
  account_phone_number: string;
  license_document: string | null;
  license_document_type?: string;
  verification_status: 'pending' | 'manual_review' | 'failed' | 'verified' | 'rejected';
  submitted_at: string | null;
  // What the NMC register said — the evidence the admin decides on.
  nmc_result: '' | 'found' | 'not_found' | 'ambiguous' | 'unavailable';
  nmc_checked_at: string | null;
  nmc_doctor_id: string;
  nmc_name: string;
  nmc_qualification: string;
  nmc_university: string;
  nmc_registration_date: string | null;
  nmc_suspended: boolean;
  nmc_remarks: string;
  nmc_payload: unknown;
  name_match_score: number | null;
  name_matches: boolean | null;
  verification_provider: string;
  last_verification_error: string;
  verified_at: string | null;
  verified_by_phone: string | null;
  rejection_reason: string;
  imr_url: string;
};

// 'review' is pending + under review + register unreachable — everything
// still waiting on an admin. The NMC check never approves or rejects.
const FILTERS = [
  { label: 'Needs review', value: 'review' },
  { label: 'Verified', value: 'verified' },
  { label: 'Rejected', value: 'rejected' },
  { label: 'All', value: '' },
];

const statusTone: Record<string, ToneName> = {
  pending: 'warning',
  manual_review: 'info',
  failed: 'warning',
  verified: 'success',
  rejected: 'danger',
};

const statusLabel = (s: string) => (s === 'failed' ? 'Register unreachable' : DOCTOR_STATUS_LABEL[s] ?? s);

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

export default function AdminDoctors() {
  const [filter, setFilter] = useState('review');
  const [doctors, setDoctors] = useState<AdminDoctor[]>([]);
  const [nextPage, setNextPage] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // Which doctor an action is running for, and which action.
  const [acting, setActing] = useState<{ id: string; label: string } | null>(null);
  const [rejecting, setRejecting] = useState<AdminDoctor | null>(null);
  // The filter a response was requested for — a slow page for the old
  // filter must not land in the list after the admin has moved on.
  const filterRef = useRef(filter);

  const load = useCallback(async (status: string, page = 1) => {
    setError(null);
    try {
      const { data } = await adminApi.doctorQueue(status, page);
      if (filterRef.current !== status) return;
      const rows = unwrap<AdminDoctor>(data);
      setDoctors((prev) => (page === 1 ? rows : [...prev, ...rows]));
      setNextPage((data as { next?: string | null })?.next ? page + 1 : null);
    } catch (err) {
      const code = (err as { response?: { status?: number } })?.response?.status;
      setError(
        code === 403
          ? 'Doctor verification is restricted to full administrators.'
          : "Couldn't load the verification queue. Pull down to retry."
      );
    }
  }, []);

  // Not on every tab switch (that reloaded page 1 and dropped any pages the
  // admin had loaded with "load more"): see useFocusRefresh.
  const loadCurrent = useCallback(() => load(filterRef.current), [load]);
  useFocusRefresh(loadCurrent, 'admin-doctors'); // changeFilter loads the new filter itself

  function changeFilter(value: string) {
    filterRef.current = value;
    setFilter(value);
    setDoctors([]);
    setNextPage(null);
    void load(value);
  }

  async function onRefresh() {
    setRefreshing(true);
    await load(filter);
    setRefreshing(false);
  }

  async function loadMore() {
    if (!nextPage) return;
    setLoadingMore(true);
    await load(filter, nextPage);
    setLoadingMore(false);
  }

  /** Swap in the updated row the action returned; drop it if it left this filter. */
  async function act(doctor: AdminDoctor, label: string, run: () => Promise<{ data: AdminDoctor }>) {
    setActing({ id: doctor.id, label });
    setError(null);
    try {
      const { data: updated } = await run();
      const stays =
        filter === '' ||
        (filter === 'review'
          ? ['pending', 'manual_review', 'failed'].includes(updated.verification_status)
          : updated.verification_status === filter);
      setDoctors((list) =>
        stays ? list.map((d) => (d.id === updated.id ? updated : d)) : list.filter((d) => d.id !== updated.id)
      );
    } catch {
      setError(`Couldn't ${label} that doctor. Please try again.`);
    } finally {
      setActing(null);
    }
  }

  function confirmApprove(doctor: AdminDoctor) {
    const register =
      doctor.nmc_result === 'found'
        ? `The NMC register lists ${doctor.nmc_name || 'this number'}${doctor.nmc_suspended ? ' — but as REMOVED' : ''}.`
        : 'This registration was not confirmed on the NMC register — check it by hand first.';
    Alert.alert(
      `Verify Dr. ${doctor.full_name}?`,
      `${register} A verified doctor becomes visible to patients in Find Care and may request access to medical records.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Verify', onPress: () => act(doctor, 'approve', () => adminApi.approveDoctor(doctor.id)) },
      ]
    );
  }

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.ink900} />}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {FILTERS.map((f) => (
          <Pressable
            key={f.value}
            onPress={() => changeFilter(f.value)}
            style={[styles.chip, filter === f.value && styles.chipActive]}
          >
            <Text style={[styles.chipText, filter === f.value && styles.chipTextActive]}>{f.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {!!error && <ErrorNote message={error} onRetry={() => load(filter)} />}

      {!error && doctors.length === 0 && (
        <EmptyState title="Nothing here" note="Doctor registrations appear in this queue as they arrive." />
      )}

      {doctors.map((d) => {
        const licenceUrl = absoluteUrl(d.license_document);
        const busy = acting?.id === d.id;
        const running = (label: string) => busy && acting?.label === label;
        return (
          <Card key={d.id}>
            <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <Text style={type.title}>Dr. {d.full_name}</Text>
                <Text style={type.micro}>
                  {[d.specialization, d.qualification].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <Badge tone={statusTone[d.verification_status] ?? 'neutral'}>{statusLabel(d.verification_status)}</Badge>
            </Row>

            <View style={styles.detailBlock}>
              {[
                ['Registration number', d.registration_number || '—'],
                ['Medical council', d.state_council_name || '—'],
                ['Year of registration', d.registration_year ? String(d.registration_year) : '—'],
                ['Submitted', when(d.submitted_at)],
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

            <RegisterEvidence d={d} />

            {licenceUrl ? (
              <Pressable onPress={() => openFile(d.license_document, d.license_document_type, `Licence — ${d.full_name}`)} style={styles.licenceRow}>
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

            {(d.verification_status === 'verified' || d.verification_status === 'rejected') && (
              <Text style={[type.micro, { marginTop: spacing.md, color: colors.ink500 }]}>
                {d.verification_status === 'verified' ? 'Approved' : 'Rejected'} {when(d.verified_at)}
                {d.verified_by_phone ? ` by ${d.verified_by_phone}` : ''}
                {d.verification_status === 'rejected' && d.rejection_reason ? ` — “${d.rejection_reason}”` : ''}
              </Text>
            )}

            {/* An already-verified doctor keeps Reject (revoking access is
                real), and a rejected one keeps Verify. */}
            <View style={styles.actions}>
              {!!d.registration_number && !!d.state_council_id && (
                <Button
                  variant="secondary"
                  style={styles.action}
                  onPress={() => act(d, 're-verify', () => adminApi.reverifyDoctor(d.id))}
                  loading={running('re-verify')}
                  disabled={busy}
                >
                  Re-verify
                </Button>
              )}
              {d.verification_status !== 'verified' && (
                <Button style={styles.action} onPress={() => confirmApprove(d)} loading={running('approve')} disabled={busy}>
                  Verify
                </Button>
              )}
              {d.verification_status !== 'rejected' && (
                <Button
                  variant="danger"
                  style={styles.action}
                  onPress={() => setRejecting(d)}
                  loading={running('reject')}
                  disabled={busy}
                >
                  Reject
                </Button>
              )}
            </View>
          </Card>
        );
      })}

      {!!nextPage && (
        <Button variant="secondary" onPress={loadMore} loading={loadingMore}>
          Load more
        </Button>
      )}

      <RejectSheet
        doctor={rejecting}
        onCancel={() => setRejecting(null)}
        onConfirm={async (reason) => {
          const doctor = rejecting;
          setRejecting(null);
          if (doctor) await act(doctor, 'reject', () => adminApi.rejectDoctor(doctor.id, reason));
        }}
      />
    </Screen>
  );
}

/** What the NMC register said about this doctor. */
function RegisterEvidence({ d }: { d: AdminDoctor }) {
  const [showRaw, setShowRaw] = useState(false);
  const score = d.name_match_score === null ? null : Math.round(d.name_match_score * 100);
  return (
    <View style={styles.evidence}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text style={styles.evidenceTitle}>NMC REGISTER CHECK</Text>
        <Pressable onPress={() => Linking.openURL(d.imr_url)} hitSlop={8}>
          <Text style={styles.link}>Check on the register ↗</Text>
        </Pressable>
      </Row>

      {d.nmc_result === '' && (
        <Text style={[type.caption, { marginTop: spacing.xs }]}>
          Not checked{!d.state_council_id ? ' — no medical council was given (older app version).' : ' yet.'}
        </Text>
      )}

      {d.nmc_result === 'found' && (
        <View style={{ marginTop: spacing.xs }}>
          <Text style={[type.caption, { fontWeight: '700', color: d.nmc_suspended ? colors.danger : colors.success }]}>
            {d.nmc_suspended ? 'On the register — listed as REMOVED' : 'Found on the register'}
          </Text>
          {d.nmc_suspended && !!d.nmc_remarks && (
            <Text style={[type.caption, { color: colors.danger, marginTop: 2 }]}>{d.nmc_remarks}</Text>
          )}
          {[
            ['Name on register', d.nmc_name || '—'],
            [
              'Name match',
              score === null ? '—' : `${score}% — ${d.name_matches ? 'matches' : 'check the name'}`,
            ],
            ['Qualification', d.nmc_qualification || '—'],
            ['University', d.nmc_university || '—'],
            ['Registered on', d.nmc_registration_date || '—'],
            ['NMC record ID', d.nmc_doctor_id || '—'],
          ].map(([label, value]) => (
            <Row key={label} style={styles.factRow}>
              <Text style={[type.micro, { flex: 1 }]}>{label}</Text>
              <Text
                style={[
                  type.caption,
                  { flex: 1, textAlign: 'right' },
                  label === 'Name match' && score !== null && {
                    fontWeight: '600',
                    color: d.name_matches ? colors.success : colors.warning,
                  },
                ]}
              >
                {value}
              </Text>
            </Row>
          ))}
        </View>
      )}

      {(d.nmc_result === 'not_found' || d.nmc_result === 'ambiguous') && (
        <Text style={[type.caption, { color: colors.warning, marginTop: spacing.xs }]}>{d.nmc_remarks}</Text>
      )}

      {d.nmc_result === 'unavailable' && (
        <Text style={[type.caption, { color: colors.warning, marginTop: spacing.xs }]}>
          The register couldn't be reached ({d.last_verification_error || 'no answer'}). Re-verify, or check by hand.
        </Text>
      )}

      {!!d.nmc_checked_at && (
        <Text style={[type.micro, { marginTop: spacing.sm }]}>
          Checked {when(d.nmc_checked_at)}
          {d.verification_provider && d.verification_provider !== 'nmc' ? ` via ${d.verification_provider}` : ''}
        </Text>
      )}

      {!!d.nmc_payload && (
        <>
          <Pressable onPress={() => setShowRaw((v) => !v)} hitSlop={8} style={{ marginTop: spacing.sm }}>
            <Text style={styles.link}>{showRaw ? 'Hide raw NMC data' : 'Show raw NMC data'}</Text>
          </Pressable>
          {showRaw && (
            <ScrollView style={styles.raw} nestedScrollEnabled>
              <Text style={styles.rawText}>{JSON.stringify(d.nmc_payload, null, 2)}</Text>
            </ScrollView>
          )}
        </>
      )}
    </View>
  );
}

/** Reject with a reason — the doctor sees it and can correct their details.
 *  A sheet rather than Alert.prompt, which only exists on iOS. */
function RejectSheet({
  doctor,
  onCancel,
  onConfirm,
}: {
  doctor: AdminDoctor | null;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  const valid = reason.trim().length >= 3;

  function close() {
    setReason('');
    onCancel();
  }

  return (
    <Modal visible={!!doctor} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={type.title}>Reject Dr. {doctor?.full_name}?</Text>
          <Text style={[type.caption, { marginTop: spacing.xs, marginBottom: spacing.md }]}>
            The doctor sees this reason and can correct their details, which sends the registration back for review.
          </Text>
          <TextInput
            value={reason}
            onChangeText={setReason}
            placeholder="e.g. Registration number not found in the Maharashtra council"
            placeholderTextColor={colors.ink300}
            multiline
            maxLength={1000}
            autoFocus
            style={styles.reasonInput}
          />
          <Row style={{ gap: spacing.sm, marginTop: spacing.md }}>
            <Button variant="secondary" style={{ flex: 1 }} onPress={close}>
              Cancel
            </Button>
            <Button
              variant="danger"
              style={{ flex: 1 }}
              disabled={!valid}
              onPress={() => {
                const text = reason.trim();
                setReason('');
                onConfirm(text);
              }}
            >
              Reject
            </Button>
          </Row>
        </Pressable>
      </Pressable>
    </Modal>
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
  evidence: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  evidenceTitle: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.5, color: colors.ink500 },
  link: { fontSize: 12, fontWeight: '600', color: colors.brandPurple },
  raw: { maxHeight: 220, marginTop: spacing.xs, padding: spacing.sm, borderRadius: radius.sm, backgroundColor: colors.card },
  rawText: { fontSize: 10.5, fontFamily: 'monospace', color: colors.ink700 },
  licenceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  licenceText: { fontSize: 13, fontWeight: '600', color: colors.brandPurple },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  action: { flexGrow: 1, flexBasis: 90 },
  backdrop: { flex: 1, backgroundColor: 'rgba(31,36,48,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  reasonInput: {
    minHeight: 88,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 15,
    color: colors.ink900,
    textAlignVertical: 'top',
  },
});
