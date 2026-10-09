import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, SearchCheck, WifiOff, XCircle } from 'lucide-react';
import { doctorApi, type RegisterCheck as CheckResult } from '../lib/api';

/**
 * The "Verify" button: looks the registration up on the NMC register before
 * the doctor submits, and shows what the register has. It never blocks
 * submission — an admin reviews every registration, whatever this says.
 */
export default function RegisterCheck({
  registrationNumber,
  councilId,
  year,
  fullName,
}: {
  registrationNumber: string;
  councilId: string;
  year?: string;
  fullName?: string;
}) {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ready = registrationNumber.trim() !== '' && councilId !== '';

  async function check() {
    setChecking(true);
    setError(null);
    setResult(null);
    try {
      const { data } = await doctorApi.verifyRegistration({
        registration_number: registrationNumber.trim(),
        state_council_id: councilId,
        registration_year: year ? Number(year) : null,
        full_name: fullName?.replace(/^dr(\.\s*|\s+)/i, '').trim() || undefined,
      });
      setResult(data);
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      setError(
        status === 429
          ? 'Too many checks in a minute — wait a moment and try again.'
          : "We couldn't reach the medical register right now — your registration will be verified shortly."
      );
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-white/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] text-ink-500">Check your number on the NMC Indian Medical Register (optional).</p>
        <button
          type="button"
          onClick={check}
          disabled={!ready || checking}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-lavender px-3 py-1.5 text-xs font-semibold text-brand-purple transition-colors hover:bg-brand-lavender/70 disabled:opacity-50"
        >
          {checking ? <Loader2 size={13} className="hn-spin" /> : <SearchCheck size={13} />}
          {checking ? 'Checking…' : 'Verify'}
        </button>
      </div>

      {error && (
        <p className="mt-2 flex items-start gap-1.5 text-[12px] text-warning">
          <WifiOff size={13} className="mt-0.5 shrink-0" /> {error}
        </p>
      )}

      {result && (
        <div className="mt-2 space-y-1 text-[12px]" role="status">
          {result.status === 'found' && (
            <>
              <p className={`flex items-start gap-1.5 font-semibold ${result.suspended ? 'text-danger' : 'text-success'}`}>
                {result.suspended ? <AlertTriangle size={13} className="mt-0.5" /> : <CheckCircle2 size={13} className="mt-0.5" />}
                {result.suspended ? 'On the register, but listed as removed' : 'Found on the NMC register'}
              </p>
              <p className="text-ink-700">
                <span className="text-ink-500">Name on register:</span> {result.nmc_name || '—'}
                {result.name_matches !== null && (
                  <span className={result.name_matches ? 'text-success' : 'text-warning'}>
                    {' '}
                    · {result.name_matches ? 'matches your name' : "doesn't match the name you entered"}
                  </span>
                )}
              </p>
              <p className="text-ink-700">
                <span className="text-ink-500">Qualification:</span> {result.nmc_qualification || '—'}
                {result.nmc_university ? ` · ${result.nmc_university}` : ''}
              </p>
            </>
          )}
          {result.status === 'not_found' && (
            <p className="flex items-start gap-1.5 text-warning">
              <XCircle size={13} className="mt-0.5 shrink-0" /> {result.message}
            </p>
          )}
          {(result.status === 'ambiguous' || result.status === 'unavailable') && (
            <p className="flex items-start gap-1.5 text-warning">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {result.message}
            </p>
          )}
          <p className="text-[11px] text-ink-500">An admin reviews every registration before you can see patients.</p>
        </div>
      )}
    </div>
  );
}
