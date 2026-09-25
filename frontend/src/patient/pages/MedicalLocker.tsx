import { useEffect, useRef, useState } from 'react';
import { Search, UploadCloud, FileText, ShieldCheck, FolderHeart } from 'lucide-react';
import Topbar from '../components/Topbar';
import { Card, Badge, Button, EmptyState } from '../components/ui';
import DocumentDetailModal from '../components/DocumentDetailModal';
import { useAuth } from '../context/AuthContext';
import { documentsApi } from '../lib/api';

const tabs = [
  { label: 'All', value: '' },
  { label: 'Reports', value: 'report' },
  { label: 'Prescriptions', value: 'prescription' },
  { label: 'Scans', value: 'scan' },
  { label: 'Discharge', value: 'discharge' },
];

const docBadgeTone: Record<string, 'info' | 'success' | 'warning' | 'neutral'> = {
  report: 'info',
  prescription: 'success',
  scan: 'warning',
  discharge: 'neutral',
  other: 'neutral',
};

type Doc = {
  id: string;
  title: string;
  category: string;
  status: string;
  document_date: string | null;
  hospital_name: string;
};

export default function MedicalLocker() {
  const { activeProfile } = useAuth();
  const [tab, setTab] = useState('');
  const [query, setQuery] = useState('');
  const [documents, setDocuments] = useState<Doc[]>([]);
  const [uploading, setUploading] = useState(false);
  const [openDocId, setOpenDocId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function loadDocuments() {
    if (!activeProfile) return;
    const { data } = await documentsApi.list(activeProfile.id, tab || undefined);
    setDocuments(data.results ?? data);
  }

  useEffect(() => {
    loadDocuments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProfile, tab]);

  async function handleFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !activeProfile) return;
    setUploading(true);
    try {
      const { data } = await documentsApi.upload(activeProfile.id, file, tab || 'other');
      await loadDocuments();
      // Open the review screen straight away when the AI produced something
      // to check. Without this the review step exists but is easy to miss —
      // the document would just appear in the list already looking done.
      if (data?.id && data.status === 'needs_review') setOpenDocId(data.id);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  const filtered = documents.filter((d) => d.title.toLowerCase().includes(query.toLowerCase()));

  return (
    <>
      <Topbar
        title="Medical Locker"
        subtitle="All your medical documents in one place."
        action={
          <>
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChosen} accept=".pdf,.jpg,.jpeg,.png" />
            <Button onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              <UploadCloud size={16} /> {uploading ? 'Uploading...' : 'Upload Document'}
            </Button>
          </>
        }
      />

      <main className="p-4 sm:p-6 lg:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <div className="relative w-full sm:w-80">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-300" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search documents..."
              className="w-full pl-9 pr-3 py-2.5 text-sm rounded-lg border border-border bg-card outline-none focus:ring-2 focus:ring-accent/30"
            />
          </div>
        </div>

        <div className="flex gap-1.5 mb-5 flex-wrap">
          {tabs.map((t) => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
                tab === t.value ? 'bg-accent text-white' : 'bg-card border border-border text-ink-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {filtered.length === 0 && (
          <Card>
            <EmptyState
              icon={<FolderHeart size={22} />}
              title="No documents yet"
              note="Upload a prescription, report or scan and it will be read automatically."
            />
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map((d) => (
            <button key={d.id} onClick={() => setOpenDocId(d.id)} className="text-left">
              <Card interactive className="p-4 flex items-center gap-4 hover:border-accent transition-colors">
                <div className="w-11 h-11 rounded-lg bg-accent-soft text-accent-ink flex items-center justify-center shrink-0">
                  <FileText size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-ink-900 truncate">{d.title}</p>
                  <p className="text-xs text-ink-500 mt-0.5">{d.document_date || ''} {d.hospital_name}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge tone={docBadgeTone[d.category] || 'neutral'}>{d.category}</Badge>
                    <Badge tone={d.status === 'processed' ? 'success' : d.status === 'needs_review' ? 'warning' : 'neutral'}>
                      {d.status.replace('_', ' ')}
                    </Badge>
                  </div>
                </div>
              </Card>
            </button>
          ))}
        </div>

        <div className="mt-5 flex items-center gap-3 bg-accent-soft/50 border border-brand-lavender rounded-xl2 p-4">
          <ShieldCheck size={20} className="text-accent-ink shrink-0" />
          <div>
            <p className="text-sm font-semibold text-ink-900">All documents are encrypted and fully secure.</p>
            <p className="text-xs text-ink-500 mt-0.5">Your data is only visible to you and authorized users.</p>
          </div>
        </div>
      </main>

      {openDocId && (
        <DocumentDetailModal
          documentId={openDocId}
          onClose={() => setOpenDocId(null)}
          onUpdated={loadDocuments}
          onDeleted={loadDocuments}
        />
      )}
    </>
  );
}
