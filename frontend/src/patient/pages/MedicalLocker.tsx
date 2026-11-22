import { useEffect, useRef, useState } from 'react';
import { Search, UploadCloud, FileText, ShieldCheck, FolderHeart, X } from 'lucide-react';
import Topbar from '../components/Topbar';
import { Card, Badge, Button, EmptyState } from '../components/ui';
import ECGProgressBar from '../components/ECGProgressBar';
import DocumentDetailModal from '../components/DocumentDetailModal';
import ReviewDetailsForm, { type ReviewValues } from '../components/ReviewDetailsForm';
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
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadComplete, setUploadComplete] = useState(false);
  const [uploadNotice, setUploadNotice] = useState<{ tone: 'info' | 'error'; text: string } | null>(null);
  const [openDocId, setOpenDocId] = useState<string | null>(null);
  // Picked but not sent. The review form opens first, so the details the
  // person enters are saved and confirmed straight after the upload rather
  // than being corrected on a second visit they could easily skip.
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingValues, setPendingValues] = useState<ReviewValues | null>(null);
  const [pendingError, setPendingError] = useState('');
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

  /**
   * Picking a file only opens the review form. Clearing the input here (not
   * after the upload) matters: without it, cancelling and choosing the same
   * file again fires no change event.
   */
  function handleFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!file || !activeProfile) return;
    setUploadNotice(null);
    setPendingError('');
    setPendingValues({ title: file.name, category: tab || 'other', date: '', hospital: '', doctor: '' });
    setPendingFile(file);
  }

  /**
   * Upload, then save the entered details and confirm — in that order, so
   * extraction runs before the person's values are written and cannot
   * overwrite them. Confirming here is what keeps the document out of
   * "needs review": they have just reviewed it.
   */
  async function uploadPending(file: File, values: ReviewValues) {
    if (!activeProfile) return;
    setPendingError('');
    setUploading(true);
    setUploadProgress(0);
    setUploadComplete(false);
    setUploadNotice(null);
    try {
      const { data } = await documentsApi.upload(activeProfile.id, file, values.category, (pct) => setUploadProgress(pct / 100));
      setUploadComplete(true);
      if (data?.id && data?.upload?.outcome !== 'exact_duplicate') {
        await documentsApi.update(data.id, {
          title: values.title,
          category: values.category,
          document_date: values.date || null,
          hospital_name: values.hospital,
          doctor_name: values.doctor,
        });
        await documentsApi.confirm(data.id);
      }
      setPendingFile(null);
      setPendingValues(null);
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
    } catch {
      // Uploads wait for processing, so a slow connection can time out even
      // though the file arrived. Re-uploading is safe now — the same file
      // is recognised and not added twice.
      // Kept open with every field as typed: a failed upload must not cost
      // someone the details they just entered.
      setPendingError(
        "The upload didn't finish. Check your connection and try again — if it did arrive, it won't be added twice."
      );
      await loadDocuments().catch(() => undefined);
    } finally {
      setUploading(false);
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
              <UploadCloud size={16} />{' '}
              {uploading ? 'Uploading...' : <><span className="sm:hidden">Upload</span><span className="hidden sm:inline">Upload Document</span></>}
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

        {uploading && (
          <Card className="mb-5">
            <ECGProgressBar progress={uploadProgress} isComplete={uploadComplete} />
            <p className="text-center text-xs text-ink-500">
              {uploadComplete ? 'Upload complete — processing your document…' : 'Uploading your document…'}
            </p>
          </Card>
        )}

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

      {/* The same review form the saved-document view shows, opened before
          the file is sent. Same shell markup as DocumentDetailModal so this
          is the existing screen, not a second kind of dialog. */}
      {pendingFile && pendingValues && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={uploading ? undefined : () => setPendingFile(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={pendingFile.name}
            className="bg-card rounded-xl2 shadow-card max-w-lg w-full max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-card">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 shrink-0 rounded-lg bg-accent-soft text-accent-ink flex items-center justify-center">
                  <FileText size={16} />
                </div>
                <p className="text-sm font-semibold text-ink-900 truncate">{pendingFile.name}</p>
              </div>
              <button
                onClick={() => setPendingFile(null)}
                disabled={uploading}
                className="text-ink-500 hover:text-ink-900 disabled:opacity-50"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5">
              <ReviewDetailsForm
                values={pendingValues}
                onChange={(patch) => setPendingValues({ ...pendingValues, ...patch })}
                intro="Check these details before uploading. Anything you leave blank we'll try to read from the document."
                error={pendingError}
                busy={uploading}
                busyLabel="Uploading..."
                onConfirm={() => uploadPending(pendingFile, pendingValues)}
              >
                {uploading && (
                  <div className="mt-3">
                    <ECGProgressBar progress={uploadProgress} isComplete={uploadComplete} />
                  </div>
                )}
              </ReviewDetailsForm>
            </div>
          </div>
        </div>
      )}

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
