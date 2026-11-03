import { useEffect, useState } from 'react';
import { Search, FlaskConical, MapPin, Phone, Clock, Home, Building2 } from 'lucide-react';
import Topbar from '../components/Topbar';
import { Card, Badge, Button, EmptyState } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { labsApi } from '../lib/api';

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

const TABS = ['Providers', 'Browse Tests', 'My Bookings'] as const;
type Tab = (typeof TABS)[number];

const typeTone: Record<string, 'info' | 'success' | 'warning' | 'neutral'> = {
  blood_bank: 'danger' as 'warning',
  pathology_lab: 'info',
  both: 'success',
};

const statusTone: Record<string, 'info' | 'success' | 'warning' | 'neutral'> = {
  pending: 'warning',
  confirmed: 'info',
  sample_collected: 'info',
  report_ready: 'success',
  cancelled: 'neutral',
};

export default function LabTests() {
  const { activeProfile } = useAuth();
  const [tab, setTab] = useState<Tab>('Providers');
  const [query, setQuery] = useState('');

  const [providers, setProviders] = useState<Provider[]>([]);
  const [tests, setTests] = useState<TestOffering[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);

  const [bookingModal, setBookingModal] = useState<TestOffering | null>(null);
  const [bookingType, setBookingType] = useState<'walk_in' | 'home_visit'>('walk_in');
  const [bookingAddress, setBookingAddress] = useState('');
  const [bookingSlot, setBookingSlot] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    labsApi.providers().then((r) => setProviders(r.data.results ?? r.data));
    labsApi.tests().then((r) => setTests(r.data.results ?? r.data));
    labsApi.bookings().then((r) => setBookings(r.data.results ?? r.data));
  }, []);

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
      const { data } = await labsApi.bookings();
      setBookings(data.results ?? data);
      setBookingModal(null);
      setTab('My Bookings');
    } catch {
      // handled silently
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel(id: string) {
    await labsApi.cancelBooking(id);
    const { data } = await labsApi.bookings();
    setBookings(data.results ?? data);
  }

  const filteredProviders = providers.filter(
    (p) =>
      p.name.toLowerCase().includes(query.toLowerCase()) ||
      p.city.toLowerCase().includes(query.toLowerCase())
  );

  const filteredTests = tests.filter(
    (t) =>
      t.test_name.toLowerCase().includes(query.toLowerCase()) ||
      t.test_category.toLowerCase().includes(query.toLowerCase())
  );

  const providerTests = selectedProvider
    ? filteredTests.filter((t) => t.provider === selectedProvider)
    : filteredTests;

  return (
    <>
      <Topbar title="Lab Tests" subtitle="Blood banks, pathology labs and test bookings" />

      <main className="p-4 sm:p-6 lg:p-8">
        <div className="flex gap-1.5 mb-5 flex-wrap">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setQuery(''); setSelectedProvider(null); }}
              className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
                tab === t ? 'bg-accent text-white' : 'bg-card border border-border text-ink-700'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {tab !== 'My Bookings' && (
          <div className="relative mb-5 max-w-lg">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-300" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tab === 'Providers' ? 'Search providers, cities...' : 'Search tests...'}
              className="w-full pl-9 pr-3 py-2.5 text-sm rounded-lg border border-border bg-card outline-none focus:ring-2 focus:ring-accent/30"
            />
          </div>
        )}

        {/* Providers tab */}
        {tab === 'Providers' && (
          <>
            {filteredProviders.length === 0 && (
              <Card>
                <EmptyState
                  icon={<FlaskConical size={22} />}
                  title="No labs or blood banks yet"
                  note="Verified providers will appear here once they are added by an admin."
                />
              </Card>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredProviders.map((p) => (
                <Card key={p.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-11 h-11 rounded-lg bg-accent-soft text-accent-ink flex items-center justify-center shrink-0">
                      <Building2 size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-ink-900 truncate">{p.name}</p>
                      <Badge tone={typeTone[p.provider_type] ?? 'neutral'} className="mt-1">
                        {p.provider_type.replace('_', ' ')}
                      </Badge>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-border space-y-1.5">
                    <p className="flex items-center gap-1.5 text-xs text-ink-700">
                      <MapPin size={13} className="text-ink-300 shrink-0" /> {p.address}, {p.city} — {p.pincode}
                    </p>
                    {p.contact_phone && (
                      <a href={`tel:${p.contact_phone}`} className="flex items-center gap-1.5 text-xs font-medium text-accent-ink hover:underline">
                        <Phone size={13} className="shrink-0" /> {p.contact_phone}
                      </a>
                    )}
                  </div>
                  <button
                    onClick={() => { setSelectedProvider(p.id); setTab('Browse Tests'); }}
                    className="mt-3 text-xs font-medium text-accent-ink hover:underline"
                  >
                    View tests offered
                  </button>
                </Card>
              ))}
            </div>
          </>
        )}

        {/* Browse Tests tab */}
        {tab === 'Browse Tests' && (
          <>
            {selectedProvider && (
              <button onClick={() => setSelectedProvider(null)} className="mb-3 text-xs text-accent-ink hover:underline">
                Show all providers
              </button>
            )}
            {providerTests.length === 0 && (
              <Card>
                <EmptyState
                  icon={<FlaskConical size={22} />}
                  title="No tests found"
                  note="Try a different search or check back later."
                />
              </Card>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {providerTests.map((t) => (
                <Card key={t.id} className="p-4 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-ink-900">{t.test_name}</p>
                    {t.test_category && <p className="text-xs text-ink-500 mt-0.5">{t.test_category}</p>}
                    <div className="flex items-center gap-3 mt-2 text-xs text-ink-500">
                      {t.price != null && <span className="font-medium text-ink-900">Rs. {t.price}</span>}
                      {t.turnaround_hours != null && (
                        <span className="flex items-center gap-1"><Clock size={12} /> {t.turnaround_hours}h</span>
                      )}
                      {t.home_visit_available && (
                        <span className="flex items-center gap-1 text-green-600"><Home size={12} /> Home visit</span>
                      )}
                    </div>
                  </div>
                  <Button onClick={() => { setBookingModal(t); setBookingType('walk_in'); setBookingAddress(''); setBookingSlot(''); }}>
                    Book
                  </Button>
                </Card>
              ))}
            </div>
          </>
        )}

        {/* Bookings tab */}
        {tab === 'My Bookings' && (
          <>
            {bookings.length === 0 && (
              <Card>
                <EmptyState
                  icon={<FlaskConical size={22} />}
                  title="No bookings yet"
                  note="Browse tests and book one to see it here."
                />
              </Card>
            )}
            <div className="space-y-3">
              {bookings.map((b) => (
                <Card key={b.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-ink-900">{b.test_name}</p>
                      <p className="text-xs text-ink-500">{b.provider_name}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <Badge tone={statusTone[b.status] ?? 'neutral'}>{b.status.replace('_', ' ')}</Badge>
                        <span className="text-xs text-ink-300">{b.booking_type.replace('_', ' ')}</span>
                      </div>
                    </div>
                    {b.status === 'pending' && (
                      <button onClick={() => handleCancel(b.id)} className="text-xs text-danger hover:underline">
                        Cancel
                      </button>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </>
        )}
      </main>

      {/* Booking modal */}
      {bookingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-card rounded-2xl p-6 w-full max-w-md mx-4 shadow-xl">
            <h3 className="text-base font-semibold text-ink-900 mb-1">Book Test</h3>
            <p className="text-sm text-ink-500 mb-4">{bookingModal.test_name}</p>

            <label className="block text-xs font-medium text-ink-700 mb-1">Type</label>
            <div className="flex gap-2 mb-3">
              {(['walk_in', 'home_visit'] as const).map((bt) => (
                <button
                  key={bt}
                  onClick={() => setBookingType(bt)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    bookingType === bt ? 'bg-accent text-white border-accent' : 'bg-card border-border text-ink-700'
                  }`}
                >
                  {bt === 'walk_in' ? 'Walk-in' : 'Home Visit'}
                </button>
              ))}
            </div>

            {bookingType === 'home_visit' && (
              <>
                <label className="block text-xs font-medium text-ink-700 mb-1">Address</label>
                <input
                  value={bookingAddress}
                  onChange={(e) => setBookingAddress(e.target.value)}
                  placeholder="Your address for sample collection"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-card outline-none focus:ring-2 focus:ring-accent/30 mb-3"
                />
              </>
            )}

            <label className="block text-xs font-medium text-ink-700 mb-1">Preferred Time Slot</label>
            <input
              value={bookingSlot}
              onChange={(e) => setBookingSlot(e.target.value)}
              placeholder="e.g. Morning, 10 AM - 12 PM"
              className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-card outline-none focus:ring-2 focus:ring-accent/30 mb-4"
            />

            <div className="flex gap-2">
              <button
                onClick={() => setBookingModal(null)}
                className="flex-1 py-2 rounded-lg text-sm font-medium border border-border text-ink-700"
              >
                Cancel
              </button>
              <Button onClick={handleBook} disabled={submitting} className="flex-1">
                {submitting ? 'Booking...' : 'Confirm'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
