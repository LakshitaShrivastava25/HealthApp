import { Feather } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Card, EmptyState, ErrorNote, Loading, Row, Screen, SectionTitle } from '../../src/components/ui';
import { useAuth } from '../../src/context/AuthContext';
import { labsApi, unwrap } from '../../src/lib/api';
import { colors, radius, spacing, type } from '../../src/theme';
import { useFocusRefresh } from '../../src/hooks/useFocusRefresh';

type Provider = {
  id: string;
  name: string;
  provider_type: string;
  address: string;
  city: string;
  pincode: string;
  contact_phone: string;
  is_verified: boolean;
};

type TestOffering = {
  id: string;
  provider: string;
  test_name: string;
  test_category: string;
  price: number | null;
  home_visit_available: boolean;
  turnaround_hours: number | null;
};

type Booking = {
  id: string;
  test_name: string;
  provider_name: string;
  booking_type: string;
  status: string;
  created_at: string;
};

const TABS = ['Providers', 'Tests', 'Bookings'] as const;
type Tab = (typeof TABS)[number];

export default function LabTests() {
  const { activeProfile } = useAuth();
  const [tab, setTab] = useState<Tab>('Providers');
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [providers, setProviders] = useState<Provider[]>([]);
  const [tests, setTests] = useState<TestOffering[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);

  const [bookingModal, setBookingModal] = useState<TestOffering | null>(null);
  const [bookingType, setBookingType] = useState<'walk_in' | 'home_visit'>('walk_in');
  const [bookingAddress, setBookingAddress] = useState('');
  const [bookingSlot, setBookingSlot] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [pRes, tRes, bRes] = await Promise.all([
        labsApi.providers(),
        labsApi.tests(),
        labsApi.bookings(),
      ]);
      setProviders(unwrap<Provider>(pRes.data));
      setTests(unwrap<TestOffering>(tRes.data));
      setBookings(unwrap<Booking>(bRes.data));
    } catch {
      setError("Couldn't load lab data. Pull down to retry.");
    } finally {
      setLoaded(true);
    }
  }, []);

  useFocusRefresh(load, 'lab-tests');

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function handleBook() {
    if (!activeProfile || !bookingModal) return;
    setSubmitting(true);
    try {
      await labsApi.createBooking({
        profile: activeProfile.id,
        test_offering: bookingModal.id,
        booking_type: bookingType,
        address: bookingAddress,
        preferred_time_slot: bookingSlot,
      });
      await load();
      setBookingModal(null);
      setTab('Bookings');
    } catch {
      Alert.alert('Error', 'Could not create booking. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel(id: string) {
    try {
      await labsApi.cancelBooking(id);
      await load();
    } catch {
      Alert.alert('Error', 'Could not cancel booking.');
    }
  }

  const filteredProviders = providers.filter(
    (p) =>
      p.name.toLowerCase().includes(query.toLowerCase()) ||
      p.city.toLowerCase().includes(query.toLowerCase()),
  );

  const filteredTests = tests.filter(
    (t) =>
      t.test_name.toLowerCase().includes(query.toLowerCase()) ||
      t.test_category.toLowerCase().includes(query.toLowerCase()),
  );

  const shownTests = selectedProvider
    ? filteredTests.filter((t) => t.provider === selectedProvider)
    : filteredTests;

  const statusColor: Record<string, string> = {
    pending: colors.warning,
    confirmed: colors.info,
    sample_collected: colors.info,
    report_ready: '#22c55e',
    cancelled: colors.ink300,
  };

  return (
    <>
      <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brandPurple} />}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {TABS.map((t) => (
            <Pressable
              key={t}
              onPress={() => { setTab(t); setQuery(''); setSelectedProvider(null); }}
              style={[styles.chip, tab === t && styles.chipActive]}
            >
              <Text style={[styles.chipText, tab === t && styles.chipTextActive]}>{t}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {tab !== 'Bookings' && (
          <View style={styles.searchWrap}>
            <Feather name="search" size={15} color={colors.ink300} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={tab === 'Providers' ? 'Search providers, cities...' : 'Search tests...'}
              placeholderTextColor={colors.ink300}
              style={styles.searchInput}
            />
          </View>
        )}

        {!!error && <ErrorNote message={error} onRetry={load} />}
        {!loaded && !error && <Loading />}

        {/* Providers */}
        {tab === 'Providers' && loaded && (
          <>
            {filteredProviders.length === 0 && (
              <EmptyState title="No providers yet" note="Verified labs and blood banks will appear here." />
            )}
            {filteredProviders.map((p) => (
              <Card key={p.id}>
                <Row>
                  <View style={styles.icon}>
                    <Feather name="home" size={17} color={colors.brandPurple} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={type.title} numberOfLines={1}>{p.name}</Text>
                    <Text style={type.micro}>{p.provider_type.replace('_', ' ')}</Text>
                    <Text style={[type.micro, { marginTop: 2 }]}>{p.city} — {p.pincode}</Text>
                    {!!p.contact_phone && (
                      <Text style={[type.micro, { color: colors.brandPurple, marginTop: 2 }]}>{p.contact_phone}</Text>
                    )}
                  </View>
                  <Pressable
                    onPress={() => { setSelectedProvider(p.id); setTab('Tests'); }}
                    hitSlop={10}
                  >
                    <Feather name="chevron-right" size={16} color={colors.ink300} />
                  </Pressable>
                </Row>
              </Card>
            ))}
          </>
        )}

        {/* Tests */}
        {tab === 'Tests' && loaded && (
          <>
            {selectedProvider && (
              <Pressable onPress={() => setSelectedProvider(null)}>
                <Text style={[type.caption, { color: colors.brandPurple, marginBottom: spacing.sm }]}>
                  Show all providers
                </Text>
              </Pressable>
            )}
            {shownTests.length === 0 && (
              <EmptyState title="No tests found" note="Try a different search or check back later." />
            )}
            {shownTests.map((t) => (
              <Card key={t.id}>
                <Row>
                  <View style={{ flex: 1 }}>
                    <Text style={type.title}>{t.test_name}</Text>
                    {!!t.test_category && <Text style={type.micro}>{t.test_category}</Text>}
                    <Row style={{ marginTop: spacing.sm }}>
                      {t.price != null && <Text style={[type.caption, { fontWeight: '600' }]}>Rs. {t.price}</Text>}
                      {t.turnaround_hours != null && (
                        <Text style={type.micro}>{t.turnaround_hours}h turnaround</Text>
                      )}
                      {t.home_visit_available && (
                        <Text style={[type.micro, { color: '#22c55e' }]}>Home visit</Text>
                      )}
                    </Row>
                  </View>
                  <Pressable
                    style={styles.bookBtn}
                    onPress={() => {
                      setBookingModal(t);
                      setBookingType('walk_in');
                      setBookingAddress('');
                      setBookingSlot('');
                    }}
                  >
                    <Text style={styles.bookBtnText}>Book</Text>
                  </Pressable>
                </Row>
              </Card>
            ))}
          </>
        )}

        {/* Bookings */}
        {tab === 'Bookings' && loaded && (
          <>
            {bookings.length === 0 && (
              <EmptyState title="No bookings yet" note="Browse tests and book one to see it here." />
            )}
            {bookings.map((b) => (
              <Card key={b.id}>
                <Row>
                  <View style={{ flex: 1 }}>
                    <Text style={type.title}>{b.test_name}</Text>
                    <Text style={type.micro}>{b.provider_name}</Text>
                    <Row style={{ marginTop: spacing.sm }}>
                      <View style={[styles.statusDot, { backgroundColor: statusColor[b.status] || colors.ink300 }]} />
                      <Text style={type.micro}>{b.status.replace(/_/g, ' ')}</Text>
                      <Text style={type.micro}>{b.booking_type.replace('_', ' ')}</Text>
                    </Row>
                  </View>
                  {b.status === 'pending' && (
                    <Pressable onPress={() => handleCancel(b.id)} hitSlop={10}>
                      <Text style={{ fontSize: 12, color: '#ef4444' }}>Cancel</Text>
                    </Pressable>
                  )}
                </Row>
              </Card>
            ))}
          </>
        )}
      </Screen>

      {/* Booking modal */}
      <Modal visible={!!bookingModal} transparent animationType="slide" onRequestClose={() => setBookingModal(null)}>
        <Pressable style={styles.backdrop} onPress={() => setBookingModal(null)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={[type.title, { marginBottom: spacing.xs }]}>Book Test</Text>
            <Text style={[type.micro, { marginBottom: spacing.md }]}>{bookingModal?.test_name}</Text>

            <Text style={[type.caption, { marginBottom: spacing.xs }]}>Type</Text>
            <Row style={{ marginBottom: spacing.md }}>
              {(['walk_in', 'home_visit'] as const).map((bt) => (
                <Pressable
                  key={bt}
                  onPress={() => setBookingType(bt)}
                  style={[styles.typeBtn, bookingType === bt && styles.typeBtnActive]}
                >
                  <Text style={[styles.typeBtnText, bookingType === bt && styles.typeBtnTextActive]}>
                    {bt === 'walk_in' ? 'Walk-in' : 'Home Visit'}
                  </Text>
                </Pressable>
              ))}
            </Row>

            {bookingType === 'home_visit' && (
              <>
                <Text style={[type.caption, { marginBottom: spacing.xs }]}>Address</Text>
                <TextInput
                  value={bookingAddress}
                  onChangeText={setBookingAddress}
                  placeholder="Your address for sample collection"
                  placeholderTextColor={colors.ink300}
                  style={[styles.input, { marginBottom: spacing.md }]}
                />
              </>
            )}

            <Text style={[type.caption, { marginBottom: spacing.xs }]}>Preferred Time Slot</Text>
            <TextInput
              value={bookingSlot}
              onChangeText={setBookingSlot}
              placeholder="e.g. Morning, 10 AM - 12 PM"
              placeholderTextColor={colors.ink300}
              style={[styles.input, { marginBottom: spacing.lg }]}
            />

            <Row>
              <Pressable style={styles.cancelBtn} onPress={() => setBookingModal(null)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.confirmBtn, submitting && { opacity: 0.5 }]}
                onPress={handleBook}
                disabled={submitting}
              >
                <Text style={styles.confirmBtnText}>{submitting ? 'Booking...' : 'Confirm'}</Text>
              </Pressable>
            </Row>
          </Pressable>
        </Pressable>
      </Modal>
    </>
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
  chipActive: { backgroundColor: colors.brandPurple, borderColor: colors.brandPurple },
  chipText: { fontSize: 13, fontWeight: '500', color: colors.ink700 },
  chipTextActive: { color: colors.white },
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
  icon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.brandLavender,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.brandPurple,
  },
  bookBtnText: { fontSize: 13, fontWeight: '600', color: colors.white },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  backdrop: { flex: 1, backgroundColor: 'rgba(31,36,48,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  typeBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  typeBtnActive: { backgroundColor: colors.brandPurple, borderColor: colors.brandPurple },
  typeBtnText: { fontSize: 13, fontWeight: '500', color: colors.ink700 },
  typeBtnTextActive: { color: colors.white },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
    color: colors.ink900,
    backgroundColor: colors.card,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  cancelBtnText: { fontSize: 14, fontWeight: '500', color: colors.ink700 },
  confirmBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.brandPurple,
    alignItems: 'center',
  },
  confirmBtnText: { fontSize: 14, fontWeight: '600', color: colors.white },
});
