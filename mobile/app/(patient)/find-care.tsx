import { Feather } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';

import { Card, EmptyState, ErrorNote, Row, Screen } from '../../src/components/ui';
import { doctorsApi, unwrap } from '../../src/lib/api';
import { colors, radius, spacing, type } from '../../src/theme';

type Doctor = {
  id: string;
  full_name: string;
  specialization: string;
  experience_years: number;
  verification_status: string;
  clinic_name: string;
  clinic_address: string;
  booking_phone_number: string;
  available_days: string[] | null;
  clinic_open_time: string | null;
  clinic_close_time: string | null;
};

const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/**
 * "Mon–Fri" when the days are consecutive, otherwise a plain list. Ported
 * from the web app's shared/availability.ts so both clients describe the
 * same week the same way.
 */
function formatDays(days: string[] | null): string {
  if (!days || days.length === 0) return '';
  const sorted = [...days].sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));
  const short = (d: string) => d.slice(0, 3);
  if (sorted.length === 7) return 'Every day';
  const indices = sorted.map((d) => DAY_ORDER.indexOf(d));
  const consecutive = indices.every((n, i) => i === 0 || n === indices[i - 1] + 1);
  if (consecutive && sorted.length > 2) return `${short(sorted[0])}–${short(sorted[sorted.length - 1])}`;
  return sorted.map(short).join(', ');
}

function formatHours(open: string | null, close: string | null): string {
  if (!open || !close) return '';
  return `${open.slice(0, 5)} – ${close.slice(0, 5)}`;
}

export default function FindCare() {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data } = await doctorsApi.list();
      // Only verified doctors are shown — the same filter the web app
      // applies, since an unverified registration is not an endorsement.
      setDoctors(unwrap<Doctor>(data).filter((d) => d.verification_status === 'verified'));
    } catch {
      setError("Couldn't load the doctor list. Pull down to retry.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const q = query.trim().toLowerCase();
  const filtered = doctors.filter(
    (d) =>
      d.full_name.toLowerCase().includes(q) ||
      d.specialization.toLowerCase().includes(q) ||
      (d.clinic_name ?? '').toLowerCase().includes(q)
  );

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brandPurple} />}>
      <View style={styles.searchWrap}>
        <Feather name="search" size={15} color={colors.ink300} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search doctors, specialties, clinics..."
          placeholderTextColor={colors.ink300}
          style={styles.searchInput}
        />
      </View>

      {!!error && <ErrorNote message={error} onRetry={load} />}

      {!error && filtered.length === 0 && (
        <EmptyState
          title={query ? 'No doctors match that search' : 'No verified doctors yet'}
          note={
            query
              ? 'Try a different name or specialty.'
              : 'This list fills up once doctors register and an admin approves them.'
          }
        />
      )}

      {filtered.map((d) => {
        const days = formatDays(d.available_days);
        const hours = formatHours(d.clinic_open_time, d.clinic_close_time);
        const dialable = d.booking_phone_number?.replace(/[^+0-9]/g, '');
        return (
          <Card key={d.id}>
            <Row style={{ alignItems: 'flex-start' }}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {d.full_name.trim().split(' ').slice(-1)[0]?.[0] ?? '?'}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={type.title}>Dr. {d.full_name}</Text>
                <Text style={type.caption}>{d.specialization}</Text>
                <Text style={type.micro}>
                  {d.experience_years}+ years experience
                  {d.clinic_name ? ` · ${d.clinic_name}` : ''}
                </Text>
              </View>
            </Row>

            <View style={styles.detailBlock}>
              {!!d.clinic_address && (
                <Row style={{ alignItems: 'flex-start' }}>
                  <Feather name="map-pin" size={13} color={colors.ink300} />
                  <Text style={[type.caption, { flex: 1 }]}>{d.clinic_address}</Text>
                </Row>
              )}

              {days || hours ? (
                <>
                  {!!days && (
                    <Row>
                      <Feather name="calendar" size={13} color={colors.ink300} />
                      <Text style={type.caption}>{days}</Text>
                    </Row>
                  )}
                  {!!hours && (
                    <Row>
                      <Feather name="clock" size={13} color={colors.ink300} />
                      <Text style={type.caption}>{hours}</Text>
                    </Row>
                  )}
                </>
              ) : (
                <Text style={type.micro}>Availability not listed yet</Text>
              )}

              {dialable ? (
                <Pressable onPress={() => Linking.openURL(`tel:${dialable}`)} style={styles.callButton}>
                  <Feather name="phone" size={14} color={colors.white} />
                  <Text style={styles.callText}>Call {d.booking_phone_number}</Text>
                </Pressable>
              ) : (
                <Text style={type.micro}>No booking number listed</Text>
              )}
            </View>
          </Card>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  searchInput: { flex: 1, paddingVertical: spacing.md, fontSize: 14, color: colors.ink900 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.brandLavender,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 17, fontWeight: '700', color: colors.brandPurple },
  detailBlock: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  callButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.brandTeal,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    marginTop: spacing.xs,
  },
  callText: { color: colors.white, fontSize: 14, fontWeight: '600' },
});
