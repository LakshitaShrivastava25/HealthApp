import { useEffect, useState } from 'react';
import { X, FileText, Pencil, Check, Trash2, RefreshCw, ClipboardCheck } from 'lucide-react';
import { Badge, Button } from './ui';
import { documentsApi } from '../lib/api';
import {
  describeExtraction,
  hasExtractedContent,
  humanizeKey,
  INTERNAL_KEYS,
} from '@shared/components/extractionState';
import { todayIso } from '@shared/dates';

type DocumentDetail = {
  id: string;
  title: string;
  category: string;
  status: string;
  document_date: string | null;
  hospital_name: string;
  doctor_name: string;
  structured_data: Record<string, unknown>;
  file: string;
  original_filename?: string;
  duplicate_of?: string | null;
  duplicate_kind?: string;
  possible_duplicate?: {
    id: string;
    title: string;
    uploaded_at: string;
    score: number | null;
    shared_pages: number[];
  } | null;
  copies?: { id: string; title: string; original_filename: string; uploaded_at: string; duplicate_kind: string }[];
  upload_history?: { original_filename: string; uploaded_at: string; outcome: string }[];
};

const DUPLICATE_KIND_LABEL: Record<string, string> = {
  exact: 'the exact same file',
  same_content: 'the same text on every page',
  manual: 'marked by you',
};

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** The real Document.Category values, same set the Timeline keys on. */
const CATEGORIES = [
  { value: 'prescription', label: 'Prescription' },
  { value: 'report', label: 'Report' },
  { value: 'scan', label: 'Scan' },
  { value: 'discharge', label: 'Discharge Summary' },
  { value: 'other', label: 'Other' },
];

const statusTone: Record<string, 'success' | 'warning' | 'neutral' | 'info' | 'danger'> = {
  processed: 'success',
  needs_review: 'warning',
  processing: 'info',
  failed: 'danger',
};


/**
 * What the "Correct a field" editor is seeded with.
 *
 * Internal bookkeeping keys are stripped: a patient editing their lab values
 * should not be shown `_extraction_failed` or a note naming a server
 * environment variable. Dropping them here is safe because the correct
 * endpoint MERGES ({**existing, **submitted}) rather than replacing, so the
 * flags survive on the record even though they are not in the textarea.
 */
function editableJson(data: unknown): string {
  const clean = Object.fromEntries(
    Object.entries((data || {}) as Record<string, unknown>).filter(([k]) => !INTERNAL_KEYS.includes(k))
  );
  return JSON.stringify(clean, null, 2);
}

export default function DocumentDetailModal({
  documentId,
  onClose,
  onUpdated,
  onDeleted,
}: {
  documentId: string;
  onClose: () => void;
  onUpdated?: () => void;
  onDeleted?: () => void;
}) {
  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [saveError, setSaveError] = useState('');
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState('');
  const [saving, setSaving] = useState(false);

  // review-screen state
  const [rTitle, setRTitle] = useState('');
  const [rCategory, setRCategory] = useState('other');
  const [rDate, setRDate] = useState('');
  const [rHospital, setRHospital] = useState('');
  const [rDoctor, setRDoctor] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState('');

  const [duplicateBusy, setDuplicateBusy] = useState(false);
  const [duplicateError, setDuplicateError] = useState('');
  const [viewingId, setViewingId] = useState(documentId);

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  function load() {
    setLoading(true);
    documentsApi
      .get(viewingId)
      .then((r) => {
        setDoc(r.data);
        setEditText(editableJson(r.data.structured_data));
        hydrateReview(r.data);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    setViewingId(documentId);
  }, [documentId]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewingId]);

  /** Confirms or rejects a duplicate link; medicines and timeline follow server-side. */
  async function handleDuplicate(run: () => Promise<{ data: DocumentDetail }>) {
    setDuplicateError('');
    setDuplicateBusy(true);
    try {
      const { data } = await run();
      setDoc(data);
      onUpdated?.();
    } catch {
      setDuplicateError('Could not save that. Please try again.');
    } finally {
      setDuplicateBusy(false);
    }
  }

  async function handleSaveCorrection() {
    setSaveError('');
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(editText);
    } catch {
      setSaveError('That\'s not valid JSON — check for a missing comma or bracket.');
      return;
    }
    setSaving(true);
    try {
      await documentsApi.correct(viewingId, parsed);
      setEditing(false);
      load();
      onUpdated?.();
    } catch {
      setSaveError('Could not save the correction. Is the backend running?');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleteError('');
    setDeleting(true);
    try {
      await documentsApi.delete(viewingId);
      onDeleted?.();
      onClose();
    } catch {
      setDeleteError('Could not delete this document. Is the backend running?');
      setDeleting(false);
    }
  }

  /**
   * Pre-fills the review form from the saved record, falling back to the
   * AI's suggestion in structured_data where the real column is still blank.
   *
   * That fallback matters because of the blank-only overwrite rule: upload
   * sends `title: file.name`, so title is never blank and the AI's nicer
   * title is deliberately NOT written to the column. Surfacing it here lets
   * the person accept it without the AI having overridden their input.
   */
  function hydrateReview(d: DocumentDetail) {
    const sd = (d.structured_data || {}) as Record<string, unknown>;
    const fromAi = (k: string) => (typeof sd[k] === 'string' ? (sd[k] as string) : '');
    setRTitle(d.title || fromAi('title'));
    setRCategory(d.category || fromAi('category') || 'other');
    // Never seed the picker with a future date. The column can no longer
    // hold one, but structured_data still carries whatever extraction read,
    // and prefilling that would leave the field showing a value its own max
    // forbids and the server rejects — a dead end the person cannot explain.
    const suggestedDate = d.document_date || fromAi('document_date') || '';
    setRDate(suggestedDate && suggestedDate > todayIso() ? '' : suggestedDate);
    setRHospital(d.hospital_name || fromAi('hospital_name'));
    setRDoctor(d.doctor_name || fromAi('doctor_name'));
  }

  /** Save any edits, then confirm — the same two-step the insurance flow uses. */
  async function handleConfirm() {
    if (!doc) return;
    setConfirmError('');
    setConfirming(true);
    try {
      await documentsApi.update(doc.id, {
        title: rTitle,
        category: rCategory,
        document_date: rDate || null,
        hospital_name: rHospital,
        doctor_name: rDoctor,
      });
      const { data } = await documentsApi.confirm(doc.id);
      setDoc(data);
      hydrateReview(data);
      onUpdated?.();
    } catch {
      setConfirmError('Could not save your review. Please try again.');
    } finally {
      setConfirming(false);
    }
  }

  async function handleRetry() {
    setRetryError('');
    setRetrying(true);
    try {
      const { data } = await documentsApi.retryProcessing(viewingId);
      setDoc(data);
      setEditText(editableJson(data.structured_data));
      onUpdated?.();
    } catch {
      setRetryError('Could not process it this time either. Please try again shortly.');
    } finally {
      setRetrying(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-card rounded-xl2 shadow-card max-w-lg w-full max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-card">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-accent-soft text-accent-ink flex items-center justify-center">
              <FileText size={16} />
            </div>
            <p className="text-sm font-semibold text-ink-900">{doc?.title || 'Loading...'}</p>
          </div>
          <button onClick={onClose} className="text-ink-500 hover:text-ink-900">
            <X size={18} />
          </button>
        </div>

        <div className="p-5">
          {loading && <p className="text-sm text-ink-500">Loading document...</p>}

          {doc && (
            <>
              <div className="flex items-center gap-2 mb-4">
                <Badge tone={statusTone[doc.status] || 'neutral'}>{doc.status.replace('_', ' ')}</Badge>
                <Badge tone="neutral">{doc.category}</Badge>
              </div>

              {/* DUPLICATES — a copy is kept for traceability but adds
                  nothing to the timeline or medicines; an unverified match
                  is only a question, never acted on without the person. */}
              {doc.duplicate_of && (
                <div className="mb-4 rounded-xl border border-info/30 bg-info-bg/60 p-4 text-xs text-ink-700">
                  <p className="font-semibold text-ink-900 text-sm">This is a copy of another document</p>
                  <p className="mt-1">
                    Matched by {DUPLICATE_KIND_LABEL[doc.duplicate_kind || ''] ?? 'content'}. It is kept, but its
                    medicines and timeline entries are not counted twice.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button variant="secondary" className="!px-3 !py-1.5 text-xs" onClick={() => setViewingId(doc.duplicate_of as string)}>
                      Open the original
                    </Button>
                    <Button variant="ghost" className="!px-3 !py-1.5 text-xs" disabled={duplicateBusy}
                      onClick={() => handleDuplicate(() => documentsApi.notDuplicate(doc.id))}>
                      It's a different document
                    </Button>
                  </div>
                </div>
              )}

              {!doc.duplicate_of && doc.possible_duplicate && (
                <div className="mb-4 rounded-xl border border-warning/40 bg-warning-bg/40 p-4 text-xs text-ink-700">
                  <p className="font-semibold text-ink-900 text-sm">Possibly the same as “{doc.possible_duplicate.title}”</p>
                  <p className="mt-1">
                    {doc.possible_duplicate.shared_pages.length
                      ? `Page${doc.possible_duplicate.shared_pages.length > 1 ? 's' : ''} ${doc.possible_duplicate.shared_pages.join(', ')} of this file match that document, but it also has content of its own.`
                      : `Its text is ${Math.round((doc.possible_duplicate.score ?? 0) * 100)}% the same as that document.`}{' '}
                    Both are kept until you decide.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button variant="secondary" className="!px-3 !py-1.5 text-xs" disabled={duplicateBusy}
                      onClick={() => handleDuplicate(() => documentsApi.markDuplicate(doc.id, doc.possible_duplicate!.id))}>
                      Yes, it's a duplicate
                    </Button>
                    <Button variant="ghost" className="!px-3 !py-1.5 text-xs" disabled={duplicateBusy}
                      onClick={() => handleDuplicate(() => documentsApi.notDuplicate(doc.id))}>
                      No, keep both
                    </Button>
                    <Button variant="ghost" className="!px-3 !py-1.5 text-xs" onClick={() => setViewingId(doc.possible_duplicate!.id)}>
                      Compare
                    </Button>
                  </div>
                </div>
              )}
              {duplicateError && <p className="-mt-2 mb-4 text-xs text-danger">{duplicateError}</p>}

              {/* REVIEW SCREEN — shown only while the document is still
                  needs_review, i.e. the AI has finished but nobody has
                  agreed with it yet. Same stance as the insurance flow:
                  extraction that plainly worked can still be subtly wrong,
                  so nothing is final until a person says so. */}
              {doc.status === 'needs_review' && (
                <div className="mb-4 rounded-xl border border-warning/40 bg-warning-bg/40 p-4">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-ink-900">
                    <ClipboardCheck size={15} className="text-warning" />
                    Review what we read from this document
                  </p>
                  <p className="mt-1 text-xs text-ink-500">
                    These details were filled in automatically. Correct anything that looks wrong,
                    then confirm.
                  </p>

                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2">
                      <label htmlFor="rv-title" className="mb-1 block text-[11px] font-semibold text-ink-700">Title</label>
                      <input
                        id="rv-title"
                        value={rTitle}
                        onChange={(e) => setRTitle(e.target.value)}
                        className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/30"
                      />
                      {/* Upload stores the filename as the title, and the
                          blank-only rule means the AI's nicer title is never
                          written over it. Rather than lose that suggestion,
                          offer it — the person still chooses. */}
                      {(() => {
                        const suggested = (doc.structured_data as Record<string, unknown>)?.title;
                        return typeof suggested === 'string' && suggested && suggested !== rTitle ? (
                          <button
                            type="button"
                            onClick={() => setRTitle(suggested)}
                            className="mt-1 text-[11px] text-accent-ink hover:underline"
                          >
                            Use suggested title: “{suggested}”
                          </button>
                        ) : null;
                      })()}
                    </div>
                    <div>
                      <label htmlFor="rv-cat" className="mb-1 block text-[11px] font-semibold text-ink-700">Category</label>
                      <select
                        id="rv-cat"
                        value={rCategory}
                        onChange={(e) => setRCategory(e.target.value)}
                        className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/30"
                      >
                        {CATEGORIES.map((c) => (
                          <option key={c.value} value={c.value}>{c.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="rv-date" className="mb-1 block text-[11px] font-semibold text-ink-700">Document date</label>
                      {/* Native date input, matching date_of_birth and
                          premium_due_date elsewhere in this app. Capped at
                          today: a report cannot have been taken in the
                          future. The same rule is enforced server-side,
                          because the picker can be bypassed. */}
                      <input
                        id="rv-date"
                        type="date"
                        max={todayIso()}
                        value={rDate}
                        onChange={(e) => setRDate(e.target.value)}
                        className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/30"
                      />
                    </div>
                    <div>
                      <label htmlFor="rv-hosp" className="mb-1 block text-[11px] font-semibold text-ink-700">Hospital / source</label>
                      <input
                        id="rv-hosp"
                        value={rHospital}
                        onChange={(e) => setRHospital(e.target.value)}
                        className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/30"
                      />
                    </div>
                    <div>
                      <label htmlFor="rv-doc" className="mb-1 block text-[11px] font-semibold text-ink-700">Doctor</label>
                      <input
                        id="rv-doc"
                        value={rDoctor}
                        onChange={(e) => setRDoctor(e.target.value)}
                        className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/30"
                      />
                    </div>
                  </div>

                  {/* Readings the AI pulled out. structured_data is a JSON
                      blob, not columns — key_values is a key inside it — so
                      these are shown for checking and corrected through the
                      existing "Correct a field" editor below. */}
                  {Array.isArray((doc.structured_data as Record<string, unknown>)?.key_values) &&
                    ((doc.structured_data as Record<string, unknown>).key_values as { label: string; value: string }[]).length > 0 && (
                      <div className="mt-3">
                        <p className="mb-1 text-[11px] font-semibold text-ink-700">Readings found</p>
                        <div className="rounded-lg border border-border bg-card divide-y divide-border">
                          {((doc.structured_data as Record<string, unknown>).key_values as { label: string; value: string }[]).map((kv, i) => (
                            <div key={i} className="flex items-center justify-between px-3 py-1.5 text-xs">
                              <span className="text-ink-500">{kv.label}</span>
                              <span className="font-medium text-ink-900">{kv.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                  {confirmError && <p className="mt-2 text-xs text-danger">{confirmError}</p>}

                  <button
                    onClick={handleConfirm}
                    disabled={confirming}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-accent-dark disabled:opacity-60"
                  >
                    <Check size={13} />
                    {confirming ? 'Saving...' : 'Confirm these details are correct'}
                  </button>
                </div>
              )}

              {/* An upload whose AI reading failed keeps the file and says so
                  honestly, rather than silently looking like a normal but
                  empty document. Retry is offered because the usual cause is
                  transient. */}
              {doc.status === 'failed' && (
                <div className="mb-4 rounded-lg border border-border bg-surface p-3">
                  <p className="text-xs text-ink-700">
                    {String(
                      (doc.structured_data as Record<string, unknown>)?.note ??
                        'The file uploaded fine, but automatic reading of it failed.'
                    )}
                  </p>
                  <button
                    onClick={handleRetry}
                    disabled={retrying}
                    className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-accent-ink hover:underline disabled:opacity-60"
                  >
                    <RefreshCw size={12} className={retrying ? 'hn-spin' : ''} />
                    {retrying ? 'Processing…' : 'Retry processing'}
                  </button>
                  {retryError && <p className="mt-1.5 text-xs text-danger">{retryError}</p>}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4 text-sm">
                <div>
                  <p className="text-xs text-ink-500">Date</p>
                  <p className="text-ink-900">{doc.document_date || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-ink-500">Hospital</p>
                  <p className="text-ink-900">{doc.hospital_name || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-ink-500">Doctor</p>
                  <p className="text-ink-900">{doc.doctor_name || '—'}</p>
                </div>
              </div>

              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-ink-700">Extracted data</p>
                {!editing && (
                  <button
                    onClick={() => setEditing(true)}
                    className="flex items-center gap-1 text-xs font-medium text-accent-ink"
                  >
                    <Pencil size={12} /> Correct a field
                  </button>
                )}
              </div>

              {editing ? (
                <>
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    rows={10}
                    className="w-full text-xs font-mono bg-surface rounded-lg p-3 outline-none border border-border focus:ring-2 focus:ring-accent/30"
                  />
                  <p className="text-[11px] text-ink-500 mt-1.5">
                    Edit the JSON directly — e.g. fix a misread medicine name or date, then save.
                  </p>
                  {saveError && <p className="text-xs text-danger mt-2">{saveError}</p>}
                  <div className="flex gap-2 mt-3">
                    <Button onClick={handleSaveCorrection} disabled={saving}>
                      <Check size={14} /> {saving ? 'Saving...' : 'Save correction'}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setEditing(false);
                        setEditText(editableJson(doc.structured_data));
                        setSaveError('');
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </>
              ) : (
                <ExtractedData data={doc.structured_data} />
              )}

              {doc.file && !editing && (
                <a
                  href={doc.file}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block mt-4 text-sm font-medium text-accent-ink"
                >
                  View original file →
                </a>
              )}

              {!editing && ((doc.upload_history?.length ?? 0) > 1 || (doc.copies?.length ?? 0) > 0 || doc.original_filename) && (
                <div className="mt-5 rounded-lg bg-surface px-3 py-2.5 text-xs text-ink-500 space-y-1">
                  {doc.original_filename && <p>Uploaded as <span className="text-ink-700">{doc.original_filename}</span></p>}
                  {(doc.upload_history ?? [])
                    .filter((u) => u.outcome === 'exact_duplicate')
                    .map((u, i) => (
                      <p key={i}>
                        Uploaded again on {shortDate(u.uploaded_at)}
                        {u.original_filename ? <> as <span className="text-ink-700">{u.original_filename}</span></> : null} — same file, not added twice.
                      </p>
                    ))}
                  {(doc.copies ?? []).map((c) => (
                    <p key={c.id}>
                      Copy uploaded on {shortDate(c.uploaded_at)} ({DUPLICATE_KIND_LABEL[c.duplicate_kind] ?? 'duplicate'}){' '}
                      <button onClick={() => setViewingId(c.id)} className="font-medium text-accent-ink hover:underline">
                        Open
                      </button>
                    </p>
                  ))}
                </div>
              )}

              {!editing && (
                <div className="mt-6 pt-4 border-t border-border">
                  {!confirmingDelete ? (
                    <button
                      onClick={() => setConfirmingDelete(true)}
                      className="flex items-center gap-1.5 text-xs font-medium text-danger hover:text-danger/80"
                    >
                      <Trash2 size={13} /> Delete this document
                    </button>
                  ) : (
                    <div className="bg-danger-bg rounded-lg p-3">
                      <p className="text-xs text-danger font-medium mb-2">
                        Delete "{doc.title}" permanently? This can't be undone.
                      </p>
                      {deleteError && <p className="text-xs text-danger mb-2">{deleteError}</p>}
                      <div className="flex gap-2">
                        <Button variant="danger" onClick={handleDelete} disabled={deleting}>
                          <Trash2 size={13} /> {deleting ? 'Deleting...' : 'Yes, delete it'}
                        </Button>
                        <Button variant="ghost" onClick={() => setConfirmingDelete(false)} disabled={deleting}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Renders what the AI read out of a document, in plain language.
 *
 * Previously this section printed JSON.stringify(structured_data) verbatim,
 * which meant a patient could see internal flags (`_extraction_failed`) and
 * the literal name of a server environment variable. Neither belongs on a
 * patient's screen; both are still stored and still visible to staff.
 */
function ExtractedData({ data }: { data: Record<string, unknown> }) {
  const state = describeExtraction(data);

  if (state.kind === 'failed' || state.kind === 'pending') {
    return (
      <div className="rounded-lg bg-surface px-3 py-2.5">
        <p className="text-sm text-ink-700">{state.message}</p>
      </div>
    );
  }

  if (!hasExtractedContent(data)) {
    return <p className="text-sm text-ink-500">Nothing was read from this file yet.</p>;
  }

  const sd = data as Record<string, unknown>;
  const keyValues = Array.isArray(sd.key_values) ? (sd.key_values as { label: string; value: string }[]) : [];
  const medicines = Array.isArray(sd.medicines)
    ? (sd.medicines as { name?: string; dosage?: string; frequency?: string; instructions?: string }[])
    : [];

  // Anything not given its own treatment below, rendered as a simple pair.
  const SPECIAL = ['key_values', 'medicines', 'summary', 'diagnosis', 'tests'];
  const simple = Object.entries(sd).filter(
    ([k, v]) =>
      !INTERNAL_KEYS.includes(k) &&
      !SPECIAL.includes(k) &&
      v !== null &&
      v !== undefined &&
      v !== '' &&
      !(Array.isArray(v) && v.length === 0)
  );

  const list = (key: string) => (Array.isArray(sd[key]) ? (sd[key] as unknown[]).map(String).filter(Boolean) : []);
  const diagnosis = list('diagnosis');
  const tests = list('tests');

  return (
    <div className="space-y-3">
      {state.kind === 'warning' && (
        <p className="rounded-lg bg-warning-bg px-3 py-2 text-xs text-warning">{state.message}</p>
      )}

      {typeof sd.summary === 'string' && sd.summary && (
        <p className="text-sm leading-relaxed text-ink-700">{sd.summary}</p>
      )}

      {keyValues.length > 0 && (
        <div className="rounded-lg border border-border divide-y divide-border">
          {keyValues.map((kv, i) => (
            <div key={i} className="flex items-center justify-between gap-3 px-3 py-1.5">
              <span className="text-xs text-ink-500">{kv.label}</span>
              <span className="text-xs font-medium text-ink-900">{kv.value}</span>
            </div>
          ))}
        </div>
      )}

      {medicines.length > 0 && (
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-300">Medicines</p>
          <div className="rounded-lg border border-border divide-y divide-border">
            {medicines.map((m, i) => (
              <div key={i} className="px-3 py-1.5">
                <p className="text-xs font-medium text-ink-900">{m.name}</p>
                <p className="text-[11px] text-ink-500">
                  {[m.dosage, m.frequency, m.instructions].filter(Boolean).join(' · ')}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {[
        ['Diagnosis', diagnosis],
        ['Tests', tests],
      ].map(([label, items]) =>
        (items as string[]).length > 0 ? (
          <div key={label as string}>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-300">{label as string}</p>
            <ul className="list-inside list-disc space-y-0.5 text-xs text-ink-700">
              {(items as string[]).map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          </div>
        ) : null
      )}

      {simple.length > 0 && (
        <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
          {simple.map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-3">
              <span className="text-[11px] text-ink-500">{humanizeKey(k)}</span>
              <span className="text-xs text-ink-900">{String(v)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
