import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle, Check, CheckCircle2, ExternalLink, Phone, RefreshCw, Search, Smartphone, Stethoscope, X,
} from 'lucide-react';
import Topbar from '../components/Topbar';
import { Card, Badge, Button, EmptyState } from '../components/ui';
import { adminApi } from '../lib/api';
import { formatDays, formatHours } from '@shared/availability';
import { DOCTOR_STATUS_LABEL } from '@shared/councils';
import FileViewer from '@shared/components/FileViewer';

type Doctor = {
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
  available_days: string[] | null;
  clinic_open_time: string | null;
  clinic_close_time: string | null;
  verification_status: string;
  license_document: string | null;
  license_document_type?: string;
  submitted_at: string;
  nmc_result: '' | 'found' | 'not_found' | 'ambiguous' | 'unavailable';
  nmc_checked_at: string | null;
  nmc_doctor_id: string;
  nmc_name: string;
  nmc_qualification: string;
  nmc_university: string;
  nmc_registration_date: string | null;
  nmc_suspended: boolean;
  nmc_remarks: string;
  nmc_payload: Record<string, unknown> | null;
  name_match_score: number | null;
  name_matches: boolean | null;
  verification_provider: string;
  last_verification_error: string;
  verified_at: string | null;
  verified_by_phone: string | null;
  rejection_reason: string;
  imr_url: string;
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

/** Tabs filter on the server. "Needs review" is everything waiting for a
 *  decision: not yet checked, checked by the register, or register unreachable. */
const TABS = [
  { key: 'review', label: 'Needs review' },
  { key: 'verified', label: 'Verified' },
  { key: 'rejected', label: 'Rejected' },
  { key: '', label: 'All' },
] as const;

const STATUS_TONE: Record<string, 'warning' | 'success' | 'danger' | 'info' | 'neutral'> = {
  pending: 'warning',
  manual_review: 'info',
  failed: 'warning',
  verified: 'success',
  rejected: 'danger',
};

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

/** What the NMC register said — the evidence the admin decides on. */
function RegisterEvidence({ d }: { d: Doctor }) {
  const score = d.name_match_score === null ? null : Math.round(d.name_match_score * 100);
  return (
    <div className="mt-3 rounded-lg border border-border bg-surface/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-500">NMC register check</p>
        <a
          href={d.imr_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[11px] font-medium text-accent-ink hover:underline"
        >
          Check on the NMC register <ExternalLink size={11} />
        </a>
      </div>

      {d.nmc_result === '' && (
        <p className="mt-1.5 text-xs text-ink-500">
          Not checked{!d.state_council_id ? ' — no medical council was given (older app version).' : ' yet.'}
        </p>
      )}

      {d.nmc_result === 'found' && (
        <div className="mt-1.5 space-y-1.5">
          <p className={`flex items-center gap-1.5 text-xs font-semibold ${d.nmc_suspended ? 'text-danger' : 'text-success'}`}>
            {d.nmc_suspended ? <AlertTriangle size={13} /> : <CheckCircle2 size={13} />}
            {d.nmc_suspended ? 'On the register — listed as REMOVED' : 'Found on the register'}
          </p>
          {d.nmc_suspended && d.nmc_remarks && <p className="text-xs text-danger">{d.nmc_remarks}</p>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
            <Detail label="Name on register" value={d.nmc_name} />
            <div>
              <p className="text-[10.5px] uppercase tracking-wide text-ink-300">Name match</p>
              <p className={`text-xs mt-0.5 font-semibold ${d.name_matches ? 'text-success' : 'text-warning'}`}>
                {score === null ? '—' : `${score}% — ${d.name_matches ? 'matches' : 'check the name'}`}
              </p>
            </div>
            <Detail label="Qualification" value={d.nmc_qualification} />
            <Detail label="University" value={d.nmc_university} />
            <Detail label="Registered on" value={d.nmc_registration_date} />
            <Detail label="NMC record ID" value={d.nmc_doctor_id} />
          </div>
        </div>
      )}

      {(d.nmc_result === 'not_found' || d.nmc_result === 'ambiguous') && (
        <p className="mt-1.5 flex items-start gap-1.5 text-xs text-warning">
          <AlertTriangle size={13} className="mt-px shrink-0" /> {d.nmc_remarks}
        </p>
      )}

      {d.nmc_result === 'unavailable' && (
        <p className="mt-1.5 text-xs text-warning">
          The register couldn&apos;t be reached ({d.last_verification_error || 'no answer'}). Re-verify, or check by hand.
        </p>
      )}

      {d.nmc_checked_at && (
        <p className="mt-2 text-[10.5px] text-ink-300">
          Checked {when(d.nmc_checked_at)}
          {d.verification_provider && d.verification_provider !== 'nmc' ? ` via ${d.verification_provider}` : ''}
        </p>
      )}

      {d.nmc_payload && (
        <details className="mt-2">
          <summary className="cursor-pointer text-[11px] font-medium text-ink-500 hover:text-ink-900">
            Raw NMC data
          </summary>
          <pre className="mt-1.5 max-h-56 overflow-auto rounded-md bg-card p-2 text-[10.5px] leading-snug text-ink-700">
            {JSON.stringify(d.nmc_payload, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}

/** Asks for the reason before rejecting — the doctor is shown it. */
function RejectDialog({ doctor, onCancel, onConfirm }: {
  doctor: Doctor;
  onCancel: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  // Escape closes it, like any modal — unless the rejection is in flight.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/40 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Reject Dr. ${doctor.full_name}`}
      onClick={onCancel}
    >
      <div className="w-full rounded-t-2xl bg-card p-5 shadow-card sm:max-w-md sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm font-semibold text-ink-900">Reject Dr. {doctor.full_name}?</p>
        <p className="mt-1 text-xs text-ink-500">
          The doctor sees this reason and can correct their details and resubmit.
        </p>
        <textarea
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="e.g. The registration number doesn't match the name on the NMC register."
          className="mt-3 w-full resize-none rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/30"
        />
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button
            variant="danger"
            disabled={busy || reason.trim().length < 3}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm(reason.trim());
              } finally {
                setBusy(false);
              }
            }}
          >
            <X size={15} /> Reject
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function DoctorVerification() {
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('review');
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [total, setTotal] = useState(0);
  const [nextPage, setNextPage] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<Doctor | null>(null);
  const [query, setQuery] = useState('');

  const load = useCallback(async (status: string, page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await adminApi.doctorQueue(status, page);
      const rows: Doctor[] = data.results ?? data;
      setDoctors((prev) => (page === 1 ? rows : [...prev, ...rows]));
      setTotal(data.count ?? rows.length);
      setNextPage(data.next ? page + 1 : null);
    } catch {
      setError("Couldn't load doctors. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(tab);
  }, [tab, load]);

  /** Swap in the updated row the action returned; drop it if it left this tab. */
  function replace(updated: Doctor) {
    const stays =
      tab === '' ||
      (tab === 'review' ? ['pending', 'manual_review', 'failed'].includes(updated.verification_status) : updated.verification_status === tab);
    setDoctors((list) => (stays ? list.map((d) => (d.id === updated.id ? updated : d)) : list.filter((d) => d.id !== updated.id)));
    if (!stays) setTotal((n) => Math.max(0, n - 1));
  }

  async function act(id: string, run: () => Promise<{ data: Doctor }>) {
    setBusyId(id);
    setError(null);
    try {
      replace((await run()).data);
    } catch {
      setError('That action failed. Please try again.');
    } finally {
      setBusyId(null);
    }
  }

  const q = query.trim().toLowerCase();
  const visible = doctors.filter((d) =>
    !q || [d.full_name, d.specialization, d.registration_number, d.clinic_name, d.nmc_name, d.state_council_name]
      .some((f) => (f || '').toLowerCase().includes(q))
  );

  return (
    <>
      <Topbar title="Doctor Verification" subtitle="Check each registration against the NMC register, then approve or reject" />
      <main className="p-4 sm:p-6 lg:p-8">
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-1.5">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                  tab === t.key ? 'bg-accent text-white border-accent' : 'bg-card text-ink-500 border-border hover:border-accent'
                }`}
              >
                {t.label}
                {tab === t.key && !loading ? ` (${total})` : ''}
              </button>
            ))}
          </div>
          <div className="relative w-full sm:w-auto sm:flex-1 sm:min-w-[200px] sm:max-w-xs">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-300" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, registration no, council..."
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-border bg-card outline-none focus:ring-2 focus:ring-accent/30"
            />
          </div>
        </div>

        {error && <p className="mb-4 text-sm text-danger">{error}</p>}

        {loading && doctors.length === 0 ? (
          <p className="text-sm text-ink-500">Loading…</p>
        ) : visible.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Stethoscope size={22} />}
              title={tab === 'review' ? 'Nothing waiting for review' : 'No doctors here'}
              note="Doctors appear here as soon as they register in the app or on the website."
            />
          </Card>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {visible.map((d) => (
              <Card key={d.id} className="p-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink-900">Dr. {d.full_name}</p>
                    <p className="text-xs text-ink-500">{d.specialization}</p>
                    <p className="text-xs text-ink-300 mt-0.5">{d.qualification}</p>
                  </div>
                  <Badge tone={STATUS_TONE[d.verification_status] || 'neutral'}>
                    {d.verification_status === 'failed' ? 'Register unreachable' : DOCTOR_STATUS_LABEL[d.verification_status] ?? d.verification_status}
                  </Badge>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2.5 border-t border-border pt-3">
                  <Detail label="Registration no." value={d.registration_number} />
                  <Detail label="Council" value={d.state_council_name} />
                  <Detail label="Year of registration" value={d.registration_year} />
                  <Detail label="Experience" value={`${d.experience_years} yrs`} />
                  <Detail label="Clinic or hospital" value={d.clinic_name} />
                  <Detail
                    label="Consultation fee"
                    value={d.consultation_fee ? `₹${Number(d.consultation_fee).toLocaleString('en-IN')}` : null}
                  />
                  <Detail label="Clinic address" value={d.clinic_address} span />
                  <Detail label="Available days" value={formatDays(d.available_days)} />
                  <Detail label="Clinic hours" value={formatHours(d.clinic_open_time, d.clinic_close_time)} />
                  <Detail label="Submitted" value={when(d.submitted_at)} />
                </div>

                <RegisterEvidence d={d} />

                {/* The two numbers serve opposite purposes — one is a private
                    login credential, the other is published to patients — so
                    an admin must never have to guess which is which. */}
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
                    <LicenceLink url={d.license_document} type={d.license_document_type} name={d.full_name} />
                  ) : (
                    <p className="text-xs text-ink-300">No license document uploaded</p>
                  )}
                </div>

                {(d.verification_status === 'verified' || d.verification_status === 'rejected') && (
                  <p className="mt-2 text-[11px] text-ink-500">
                    {d.verification_status === 'verified' ? 'Approved' : 'Rejected'} {when(d.verified_at)}
                    {d.verified_by_phone ? ` by ${d.verified_by_phone}` : ''}
                    {d.verification_status === 'rejected' && d.rejection_reason ? ` — “${d.rejection_reason}”` : ''}
                  </p>
                )}

                {/* An already-verified doctor keeps Reject (revoking access is
                    real), and a rejected one keeps Approve. */}
                <div className="flex flex-wrap gap-2 mt-4">
                  {d.registration_number && d.state_council_id && (
                    <Button variant="secondary" onClick={() => act(d.id, () => adminApi.reverifyDoctor(d.id))} disabled={busyId === d.id}>
                      <RefreshCw size={14} className={busyId === d.id ? 'hn-spin' : ''} /> Re-verify
                    </Button>
                  )}
                  {d.verification_status !== 'verified' && (
                    <Button onClick={() => act(d.id, () => adminApi.approveDoctor(d.id))} disabled={busyId === d.id}>
                      <Check size={15} /> Approve
                    </Button>
                  )}
                  {d.verification_status !== 'rejected' && (
                    <Button variant="danger" onClick={() => setRejecting(d)} disabled={busyId === d.id}>
                      <X size={15} /> Reject
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}

        {nextPage && (
          <div className="mt-5 flex justify-center">
            <Button variant="secondary" onClick={() => load(tab, nextPage)} disabled={loading}>
              {loading ? 'Loading…' : 'Load more'}
            </Button>
          </div>
        )}
      </main>

      {rejecting && (
        <RejectDialog
          doctor={rejecting}
          onCancel={() => setRejecting(null)}
          onConfirm={async (reason) => {
            await act(rejecting.id, () => adminApi.rejectDoctor(rejecting.id, reason));
            setRejecting(null);
          }}
        />
      )}
    </>
  );
}

/** Opens a doctor's licence in the in-app viewer rather than a new tab. */
function LicenceLink({ url, type, name }: { url: string; type?: string; name: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className="text-xs text-accent-ink hover:underline">
        View license document →
      </button>
      {open && <FileViewer url={url} type={type} title={`Licence — ${name}`} onClose={() => setOpen(false)} />}
    </>
  );
}
