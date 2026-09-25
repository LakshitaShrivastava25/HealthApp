import { useEffect, useState } from 'react';
import { Stethoscope, Check, X, Phone, Smartphone, Search } from 'lucide-react';
import Topbar from '../components/Topbar';
import { Card, Badge, Button, EmptyState } from '../components/ui';
import { adminApi } from '../lib/api';
import { formatDays, formatHours } from '@shared/availability';

type Doctor = {
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
  available_days: string[] | null;
  clinic_open_time: string | null;
  clinic_close_time: string | null;
  verification_status: string;
  license_document: string | null;
};

/** One labelled value in the details grid. Em dash when nothing was given,
 *  so a blank field reads as "not provided" rather than looking broken. */
function Detail({ label, value, span }: { label: string; value?: string | number | null; span?: boolean }) {
  const shown = value === null || value === undefined || value === '' ? '—' : String(value);
  return (
    <div className={span ? 'col-span-2' : undefined}>
      <p className="text-[10.5px] uppercase tracking-wide text-ink-300">{label}</p>
      <p className={`text-xs mt-0.5 ${shown === '—' ? 'text-ink-300' : 'text-ink-700'}`}>{shown}</p>
    </div>
  );
}

/** The endpoint already returns every doctor; this page used to discard all
 *  but the pending ones client-side. Filtering is now the admin's choice. */
const STATUSES = ['all', 'pending', 'verified', 'rejected'] as const;
type StatusFilter = (typeof STATUSES)[number];

const STATUS_TONE: Record<string, 'warning' | 'success' | 'danger' | 'neutral'> = {
  pending: 'warning',
  verified: 'success',
  rejected: 'danger',
};

export default function DoctorVerification() {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Defaults to 'all': the page lists every doctor now, and with an empty
  // verification queue a 'pending' default lands the admin on a blank
  // screen even when doctors exist. The pending count stays one click away.
  const [status, setStatus] = useState<StatusFilter>('all');
  const [query, setQuery] = useState('');

  function load() {
    adminApi.doctorVerification().then((r) => {
      // Keep every doctor — the status filter below decides what is shown.
      setDoctors(r.data.results ?? r.data);
    });
  }

  useEffect(load, []);

  const q = query.trim().toLowerCase();
  const visible = doctors.filter((d) => {
    if (status !== 'all' && d.verification_status !== status) return false;
    if (!q) return true;
    return [d.full_name, d.specialization, d.registration_number, d.clinic_name]
      .some((f) => (f || '').toLowerCase().includes(q));
  });

  async function handleApprove(id: string) {
    setBusyId(id);
    try {
      await adminApi.approveDoctor(id);
      load();
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(id: string) {
    setBusyId(id);
    try {
      await adminApi.rejectDoctor(id);
      load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <Topbar title="Doctors" subtitle="Every registered doctor — review, approve or reject" />
      <main className="p-4 sm:p-6 lg:p-8">
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <div className="flex gap-1.5">
            {STATUSES.map((s) => {
              const n = s === 'all' ? doctors.length : doctors.filter((d) => d.verification_status === s).length;
              return (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={`capitalize text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                    status === s
                      ? 'bg-accent text-white border-accent'
                      : 'bg-card text-ink-500 border-border hover:border-accent'
                  }`}
                >
                  {s} ({n})
                </button>
              );
            })}
          </div>
          <div className="relative w-full sm:w-auto sm:flex-1 sm:min-w-[200px] sm:max-w-xs">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-300" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, specialization, registration no..."
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-border bg-card outline-none focus:ring-2 focus:ring-accent/30"
            />
          </div>
        </div>

        {visible.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Stethoscope size={22} />}
              title={doctors.length === 0 ? 'No doctors registered yet' : 'Nothing matches this filter'}
              note={
                doctors.length === 0
                  ? 'Doctors appear here once they complete registration in the Doctor Portal.'
                  : 'Try a different status or search term.'
              }
            />
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {visible.map((d) => (
              <Card key={d.id} className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-sm font-semibold text-ink-900">Dr. {d.full_name}</p>
                    <p className="text-xs text-ink-500">{d.specialization}</p>
                    <p className="text-xs text-ink-300 mt-0.5">{d.qualification}</p>
                  </div>
                  <Badge tone={STATUS_TONE[d.verification_status] || 'neutral'}>{d.verification_status}</Badge>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2.5 border-t border-border pt-3">
                  <Detail label="Registration / license no." value={d.registration_number} />
                  <Detail label="Experience" value={`${d.experience_years} yrs`} />
                  <Detail label="Clinic or hospital" value={d.clinic_name} />
                  <Detail
                    label="Consultation fee"
                    value={d.consultation_fee ? `₹${Number(d.consultation_fee).toLocaleString('en-IN')}` : null}
                  />
                  <Detail label="Clinic address" value={d.clinic_address} span />
                  <Detail label="Available days" value={formatDays(d.available_days)} />
                  <Detail label="Clinic hours" value={formatHours(d.clinic_open_time, d.clinic_close_time)} />
                </div>

                {/* The two numbers are deliberately separated, iconed and
                    sub-labelled. They serve opposite purposes — one is a
                    private login credential, the other is published to
                    patients — so an admin must never have to guess which
                    is which. */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2.5 border-t border-border mt-3 pt-3">
                  <div>
                    <p className="flex items-center gap-1 text-[10.5px] uppercase tracking-wide text-ink-300">
                      <Smartphone size={11} /> Login number
                    </p>
                    <p className="text-xs text-ink-700 mt-0.5">{d.account_phone_number || '—'}</p>
                    <p className="text-[10px] text-ink-300 mt-0.5">Private — account sign-in only</p>
                  </div>
                  <div>
                    <p className="flex items-center gap-1 text-[10.5px] uppercase tracking-wide text-ink-300">
                      <Phone size={11} /> Booking number
                    </p>
                    <p className="text-xs text-ink-700 mt-0.5">{d.booking_phone_number || '—'}</p>
                    <p className="text-[10px] text-ink-300 mt-0.5">Shown to patients</p>
                  </div>
                </div>

                <div className="border-t border-border mt-3 pt-3">
                  {d.license_document ? (
                    <a href={d.license_document} target="_blank" rel="noreferrer" className="text-xs text-accent-ink">
                      View license document →
                    </a>
                  ) : (
                    <p className="text-xs text-ink-300">No license document uploaded</p>
                  )}
                </div>
                {/* An already-verified doctor keeps a Reject action (revoking
                    access is real), and a rejected one keeps Approve, but
                    neither shows the button matching the state they are
                    already in. */}
                <div className="flex gap-2 mt-4">
                  {d.verification_status !== 'verified' && (
                    <Button onClick={() => handleApprove(d.id)} disabled={busyId === d.id}>
                      <Check size={15} /> Approve
                    </Button>
                  )}
                  {d.verification_status !== 'rejected' && (
                    <Button variant="danger" onClick={() => handleReject(d.id)} disabled={busyId === d.id}>
                      <X size={15} /> Reject
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
