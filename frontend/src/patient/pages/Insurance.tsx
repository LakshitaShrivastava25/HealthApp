import { useEffect, useRef, useState } from 'react';
import { Plus, ShieldCheck, Sparkles, Send, Calculator, UploadCloud, XCircle, Clock, Layers, Trash2, Pencil, FileText, Check, X } from 'lucide-react';
import Topbar from '../components/Topbar';
import { Card, CardHeader, Badge, Button } from '../components/ui';
import AIMarkdown from '../components/AIMarkdown';
import { useAuth } from '../context/AuthContext';
import { insuranceApi } from '../lib/api';

type Exclusion = { id: string; description: string };
type WaitingPeriod = { id: string; condition: string; months: number; waiting_until: string | null };
type SubLimit = { id: string; category: string; limit_text: string };

type Policy = {
  id: string;
  insurer: string;
  plan_name: string;
  status: string;
  policy_number: string;
  sum_insured: string | null;
  premium_amount: string | null;
  premium_due_date: string | null;
  coverage_start: string | null;
  coverage_end: string | null;
  room_rent_limit: string;
  co_payment_percent: string | null;
  structured_data: Record<string, unknown>;
  exclusions: Exclusion[];
  waiting_periods: WaitingPeriod[];
  sub_limits: SubLimit[];
  file: string | null;
};

type ChatMessage = { id: string; role: 'user' | 'ai'; content: string };
type Estimate = {
  eligible: boolean;
  estimated_insurer_share: string | null;
  estimated_out_of_pocket: string | null;
  reasoning_summary: string;
};

export default function Insurance() {
  const { activeProfile } = useAuth();
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [activePolicyId, setActivePolicyId] = useState<string | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  const [claimCategory, setClaimCategory] = useState('');
  const [claimBill, setClaimBill] = useState('');
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [estimating, setEstimating] = useState(false);

  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingDetails, setConfirmingDetails] = useState(false);
  const [isEditingFields, setIsEditingFields] = useState(false);
  const [editForm, setEditForm] = useState({
    insurer: '', plan_name: '', policy_number: '', sum_insured: '',
    coverage_start: '', coverage_end: '', premium_amount: '', premium_due_date: '',
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const activePolicy = policies.find((p) => p.id === activePolicyId) || null;

  async function loadPolicies(selectId?: string) {
    if (!activeProfile) return;
    const { data } = await insuranceApi.list(activeProfile.id);
    const list = data.results ?? data;
    setPolicies(list);
    if (selectId && list.some((p: Policy) => p.id === selectId)) {
      setActivePolicyId(selectId);
    } else if (list.length > 0) {
      setActivePolicyId((current) => (current && list.some((p: Policy) => p.id === current) ? current : list[0].id));
    } else {
      setActivePolicyId(null);
    }
  }

  useEffect(() => {
    loadPolicies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProfile]);

  useEffect(() => {
    setEstimate(null);
    setConfirmingDelete(false);
    if (!activePolicy) return;
    insuranceApi.chatHistory(activePolicy.id).then((r) => setChat(r.data));
  }, [activePolicy?.id]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !activeProfile) return;
    setUploading(true);
    try {
      const { data } = await insuranceApi.upload(activeProfile.id, file);
      await loadPolicies(data.id);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleDeletePolicy() {
    if (!activePolicy) return;
    setDeleting(true);
    try {
      await insuranceApi.delete(activePolicy.id);
      await loadPolicies();
    } finally {
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  function startEditingFields() {
    if (!activePolicy) return;
    setEditForm({
      insurer: activePolicy.insurer || '',
      plan_name: activePolicy.plan_name || '',
      policy_number: activePolicy.policy_number || '',
      sum_insured: activePolicy.sum_insured || '',
      coverage_start: activePolicy.coverage_start || '',
      coverage_end: activePolicy.coverage_end || '',
      premium_amount: activePolicy.premium_amount || '',
      premium_due_date: activePolicy.premium_due_date || '',
    });
    setIsEditingFields(true);
  }

  async function handleSaveEdit() {
    if (!activePolicy) return;
    setSavingEdit(true);
    try {
      const { data } = await insuranceApi.update(activePolicy.id, editForm);
      setPolicies((prev) => prev.map((p) => (p.id === data.id ? data : p)));
      setIsEditingFields(false);
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleAsk() {
    if (!activePolicy || !question.trim()) return;
    setChatLoading(true);
    const q = question;
    setQuestion('');
    setChat((c) => [...c, { id: `local-${Date.now()}`, role: 'user', content: q }]);
    try {
      const { data } = await insuranceApi.chat(activePolicy.id, q);
      setChat((c) => [...c, data]);
    } finally {
      setChatLoading(false);
    }
  }

  async function handleEstimate() {
    if (!activePolicy || !claimCategory.trim() || !claimBill.trim()) return;
    setEstimating(true);
    try {
      const { data } = await insuranceApi.estimate(activePolicy.id, claimCategory, claimBill);
      setEstimate(data);
    } finally {
      setEstimating(false);
    }
  }

  return (
    <>
      <Topbar
        title="Insurance Overview"
        subtitle="All your insurance policies at a glance"
        action={
          <>
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleUpload} accept=".pdf,.jpg,.jpeg,.png" />
            <Button onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              {uploading ? <UploadCloud size={16} /> : <Plus size={16} />} {uploading ? 'Uploading...' : 'Add Policy'}
            </Button>
          </>
        }
      />

      <main className="p-8 space-y-6">
        {policies.length === 0 && (
          <Card className="p-10 text-center text-sm text-ink-500">
            No insurance policy uploaded yet — click "Add Policy" to get started.
          </Card>
        )}

        {policies.length > 1 && (
          <div className="flex gap-1.5 flex-wrap">
            {policies.map((p) => (
              <button
                key={p.id}
                onClick={() => setActivePolicyId(p.id)}
                className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  p.id === activePolicyId ? 'bg-brand-purple text-white' : 'bg-card border border-border text-ink-700'
                }`}
              >
                {p.insurer || p.policy_number || 'Untitled policy'}
              </button>
            ))}
          </div>
        )}

        {activePolicy && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="lg:col-span-2 p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-lg bg-brand-lavender text-brand-purple flex items-center justify-center">
                      <ShieldCheck size={20} />
                    </div>
                    <div>
                      {isEditingFields ? (
                        <>
                          <input
                            value={editForm.insurer}
                            onChange={(e) => setEditForm({ ...editForm, insurer: e.target.value })}
                            placeholder="Insurer name"
                            className="text-sm font-semibold text-ink-900 border-b border-border outline-none focus:border-brand-purple w-full"
                          />
                          <input
                            value={editForm.plan_name}
                            onChange={(e) => setEditForm({ ...editForm, plan_name: e.target.value })}
                            placeholder="Plan name"
                            className="text-xs text-ink-500 border-b border-border outline-none focus:border-brand-purple w-full mt-1"
                          />
                        </>
                      ) : (
                        <>
                          <p className="text-sm font-semibold text-ink-900">{activePolicy.insurer || 'Processing...'}</p>
                          <p className="text-xs text-ink-500">{activePolicy.plan_name}</p>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {!isEditingFields && (
                      <button
                        onClick={startEditingFields}
                        title="Correct a field"
                        className="text-ink-300 hover:text-brand-purple transition-colors"
                      >
                        <Pencil size={15} />
                      </button>
                    )}
                    <Badge tone={activePolicy.status === 'validated' ? 'success' : 'warning'}>{activePolicy.status}</Badge>
                  </div>
                </div>

                {activePolicy.file && !isEditingFields && (
                  <a
                    href={activePolicy.file}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-purple mt-2 hover:underline"
                  >
                    <FileText size={13} /> View original document
                  </a>
                )}

                {isEditingFields ? (
                  <div className="grid grid-cols-2 gap-4 mt-5 pt-5 border-t border-border">
                    <div>
                      <p className="text-xs text-ink-500 mb-1">Policy Number</p>
                      <input
                        value={editForm.policy_number}
                        onChange={(e) => setEditForm({ ...editForm, policy_number: e.target.value })}
                        className="text-sm w-full px-2 py-1.5 rounded-lg border border-border outline-none focus:ring-2 focus:ring-brand-purple/30"
                      />
                    </div>
                    <div>
                      <p className="text-xs text-ink-500 mb-1">Sum Insured (₹)</p>
                      <input
                        value={editForm.sum_insured}
                        onChange={(e) => setEditForm({ ...editForm, sum_insured: e.target.value })}
                        inputMode="numeric"
                        className="text-sm w-full px-2 py-1.5 rounded-lg border border-border outline-none focus:ring-2 focus:ring-brand-purple/30"
                      />
                    </div>
                    <div>
                      <p className="text-xs text-ink-500 mb-1">Policy Start Date</p>
                      <input
                        type="date"
                        value={editForm.coverage_start}
                        onChange={(e) => setEditForm({ ...editForm, coverage_start: e.target.value })}
                        className="text-sm w-full px-2 py-1.5 rounded-lg border border-border outline-none focus:ring-2 focus:ring-brand-purple/30"
                      />
                    </div>
                    <div>
                      <p className="text-xs text-ink-500 mb-1">Policy Expiry Date</p>
                      <input
                        type="date"
                        value={editForm.coverage_end}
                        onChange={(e) => setEditForm({ ...editForm, coverage_end: e.target.value })}
                        className="text-sm w-full px-2 py-1.5 rounded-lg border border-border outline-none focus:ring-2 focus:ring-brand-purple/30"
                      />
                    </div>
                    <div>
                      <p className="text-xs text-ink-500 mb-1">Premium Amount (₹)</p>
                      <input
                        value={editForm.premium_amount}
                        onChange={(e) => setEditForm({ ...editForm, premium_amount: e.target.value })}
                        inputMode="numeric"
                        placeholder="e.g. 12500"
                        className="text-sm w-full px-2 py-1.5 rounded-lg border border-border outline-none focus:ring-2 focus:ring-brand-purple/30"
                      />
                    </div>
                    <div>
                      <p className="text-xs text-ink-500 mb-1">Premium Due Date</p>
                      <input
                        type="date"
                        value={editForm.premium_due_date}
                        onChange={(e) => setEditForm({ ...editForm, premium_due_date: e.target.value })}
                        className="text-sm w-full px-2 py-1.5 rounded-lg border border-border outline-none focus:ring-2 focus:ring-brand-purple/30"
                      />
                    </div>
                    <div className="col-span-2 flex gap-2 mt-1">
                      <Button onClick={handleSaveEdit} disabled={savingEdit}>
                        <Check size={14} /> {savingEdit ? 'Saving...' : 'Save Changes'}
                      </Button>
                      <Button variant="ghost" onClick={() => setIsEditingFields(false)} disabled={savingEdit}>
                        <X size={14} /> Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4 mt-5 pt-5 border-t border-border">
                    <div>
                      <p className="text-xs text-ink-500">Policy Number</p>
                      <p className="text-sm font-semibold text-ink-900 mt-0.5">{activePolicy.policy_number || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-ink-500">Sum Insured</p>
                      <p className="text-sm font-semibold text-ink-900 mt-0.5">
                        {activePolicy.sum_insured ? `₹${Number(activePolicy.sum_insured).toLocaleString('en-IN')}` : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-ink-500">Policy Start Date</p>
                      <p className="text-sm font-semibold text-ink-900 mt-0.5">{activePolicy.coverage_start || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-ink-500">Policy Expiry Date</p>
                      <p className="text-sm font-semibold text-ink-900 mt-0.5">{activePolicy.coverage_end || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-ink-500">Premium Amount</p>
                      <p className="text-sm font-semibold text-ink-900 mt-0.5">
                        {activePolicy.premium_amount ? `₹${Number(activePolicy.premium_amount).toLocaleString('en-IN')}` : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-ink-500">Premium Due Date</p>
                      {activePolicy.premium_due_date ? (() => {
                        const daysLeft = Math.ceil(
                          (new Date(activePolicy.premium_due_date).getTime() - Date.now()) / 86400000
                        );
                        const urgent = daysLeft <= 14;
                        return (
                          <p className={`text-sm font-semibold mt-0.5 ${urgent ? 'text-danger' : 'text-ink-900'}`}>
                            {activePolicy.premium_due_date}
                            {daysLeft >= 0 && (
                              <span className="text-xs font-normal ml-1">
                                ({daysLeft === 0 ? 'today' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`})
                              </span>
                            )}
                            {daysLeft < 0 && (
                              <span className="text-xs font-normal ml-1">
                                ({Math.abs(daysLeft)} day{Math.abs(daysLeft) === 1 ? '' : 's'} overdue)
                              </span>
                            )}
                          </p>
                        );
                      })() : (
                        <p className="text-sm font-semibold text-ink-900 mt-0.5">—</p>
                      )}
                    </div>
                  </div>
                )}

                {activePolicy.status !== 'validated' && (() => {
                  const sd = activePolicy.structured_data as {
                    _extraction_failed?: boolean;
                    _extraction_warning?: string;
                    _mock?: boolean;
                    note?: string;
                  };

                  async function handleConfirm() {
                    if (!activePolicy) return;
                    setConfirmingDetails(true);
                    try {
                      const { data } = await insuranceApi.confirm(activePolicy.id);
                      setPolicies((prev) => prev.map((p) => (p.id === data.id ? data : p)));
                    } finally {
                      setConfirmingDetails(false);
                    }
                  }

                  // Nothing real to confirm yet — just show the reason.
                  if (sd?._extraction_failed) {
                    return (
                      <p className="text-xs text-ink-500 mt-4 bg-warning-bg text-warning rounded-lg px-3 py-2">
                        {sd.note}
                      </p>
                    );
                  }
                  if (sd?._mock) {
                    return (
                      <p className="text-xs text-ink-500 mt-4 bg-warning-bg text-warning rounded-lg px-3 py-2">
                        This policy is awaiting review. Fields will populate once processing completes
                        (or once ANTHROPIC_API_KEY is configured on the backend for real extraction).
                      </p>
                    );
                  }

                  // Real data exists in both remaining cases — worth a
                  // human glance and an explicit confirm, not an
                  // automatic status change.
                  return (
                    <div className="mt-4 bg-warning-bg text-warning rounded-lg px-3 py-2.5">
                      <p className="text-xs">
                        {sd?._extraction_warning
                          ? `Some details may be missing: ${sd._extraction_warning}`
                          : "These details were extracted automatically. Please review them above, then confirm they're correct."}
                      </p>
                      <button
                        onClick={handleConfirm}
                        disabled={confirmingDetails}
                        className="text-xs font-semibold text-brand-purple mt-2 hover:underline disabled:opacity-50"
                      >
                        {confirmingDetails ? 'Confirming...' : 'Confirm these details are correct →'}
                      </button>
                    </div>
                  );
                })()}

                <div className="mt-5 pt-5 border-t border-border">
                  {!confirmingDelete ? (
                    <button
                      onClick={() => setConfirmingDelete(true)}
                      className="flex items-center gap-1.5 text-xs font-medium text-danger hover:text-danger/80"
                    >
                      <Trash2 size={13} /> Remove this policy
                    </button>
                  ) : (
                    <div className="bg-danger-bg rounded-lg p-3">
                      <p className="text-xs text-danger font-medium mb-2">
                        Remove "{activePolicy.insurer || activePolicy.policy_number}" permanently? This can't be undone.
                      </p>
                      <div className="flex gap-2">
                        <Button variant="danger" onClick={handleDeletePolicy} disabled={deleting}>
                          <Trash2 size={13} /> {deleting ? 'Removing...' : 'Yes, remove it'}
                        </Button>
                        <Button variant="ghost" onClick={() => setConfirmingDelete(false)} disabled={deleting}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </Card>

              <Card className="p-5 lg:col-span-1 bg-gradient-to-br from-brand-lavender to-white">
                <p className="text-sm font-semibold text-ink-900 flex items-center gap-2">
                  <Sparkles size={15} className="text-brand-purple" /> AI Policy Insights
                </p>
                <p className="text-xs text-ink-500 mt-2">
                  Room eligibility: {activePolicy.room_rent_limit || 'not extracted yet'}
                </p>
                <p className="text-xs text-ink-500 mt-1">
                  Co-payment: {activePolicy.co_payment_percent ? `${activePolicy.co_payment_percent}%` : 'not extracted yet'}
                </p>
              </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="p-5">
                <p className="text-sm font-semibold text-ink-900 flex items-center gap-2 mb-3">
                  <XCircle size={15} className="text-danger" /> Exclusions
                </p>
                {activePolicy.exclusions.length === 0 ? (
                  <p className="text-xs text-ink-500">None extracted yet.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {activePolicy.exclusions.map((ex) => (
                      <li key={ex.id} className="text-xs text-ink-700">• {ex.description}</li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card className="p-5">
                <p className="text-sm font-semibold text-ink-900 flex items-center gap-2 mb-3">
                  <Clock size={15} className="text-warning" /> Waiting Periods
                </p>
                {activePolicy.waiting_periods.length === 0 ? (
                  <p className="text-xs text-ink-500">None extracted yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {activePolicy.waiting_periods.map((wp) => (
                      <li key={wp.id} className="text-xs text-ink-700">
                        <span className="font-medium capitalize">{wp.condition}</span> — {wp.months} months
                        {wp.waiting_until && (
                          <span className="block text-ink-500 mt-0.5">Covered from {wp.waiting_until}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card className="p-5">
                <p className="text-sm font-semibold text-ink-900 flex items-center gap-2 mb-3">
                  <Layers size={15} className="text-info" /> Sub-Limits
                </p>
                {activePolicy.sub_limits.length === 0 ? (
                  <p className="text-xs text-ink-500">None extracted yet.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {activePolicy.sub_limits.map((sl) => (
                      <li key={sl.id} className="text-xs text-ink-700">
                        <span className="font-medium">{sl.category}:</span> {sl.limit_text}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="lg:col-span-2 flex flex-col">
                <CardHeader title="Insurance Assistant" subtitle="Ask any question about your policy" />
                <div className="flex-1 px-5 py-4 space-y-4 max-h-96 overflow-y-auto">
                  {chat.length === 0 && (
                    <p className="text-sm text-ink-500">Ask something like "Is cataract surgery covered?"</p>
                  )}
                  {chat.map((m) =>
                    m.role === 'user' ? (
                      <div key={m.id} className="flex justify-end">
                        <div className="bg-brand-purple text-white text-sm rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-[80%]">
                          {m.content}
                        </div>
                      </div>
                    ) : (
                      <div key={m.id} className="flex justify-start">
                        <div className="bg-surface rounded-2xl rounded-tl-sm px-4 py-3 max-w-[85%] text-ink-900">
                          <AIMarkdown content={m.content} />
                        </div>
                      </div>
                    )
                  )}
                  {chatLoading && <p className="text-xs text-ink-300">Thinking...</p>}
                </div>
                <div className="p-4 border-t border-border flex items-center gap-2">
                  <input
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
                    placeholder="Ask anything about your policy..."
                    className="flex-1 text-sm px-3.5 py-2.5 rounded-lg border border-border outline-none focus:ring-2 focus:ring-brand-purple/30"
                  />
                  <button
                    onClick={handleAsk}
                    disabled={chatLoading || !question.trim()}
                    className="w-10 h-10 rounded-lg bg-brand-purple text-white flex items-center justify-center shrink-0 disabled:opacity-50"
                  >
                    <Send size={16} />
                  </button>
                </div>
              </Card>

              <Card className="p-5">
                <p className="text-sm font-semibold text-ink-900 flex items-center gap-2 mb-4">
                  <Calculator size={15} className="text-brand-purple" /> Claim Estimator
                </p>
                <input
                  value={claimCategory}
                  onChange={(e) => setClaimCategory(e.target.value)}
                  placeholder="Claim category (e.g. heart surgery)"
                  className="w-full text-sm px-3 py-2 rounded-lg border border-border outline-none mb-2"
                />
                <input
                  value={claimBill}
                  onChange={(e) => setClaimBill(e.target.value)}
                  placeholder="Estimated bill (₹)"
                  type="number"
                  className="w-full text-sm px-3 py-2 rounded-lg border border-border outline-none mb-3"
                />
                <Button variant="secondary" className="w-full" onClick={handleEstimate} disabled={estimating}>
                  {estimating ? 'Calculating...' : 'Calculate'}
                </Button>

                {estimate && (
                  <div className="mt-4 pt-4 border-t border-border space-y-2">
                    <Badge tone={estimate.eligible ? 'success' : 'danger'}>
                      {estimate.eligible ? 'Eligible' : 'Not eligible'}
                    </Badge>
                    {estimate.eligible && (
                      <>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-ink-500">Insurer Share</span>
                          <span className="text-sm font-semibold text-success">
                            ₹{Number(estimate.estimated_insurer_share).toLocaleString('en-IN')}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-ink-500">Your Out of Pocket</span>
                          <span className="text-sm font-semibold text-danger">
                            ₹{Number(estimate.estimated_out_of_pocket).toLocaleString('en-IN')}
                          </span>
                        </div>
                      </>
                    )}
                    <p className="text-[11px] text-ink-500 leading-relaxed pt-2">{estimate.reasoning_summary}</p>
                  </div>
                )}
              </Card>
            </div>
          </>
        )}
      </main>
    </>
  );
}
