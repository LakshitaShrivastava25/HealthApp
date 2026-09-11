import { useEffect, useState } from 'react';
import { Copy, Check, UserCheck, UserX, ShieldOff, Stethoscope } from 'lucide-react';
import Topbar from '../components/Topbar';
import { Card, CardHeader, Badge, Button, EmptyState } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { doctorAccessApi } from '../lib/api';

type Grant = {
  id: string;
  status: 'pending' | 'approved' | 'denied' | 'revoked' | 'expired';
  requested_at: string;
  doctor_detail: { full_name: string; specialization: string; clinic_name: string };
};

export default function DoctorAccess() {
  const { activeProfile } = useAuth();
  const [grants, setGrants] = useState<Grant[]>([]);
  const [copied, setCopied] = useState(false);
  const [actingOnId, setActingOnId] = useState<string | null>(null);

  useEffect(() => {
    if (!activeProfile) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProfile]);

  function load() {
    if (!activeProfile) return;
    doctorAccessApi.listForProfile(activeProfile.id).then((r) => setGrants(r.data.results ?? r.data));
  }

  function handleCopy() {
    if (!activeProfile) return;
    navigator.clipboard.writeText(activeProfile.reference_code ?? '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function respond(id: string, action: 'approve' | 'deny' | 'revoke') {
    setActingOnId(id);
    try {
      if (action === 'approve') await doctorAccessApi.approve(id);
      else if (action === 'deny') await doctorAccessApi.deny(id);
      else await doctorAccessApi.revoke(id);
      await load();
    } finally {
      setActingOnId(null);
    }
  }

  const pending = grants.filter((g) => g.status === 'pending');
  const approved = grants.filter((g) => g.status === 'approved');
  const past = grants.filter((g) => ['denied', 'revoked', 'expired'].includes(g.status));

  return (
    <>
      <Topbar title="Doctor Access" subtitle="Share your reference ID and manage who can see your records" />
      <main className="p-8 space-y-6 max-w-3xl">
        <Card className="p-5">
          <p className="text-sm font-semibold text-ink-900 mb-1">Your Patient Reference ID</p>
          <p className="text-xs text-ink-500 mb-3">
            Give this to a doctor so they can request access to your records. They can't see anything
            until you approve their request below.
          </p>
          <div className="flex items-center gap-2 bg-surface rounded-lg px-3.5 py-2.5 border border-border">
            <code className="text-base font-semibold tracking-[0.12em] text-ink-900 flex-1">
            {activeProfile?.reference_code ?? '—'}
          </code>
            <button
              onClick={handleCopy}
              className="shrink-0 flex items-center gap-1.5 text-xs font-medium text-brand-purple hover:text-brand-purple/80"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </Card>

        <Card className="p-5">
          <CardHeader title="Pending Requests" subtitle="Review and respond — nothing happens without your approval" />
          {pending.length === 0 ? (
            <p className="text-sm text-ink-500 mt-3">No pending requests right now.</p>
          ) : (
            <div className="mt-3 space-y-3">
              {pending.map((g) => (
                <div key={g.id} className="flex items-center justify-between border border-border rounded-lg px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-brand-lavender text-brand-purple flex items-center justify-center shrink-0">
                      <Stethoscope size={16} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-ink-900">Dr. {g.doctor_detail.full_name}</p>
                      <p className="text-xs text-ink-500">
                        {g.doctor_detail.specialization}
                        {g.doctor_detail.clinic_name ? ` · ${g.doctor_detail.clinic_name}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      onClick={() => respond(g.id, 'approve')}
                      disabled={actingOnId === g.id}
                      className="!px-3 !py-1.5 text-xs"
                    >
                      <UserCheck size={13} /> Approve
                    </Button>
                    <button
                      onClick={() => respond(g.id, 'deny')}
                      disabled={actingOnId === g.id}
                      className="flex items-center gap-1 text-xs font-medium text-danger px-3 py-1.5 rounded-lg hover:bg-danger-bg disabled:opacity-50"
                    >
                      <UserX size={13} /> Deny
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <CardHeader title="Doctors With Access" subtitle="Revoke access at any time" />
          {approved.length === 0 ? (
            <EmptyState
              icon={<UserCheck size={22} />}
              title="No doctors have access yet"
              note="Share your reference ID above with a doctor to get started."
            />
          ) : (
            <div className="mt-3 space-y-3">
              {approved.map((g) => (
                <div key={g.id} className="flex items-center justify-between border border-border rounded-lg px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-success-bg text-success flex items-center justify-center shrink-0">
                      <Stethoscope size={16} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-ink-900">Dr. {g.doctor_detail.full_name}</p>
                      <p className="text-xs text-ink-500">{g.doctor_detail.specialization}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => respond(g.id, 'revoke')}
                    disabled={actingOnId === g.id}
                    className="flex items-center gap-1 text-xs font-medium text-danger px-3 py-1.5 rounded-lg hover:bg-danger-bg disabled:opacity-50 shrink-0"
                  >
                    <ShieldOff size={13} /> Revoke
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>

        {past.length > 0 && (
          <Card className="p-5">
            <CardHeader title="Past Requests" />
            <div className="mt-3 space-y-2">
              {past.map((g) => (
                <div key={g.id} className="flex items-center justify-between text-sm">
                  <span className="text-ink-900">Dr. {g.doctor_detail.full_name}</span>
                  <Badge tone={g.status === 'denied' ? 'danger' : 'neutral'}>{g.status}</Badge>
                </div>
              ))}
            </div>
          </Card>
        )}
      </main>
    </>
  );
}
