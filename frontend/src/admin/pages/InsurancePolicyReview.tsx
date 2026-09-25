import { useEffect, useState } from 'react';
import { ShieldCheck, Check } from 'lucide-react';
import Topbar from '../components/Topbar';
import { Card, Badge, Button, EmptyState } from '../components/ui';
import { adminApi } from '../lib/api';

type Policy = {
  id: string;
  insurer: string;
  policy_number: string;
  status: string;
  structured_data: Record<string, unknown>;
};

export default function InsurancePolicyReview() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [insurer, setInsurer] = useState('');
  const [policyNumber, setPolicyNumber] = useState('');
  const [saving, setSaving] = useState(false);

  function load() {
    adminApi.policies('needs_review').then((r) => setPolicies(r.data.results ?? r.data));
  }

  useEffect(load, []);

  function openPolicy(p: Policy) {
    setOpenId(p.id);
    setInsurer(p.insurer || '');
    setPolicyNumber(p.policy_number || '');
  }

  async function handleValidate() {
    if (!openId) return;
    setSaving(true);
    try {
      await adminApi.validatePolicy(openId, { insurer, policy_number: policyNumber });
      setOpenId(null);
      load();
    } finally {
      setSaving(false);
    }
  }

  const open = policies.find((p) => p.id === openId);

  return (
    <>
      <Topbar title="Insurance Policy Review" subtitle="Policies flagged for manual review before validation" />
      <main className="p-4 sm:p-6 lg:p-8">
        {policies.length === 0 ? (
          <Card>
            <EmptyState icon={<ShieldCheck size={22} />} title="Queue is clear" note="No policies currently need review." />
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-3">
              {policies.map((p) => (
                <button key={p.id} onClick={() => openPolicy(p)} className="w-full text-left">
                  <Card interactive className={`p-4 hover:border-accent transition-colors ${openId === p.id ? 'border-accent' : ''}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-ink-900">{p.insurer || 'Unnamed insurer'}</p>
                        <p className="text-xs text-ink-500">{p.policy_number || 'No policy number extracted'}</p>
                      </div>
                      <Badge tone="warning">needs review</Badge>
                    </div>
                  </Card>
                </button>
              ))}
            </div>

            {open && (
              <Card className="p-5 h-fit sticky top-24">
                <p className="text-sm font-semibold text-ink-900 mb-3">Confirm extracted fields</p>
                <label className="text-xs text-ink-500 block mb-1">Insurer</label>
                <input
                  value={insurer}
                  onChange={(e) => setInsurer(e.target.value)}
                  className="w-full text-sm px-3 py-2 rounded-lg border border-border outline-none mb-3"
                />
                <label className="text-xs text-ink-500 block mb-1">Policy Number</label>
                <input
                  value={policyNumber}
                  onChange={(e) => setPolicyNumber(e.target.value)}
                  className="w-full text-sm px-3 py-2 rounded-lg border border-border outline-none mb-3"
                />
                <Button className="w-full" onClick={handleValidate} disabled={saving}>
                  <Check size={15} /> {saving ? 'Validating...' : 'Validate Policy'}
                </Button>
              </Card>
            )}
          </div>
        )}
      </main>
    </>
  );
}
