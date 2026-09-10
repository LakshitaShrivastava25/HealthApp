import { useEffect, useState } from 'react';
import { X, FileText, Pencil, Check, Trash2 } from 'lucide-react';
import { Badge, Button } from './ui';
import { documentsApi } from '../lib/api';

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
};

const statusTone: Record<string, 'success' | 'warning' | 'neutral' | 'info'> = {
  processed: 'success',
  needs_review: 'warning',
  processing: 'info',
  failed: 'neutral',
};

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
  const [saving, setSaving] = useState(false);

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  function load() {
    setLoading(true);
    documentsApi
      .get(documentId)
      .then((r) => {
        setDoc(r.data);
        setEditText(JSON.stringify(r.data.structured_data || {}, null, 2));
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId]);

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
      await documentsApi.correct(documentId, parsed);
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
      await documentsApi.delete(documentId);
      onDeleted?.();
      onClose();
    } catch {
      setDeleteError('Could not delete this document. Is the backend running?');
      setDeleting(false);
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
            <div className="w-9 h-9 rounded-lg bg-brand-lavender text-brand-purple flex items-center justify-center">
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

              <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
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
                    className="flex items-center gap-1 text-xs font-medium text-brand-purple"
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
                    className="w-full text-xs font-mono bg-surface rounded-lg p-3 outline-none border border-border focus:ring-2 focus:ring-brand-purple/30"
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
                        setEditText(JSON.stringify(doc.structured_data || {}, null, 2));
                        setSaveError('');
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </>
              ) : Object.keys(doc.structured_data || {}).length === 0 ? (
                <p className="text-sm text-ink-500">No structured data yet.</p>
              ) : (
                <pre className="text-xs bg-surface rounded-lg p-3 overflow-x-auto whitespace-pre-wrap text-ink-700">
                  {JSON.stringify(doc.structured_data, null, 2)}
                </pre>
              )}

              {doc.file && !editing && (
                <a
                  href={doc.file}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block mt-4 text-sm font-medium text-brand-purple"
                >
                  View original file →
                </a>
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
