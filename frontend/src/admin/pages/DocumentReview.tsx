import { useEffect, useState } from 'react';
import { FileText, Check } from 'lucide-react';
import Topbar from '../components/Topbar';
import { Card, Badge, Button, EmptyState } from '../components/ui';
import { adminApi } from '../lib/api';

type Doc = {
  id: string;
  title: string;
  category: string;
  status: string;
  structured_data: Record<string, unknown>;
};

export default function DocumentReview() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [saving, setSaving] = useState(false);

  function load() {
    adminApi.documents('needs_review').then((r) => setDocs(r.data.results ?? r.data));
  }

  useEffect(load, []);

  function openDoc(d: Doc) {
    setOpenId(d.id);
    setEditText(JSON.stringify(d.structured_data || {}, null, 2));
  }

  async function handleApprove() {
    if (!openId) return;
    setSaving(true);
    try {
      const parsed = JSON.parse(editText);
      await adminApi.approveDocument(openId, parsed);
      setOpenId(null);
      load();
    } catch {
      alert('Invalid JSON — fix it before approving.');
    } finally {
      setSaving(false);
    }
  }

  const openDocData = docs.find((d) => d.id === openId);

  return (
    <>
      <Topbar title="Document Review" subtitle="Documents flagged for manual review before they reach the patient" />
      <main className="p-4 sm:p-6 lg:p-8">
        {docs.length === 0 ? (
          <Card>
            <EmptyState icon={<FileText size={22} />} title="Queue is clear" note="No documents currently need review." />
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-3">
              {docs.map((d) => (
                <button key={d.id} onClick={() => openDoc(d)} className="w-full text-left">
                  <Card interactive
                    className={`p-4 hover:border-accent transition-colors ${openId === d.id ? 'border-accent' : ''}`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-ink-900">{d.title}</p>
                        <Badge tone="neutral">{d.category}</Badge>
                      </div>
                      <Badge tone="warning">needs review</Badge>
                    </div>
                  </Card>
                </button>
              ))}
            </div>

            {openDocData && (
              <Card className="p-5 h-fit sticky top-24">
                <p className="text-sm font-semibold text-ink-900 mb-1">{openDocData.title}</p>
                <p className="text-xs text-ink-500 mb-3">Edit the extracted data, then approve.</p>
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  rows={12}
                  className="w-full text-xs font-mono bg-surface rounded-lg p-3 outline-none border border-border focus:ring-2 focus:ring-accent/30"
                />
                <Button className="w-full mt-3" onClick={handleApprove} disabled={saving}>
                  <Check size={15} /> {saving ? 'Approving...' : 'Approve & Mark Processed'}
                </Button>
              </Card>
            )}
          </div>
        )}
      </main>
    </>
  );
}
