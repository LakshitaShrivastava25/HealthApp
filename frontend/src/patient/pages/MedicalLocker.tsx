import { useEffect, useRef, useState } from 'react';
import { Search, UploadCloud, FileText, ShieldCheck, FolderHeart } from 'lucide-react';
import Topbar from '../components/Topbar';
import { Card, Badge, Button, EmptyState } from '../components/ui';
import DocumentDetailModal from '../components/DocumentDetailModal';
import { useAuth } from '../context/AuthContext';
import { documentsApi } from '../lib/api';
import { useCachedState } from '@shared/hooks/useCachedState';
import PageFallback from '@shared/components/PageFallback';
import { refreshNotificationsSoon } from '../hooks/useNotifications';

const tabs = [
  { label: 'All', value: '' },
  { label: 'Reports', value: 'report' },
  { label: 'Prescriptions', value: 'prescription' },
  { label: 'Scans', value: 'scan' },
  { label: 'Discharge', value: 'discharge' },
  // Uploads from "All" are filed as `other`; without this tab they could
  // never be filtered to. Matches the mobile app's locker.
  { label: 'Other', value: 'other' },
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
  copies?: { id: string }[];
  possible_duplicate?: { id: string; title: string } | null;
};

export default function MedicalLocker() {
  const { activeProfile } = useAuth();
  const [tab, setTab] = useState('');
  const [query, setQuery] = useState('');
  const profileId = activeProfile?.id ?? null;
  // Remembered per profile and tab: coming back shows the list at once while
  // it refreshes, instead of "No documents yet" until the request returns.
  const [documents, setDocuments, loaded] = useCachedState<Doc[]>(
    profileId ? `locker:${profileId}:${tab}` : null,
    []
  );
  const [loadError, setLoadError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadNotice, setUploadNotice] = useState<{ tone: 'info' | 'error'; text: string } | null>(null);
  const [openDocId, setOpenDocId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function loadDocuments() {
    if (!profileId) return;
    try {
      const { data } = await documentsApi.list(profileId, tab || undefined);
      setDocuments(data.results ?? data);
      setLoadError('');
    } catch {
      setLoadError("Couldn't load your documents. Check your connection and try again.");
    }
  }

  useEffect(() => {
    loadDocuments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, tab]);

  function documentsChanged() {
    refreshNotificationsSoon();
    return loadDocuments();
  }

  async function handleFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !activeProfile) return;
    setUploading(true);
    setUploadNotice(null);
    try {
      const { data } = await documentsApi.upload(activeProfile.id, file, tab || 'other');
      await documentsChanged();
      if (data?.upload?.outcome === 'exact_duplicate') {
        // The same file (under any name) is already here: nothing was added
        // and nothing was processed again. Show the one that is.
        setUploadNotice({ tone: 'info', text: data.upload.message });
        setOpenDocId(data.id);
        return;
      }
      if (data?.duplicate_of) {
        setUploadNotice({
          tone: 'info',
          text: 'This is a copy of a prescription already in your locker (same text on every page). It was kept with the original and not counted twice.',
        });
      }
      // Open the review screen straight away when the AI produced something
      // to check. Without this the review step exists but is easy to miss —
      // the document would just appear in the list already looking done.
      if (data?.id && data.status === 'needs_review') setOpenDocId(data.id);
    } catch {
      // Uploads wait for processing, so a slow connection can time out even
      // though the file arrived. Re-uploading is safe now — the same file
      // is recognised and not added twice.
      setUploadNotice({
        tone: 'error',
        text: "The upload didn't finish. Check your connection and try again — if it did arrive, it won't be added twice.",
      });
      await loadDocuments().catch(() => undefined);
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
            <Button onClick={() => fileInputRef.current?.click()} disabled={uploading} ariaLabel={uploading ? 'Uploading...' : 'Upload Document'}>
              <UploadCloud size={16} /> <span className="hidden sm:inline">{uploading ? 'Uploading...' : 'Upload Document'}</span>
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

        {uploadNotice && (
          <div
            role={uploadNotice.tone === 'error' ? 'alert' : 'status'}
            className={`mb-5 flex items-start gap-3 rounded-xl2 border px-4 py-3 text-sm ${
              uploadNotice.tone === 'error' ? 'border-danger/30 bg-danger-bg text-danger' : 'border-info/30 bg-info-bg text-ink-700'
            }`}
          >
            <span className="flex-1">{uploadNotice.text}</span>
            <button onClick={() => setUploadNotice(null)} className="text-xs font-medium text-ink-500" aria-label="Dismiss">
              Dismiss
            </button>
          </div>
        )}

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

        {loadError && <p className="mb-4 text-sm text-danger" role="alert">{loadError}</p>}

        {!loaded && !loadError && <PageFallback />}

        {loaded && filtered.length === 0 && (
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
                    {!!d.copies?.length && (
                      <Badge tone="info">+{d.copies.length} cop{d.copies.length === 1 ? 'y' : 'ies'}</Badge>
                    )}
                    {d.possible_duplicate && <Badge tone="warning">possible duplicate</Badge>}
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
          onUpdated={documentsChanged}
          onDeleted={documentsChanged}
        />
      )}
    </>
  );
}
