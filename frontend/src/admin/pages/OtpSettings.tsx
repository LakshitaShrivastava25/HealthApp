import { useEffect, useState } from 'react';
import { KeyRound, MessageSquareText, AlertTriangle, Check, Lock } from 'lucide-react';
import Topbar from '../components/Topbar';
import { Card, CardHeader, Badge, Button } from '../components/ui';
import { adminApi } from '../lib/api';

type OtpSettingsData = {
  mode: 'sms' | 'master';
  master_otp: string;
  // USE_MASTER_OTP in the server .env overrides the toggle below.
  mode_locked_by_env: boolean;
  updated_at: string;
  updated_by: string | null;
  sms_provider: 'twilio' | '2factor';
  sms_configured: boolean;
  // Sender / template / balance only apply to 2Factor.
  sms_sender_id: string;
  sms_template_name: string;
  sms_balance: string | null;
};

type TestResult = { ok: boolean; details: string; delivery_status: string; hint: string };

/**
 * The login OTP switch. MASTER: nobody gets an SMS and every phone number
 * signs in with the master code. SMS: a random code goes out through the
 * configured provider — Twilio Verify, or 2Factor as the legacy fallback.
 * Takes effect on the very next send-otp / verify-otp — for the website and
 * the mobile app alike, since both call the same endpoints.
 */
export default function OtpSettings() {
  const [data, setData] = useState<OtpSettingsData | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [masterDraft, setMasterDraft] = useState('');
  const [saved, setSaved] = useState(false);

  const [testPhone, setTestPhone] = useState('+91');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  useEffect(() => {
    adminApi
      .otpSettings()
      .then((r) => {
        setData(r.data);
        setMasterDraft(r.data.master_otp);
      })
      .catch(() => setError('Could not load OTP settings.'));
  }, []);

  async function save(patch: { mode?: 'sms' | 'master'; master_otp?: string }) {
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const { data: next } = await adminApi.updateOtpSettings(patch);
      // PATCH skips the (slow) balance lookup; keep the last known value.
      setData((prev) => ({ ...next, sms_balance: prev?.sms_balance ?? null }));
      setMasterDraft(next.master_otp);
      setSaved(true);
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } }).response?.data?.detail;
      setError(detail || 'Could not save.');
    } finally {
      setSaving(false);
    }
  }

  async function runTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const { data: r } = await adminApi.sendTestSms(testPhone);
      setTestResult(r);
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } }).response?.data?.detail;
      setTestResult({ ok: false, details: detail || 'Request failed.', delivery_status: '', hint: '' });
    } finally {
      setTesting(false);
    }
  }

  const isMaster = data?.mode === 'master';
  const isTwilio = data?.sms_provider === 'twilio';
  const providerLabel = isTwilio ? 'Twilio Verify' : '2Factor';
  const locked = !!data?.mode_locked_by_env;

  return (
    <>
      <Topbar title="OTP Settings" subtitle="Choose how login codes are delivered — applies to web and mobile instantly" />
      <main className="p-4 sm:p-6 lg:p-8 space-y-5 max-w-3xl">
        {error && <p className="text-sm text-danger">{error}</p>}
        {!data ? (
          !error && <p className="text-sm text-ink-500">Loading…</p>
        ) : (
          <>
            <Card>
              <CardHeader
                title="Login OTP mode"
                subtitle={
                  data.updated_by
                    ? `Last changed by ${data.updated_by} · ${new Date(data.updated_at).toLocaleString()}`
                    : undefined
                }
                action={<Badge tone={isMaster ? 'warning' : 'success'}>{isMaster ? 'Master OTP' : 'SMS OTP'}</Badge>}
              />
              {locked && (
                <p className="mx-5 mt-4 flex items-start gap-2 rounded-lg bg-warning-bg px-3 py-2 text-xs text-warning">
                  <Lock size={14} className="mt-0.5 shrink-0" />
                  Locked by USE_MASTER_OTP in the server .env. Remove it there to switch modes from this page.
                </p>
              )}
              <div className="p-5 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  disabled={saving || locked || !isMaster}
                  onClick={() => save({ mode: 'sms' })}
                  className={`text-left rounded-xl border p-4 transition-colors ${
                    !isMaster ? 'border-accent bg-accent-soft' : 'border-border hover:bg-surface'
                  } disabled:cursor-default`}
                >
                  <p className="flex items-center gap-2 font-semibold text-ink-900 text-sm">
                    <MessageSquareText size={16} /> SMS OTP ({providerLabel})
                  </p>
                  <p className="text-xs text-ink-500 mt-1">A fresh random code is texted to the user's phone.</p>
                </button>
                <button
                  type="button"
                  disabled={saving || locked || isMaster}
                  onClick={() => save({ mode: 'master' })}
                  className={`text-left rounded-xl border p-4 transition-colors ${
                    isMaster ? 'border-warning bg-warning-bg' : 'border-border hover:bg-surface'
                  } disabled:cursor-default`}
                >
                  <p className="flex items-center gap-2 font-semibold text-ink-900 text-sm">
                    <KeyRound size={16} /> Master OTP
                  </p>
                  <p className="text-xs text-ink-500 mt-1">
                    No SMS. Every number logs in with <span className="font-mono font-semibold">{data.master_otp}</span>.
                  </p>
                </button>
              </div>
              {isMaster && (
                <p className="mx-5 mb-4 flex items-start gap-2 rounded-lg bg-warning-bg px-3 py-2 text-xs text-warning">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  Anyone who knows the master code can sign in to any account. Switch back to SMS once delivery works.
                </p>
              )}
              <div className="px-5 pb-5 flex flex-wrap items-end gap-3 border-t border-border pt-4">
                <div>
                  <label htmlFor="master-otp" className="mb-1 block text-[11px] font-semibold text-ink-700">
                    Master OTP (6 digits)
                  </label>
                  <input
                    id="master-otp"
                    inputMode="numeric"
                    maxLength={6}
                    value={masterDraft}
                    onChange={(e) => setMasterDraft(e.target.value.replace(/\D/g, ''))}
                    className="w-36 rounded-lg border border-border bg-card px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-accent/30"
                  />
                </div>
                <Button
                  variant="ghost"
                  disabled={saving || masterDraft.length !== 6 || masterDraft === data.master_otp}
                  onClick={() => save({ master_otp: masterDraft })}
                >
                  Save code
                </Button>
                {saved && (
                  <span className="text-xs text-success flex items-center gap-1">
                    <Check size={12} /> Saved
                  </span>
                )}
              </div>
            </Card>

            <Card>
              <CardHeader
                title="SMS gateway health"
                subtitle={isTwilio ? 'Twilio Verify (SMS channel)' : '2Factor.in transactional SMS (legacy fallback)'}
              />
              {!data.sms_configured && (
                <p className="mx-5 mt-4 flex items-start gap-2 rounded-lg bg-danger-bg px-3 py-2 text-xs text-danger">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  {providerLabel} credentials are missing on the server, so SMS OTPs cannot be sent. Use Master OTP
                  until they are set.
                </p>
              )}
              <div className="p-5 grid grid-cols-2 gap-y-2 text-sm">
                <span className="text-ink-500">{isTwilio ? 'Credentials' : 'API key'}</span>
                <span>{data.sms_configured ? <Badge tone="success">Configured</Badge> : <Badge tone="danger">Missing</Badge>}</span>
                {!isTwilio && (
                  <>
                    <span className="text-ink-500">Sender ID</span>
                    <span className="font-mono">{data.sms_sender_id}</span>
                    <span className="text-ink-500">Template</span>
                    <span className="font-mono">{data.sms_template_name}</span>
                    <span className="text-ink-500">SMS balance</span>
                    <span>{data.sms_balance ?? '—'}</span>
                  </>
                )}
              </div>
              <div className="px-5 pb-5 border-t border-border pt-4">
                {isTwilio ? (
                  <p className="text-xs text-ink-500 mb-2">
                    Send a test verification. Twilio generates and sends the code itself; "pending" means Twilio accepted
                    the request and is delivering it. Twilio exposes no delivery report here — confirm on the phone.
                  </p>
                ) : (
                  <p className="text-xs text-ink-500 mb-2">
                    Send a test SMS and read the operator's delivery status. "Success" from 2Factor alone does not mean
                    the SMS arrived — DLT rejections only show up in the delivery status.
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <input
                    value={testPhone}
                    onChange={(e) => setTestPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                    className="w-48 rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/30"
                  />
                  <Button variant="secondary" disabled={testing} onClick={runTest}>
                    {testing ? 'Sending…' : 'Send test SMS'}
                  </Button>
                </div>
                {testResult && (
                  <div className="mt-3 rounded-lg bg-surface px-3 py-2 text-xs space-y-1">
                    <p>
                      {providerLabel}: <Badge tone={testResult.ok ? 'success' : 'danger'}>{testResult.ok ? 'Accepted' : 'Rejected'}</Badge>{' '}
                      <span className="font-mono text-ink-500">{testResult.details}</span>
                    </p>
                    {/* Twilio has no delivery-report lookup; its status is always "pending". */}
                    {testResult.ok && !isTwilio && (
                      <p>
                        Delivery:{' '}
                        <Badge tone={/deliver/i.test(testResult.delivery_status) ? 'success' : testResult.delivery_status === 'pending' ? 'neutral' : 'danger'}>
                          {testResult.delivery_status}
                        </Badge>
                      </p>
                    )}
                    {testResult.hint && <p className="text-warning">{testResult.hint}</p>}
                  </div>
                )}
              </div>
            </Card>
          </>
        )}
      </main>
    </>
  );
}
