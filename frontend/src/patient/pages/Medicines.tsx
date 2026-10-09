import { useEffect, useState } from 'react';
import { Pill, Clock3, Check, Plus, X, Trash2, History, ChevronDown, TriangleAlert, GitMerge, FileText } from 'lucide-react';
import Topbar from '../components/Topbar';
import { Card, Badge, Button, EmptyState } from '../components/ui';
import DocumentDetailModal from '../components/DocumentDetailModal';
import { useAuth } from '../context/AuthContext';
import { medicinesApi } from '../lib/api';
import { useCachedState } from '@shared/hooks/useCachedState';
import PageFallback from '@shared/components/PageFallback';

type Reminder = { id: string; time_of_day: string; days_of_week: string };
type HistoryEntry = {
  date: string | null;
  doctor_name: string;
  hospital_name: string;
  name: string;
  strength: string;
  dosage: string;
  frequency: string;
  instructions: string;
  duration: string;
  action: string;
  action_text: string;
  end_date: string | null;
  source_deleted: boolean;
  documents: { id: string; title: string }[];
};
type Suggestion = { id: string; name: string; reason: string };
type Medication = {
  id: string;
  name: string;
  dosage: string;
  instructions: string;
  frequency: string;
  is_active: boolean;
  end_date: string | null;
  reminders: Reminder[];
  generic_name: string;
  brand_names: string[];
  status: string;
  status_reason: string;
  first_prescribed_on: string | null;
  last_prescribed_on: string | null;
  prescription_count: number;
  newer_prescriptions_without: number;
  possible_duplicates: Suggestion[];
  origin: string;
  history: HistoryEntry[];
};
type DoseLog = { id: string; reminder: string; status: string; scheduled_for: string };

const STATUS: Record<string, { label: string; tone: 'success' | 'warning' | 'info' | 'neutral' }> = {
  active: { label: 'Active', tone: 'success' },
  continued: { label: 'Continued', tone: 'success' },
  modified: { label: 'Dose changed', tone: 'info' },
  needs_review: { label: 'Needs review', tone: 'warning' },
  discontinued: { label: 'Stopped', tone: 'neutral' },
  completed: { label: 'Course completed', tone: 'neutral' },
  one_time: { label: 'One-time dose', tone: 'neutral' },
};

const ACTION_LABEL: Record<string, string> = {
  start: 'Started',
  continue: 'Continue',
  change: 'Changed',
  stop: 'Stop',
  hold: 'Temporarily withheld',
  one_time: 'One-time',
};

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

/** "2026-06-03" -> "3 Jun 2026", without a timezone shift. */
function formatDate(iso: string | null) {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function doctorLabel(name: string) {
  if (!name) return '';
  return /^dr\b/i.test(name) ? name : `Dr ${name}`;
}

function needsAttention(m: Medication) {
  return m.is_active && (m.status === 'needs_review' || m.newer_prescriptions_without > 0 || m.possible_duplicates.length > 0);
}

export default function Medicines() {
  const { activeProfile } = useAuth();
  const profileId = activeProfile?.id ?? null;
  // Remembered per profile: coming back shows the list at once while it refreshes.
  const [medications, setMedications, loaded] = useCachedState<Medication[]>(
    profileId ? `medicines:${profileId}` : null,
    []
  );
  const [takenReminderIds, setTakenReminderIds] = useState<Set<string>>(new Set());
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');

  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDosage, setNewDosage] = useState('');
  const [newInstructions, setNewInstructions] = useState('');
  const [newFrequency, setNewFrequency] = useState('daily');
  const [newTime, setNewTime] = useState('08:00');
  const [saving, setSaving] = useState(false);

  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);
  const [openDocId, setOpenDocId] = useState<string | null>(null);

  async function loadMedications() {
    if (!profileId) return;
    try {
      // Current and past together: one request, split on the page.
      const { data } = await medicinesApi.list(profileId, 'all');
      setMedications(data.results ?? data);
      setLoadError('');
    } catch {
      setLoadError("Couldn't load your medicines. Please refresh to try again.");
    }
  }

  async function loadTodaysDoseLogs() {
    if (!profileId) return;
    let data;
    try {
      ({ data } = await medicinesApi.listDoseLogs(profileId));
    } catch {
      return;
    }
    const logs: DoseLog[] = data.results ?? data;
    const today = todayISODate();
    const taken = new Set(
      logs.filter((l) => l.status === 'taken' && l.scheduled_for?.slice(0, 10) === today).map((l) => l.reminder)
    );
    setTakenReminderIds(taken);
  }

  useEffect(() => {
    loadMedications();
    loadTodaysDoseLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId]);

  async function markTaken(reminderId: string) {
    await medicinesApi.logDose(reminderId, 'taken', new Date().toISOString());
    setTakenReminderIds((prev) => new Set(prev).add(reminderId));
  }

  async function handleAddMedicine() {
    if (!activeProfile || !newName.trim()) return;
    setSaving(true);
    try {
      // If this medicine is already on the list from a prescription, the
      // backend answers with that one record, so the reminder lands there.
      const { data: medication } = await medicinesApi.create({
        profile: activeProfile.id,
        name: newName,
        dosage: newDosage,
        instructions: newInstructions,
        frequency: newFrequency,
      });
      if (newTime) {
        await medicinesApi.addReminder(medication.id, newTime);
      }
      setNewName('');
      setNewDosage('');
      setNewInstructions('');
      setNewFrequency('daily');
      setNewTime('08:00');
      setShowAddForm(false);
      await loadMedications();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    await medicinesApi.delete(id);
    setConfirmingDeleteId(null);
    await loadMedications();
  }

  /** Runs a change, then reloads the list (statuses are recomputed server-side). */
  async function act(run: () => Promise<unknown>) {
    setActionError('');
    try {
      await run();
      await loadMedications();
    } catch {
      setActionError("That change couldn't be saved. Please try again.");
    }
  }

  const attention = medications.filter(needsAttention);
  const current = medications.filter((m) => m.is_active && !needsAttention(m));
  const past = medications.filter((m) => !m.is_active);

  function renderCard(m: Medication) {
    return (
      <MedicineCard
        key={m.id}
        m={m}
        takenReminderIds={takenReminderIds}
        onMarkTaken={markTaken}
        confirmingDelete={confirmingDeleteId === m.id}
        onAskDelete={() => setConfirmingDeleteId(m.id)}
        onCancelDelete={() => setConfirmingDeleteId(null)}
        onDelete={() => handleDelete(m.id)}
        onSetStatus={(status) => act(() => medicinesApi.setStatus(m.id, status))}
        onMerge={(otherId) => act(() => medicinesApi.merge(m.id, otherId))}
        onKeepSeparate={(otherId) => act(() => medicinesApi.keepSeparate(m.id, otherId))}
        onOpenDocument={setOpenDocId}
      />
    );
  }

  return (
    <>
      <Topbar
        title="Medicines & Reminders"
        subtitle="Every medicine from your prescriptions, listed once, with its history"
        action={
          <Button onClick={() => setShowAddForm((v) => !v)} ariaLabel={showAddForm ? 'Cancel' : 'Add Medicine'}>
            {showAddForm ? <X size={16} /> : <Plus size={16} />} <span className="hidden sm:inline">{showAddForm ? 'Cancel' : 'Add Medicine'}</span>
          </Button>
        }
      />

      <main className="p-4 sm:p-6 lg:p-8">
        {showAddForm && (
          <Card className="p-5 mb-5">
            <p className="text-sm font-semibold text-ink-900 mb-3">Add a medicine manually</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Medicine name (e.g. Paracetamol 650mg)"
                className="text-sm px-3 py-2 rounded-lg border border-border outline-none"
              />
              <input
                value={newDosage}
                onChange={(e) => setNewDosage(e.target.value)}
                placeholder="Dosage (e.g. 1 Tablet)"
                className="text-sm px-3 py-2 rounded-lg border border-border outline-none"
              />
              <input
                value={newInstructions}
                onChange={(e) => setNewInstructions(e.target.value)}
                placeholder="Instructions (e.g. After Food)"
                className="text-sm px-3 py-2 rounded-lg border border-border outline-none"
              />
              <input
                value={newFrequency}
                onChange={(e) => setNewFrequency(e.target.value)}
                placeholder="Frequency (e.g. daily, weekly)"
                className="text-sm px-3 py-2 rounded-lg border border-border outline-none"
              />
              <div>
                <label className="text-xs text-ink-500 block mb-1">Reminder time</label>
                <input
                  type="time"
                  value={newTime}
                  onChange={(e) => setNewTime(e.target.value)}
                  className="text-sm px-3 py-2 rounded-lg border border-border outline-none"
                />
              </div>
            </div>
            <Button onClick={handleAddMedicine} disabled={!newName.trim() || saving}>
              {saving ? 'Saving...' : 'Save Medicine'}
            </Button>
          </Card>
        )}

        {loadError && <p className="mb-4 text-sm text-danger">{loadError}</p>}
        {actionError && <p className="mb-4 text-sm text-danger">{actionError}</p>}

        {!loaded && !loadError && <PageFallback />}

        {loaded && medications.length === 0 && !showAddForm && !loadError && (
          <Card>
            <EmptyState
              icon={<Pill size={22} />}
              title="No medicines yet"
              note="Medicines are added automatically when a prescription is processed."
            />
          </Card>
        )}

        {attention.length > 0 && (
          <section className="mb-6">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-900 mb-1">
              <TriangleAlert size={15} className="text-warning" /> Needs your attention ({attention.length})
            </h2>
            <p className="text-xs text-ink-500 mb-3">
              Prescriptions that disagree, medicines missing from newer prescriptions, or entries that may be the same medicine.
            </p>
            <div className="space-y-3">{attention.map(renderCard)}</div>
          </section>
        )}

        {current.length > 0 && (
          <section className="mb-6">
            <h2 className="text-sm font-semibold text-ink-900 mb-3">Current medicines ({current.length})</h2>
            <div className="space-y-3">{current.map(renderCard)}</div>
          </section>
        )}

        {past.length > 0 && (
          <section>
            <button
              onClick={() => setShowPast((v) => !v)}
              className="flex items-center gap-2 text-sm font-semibold text-ink-700 mb-3"
              aria-expanded={showPast}
            >
              <ChevronDown size={15} className={`transition-transform ${showPast ? '' : '-rotate-90'}`} />
              Past medicines ({past.length})
            </button>
            {showPast && <div className="space-y-3">{past.map(renderCard)}</div>}
          </section>
        )}
      </main>

      {openDocId && (
        <DocumentDetailModal
          documentId={openDocId}
          onClose={() => setOpenDocId(null)}
          onUpdated={loadMedications}
          onDeleted={() => {
            setOpenDocId(null);
            loadMedications();
          }}
        />
      )}
    </>
  );
}

function MedicineCard({
  m,
  takenReminderIds,
  onMarkTaken,
  confirmingDelete,
  onAskDelete,
  onCancelDelete,
  onDelete,
  onSetStatus,
  onMerge,
  onKeepSeparate,
  onOpenDocument,
}: {
  m: Medication;
  takenReminderIds: Set<string>;
  onMarkTaken: (reminderId: string) => void;
  confirmingDelete: boolean;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
  onSetStatus: (status: 'taking' | 'stopped') => void;
  onMerge: (otherId: string) => void;
  onKeepSeparate: (otherId: string) => void;
  onOpenDocument: (id: string) => void;
}) {
  const [showHistory, setShowHistory] = useState(false);
  const status = STATUS[m.status] ?? STATUS.active;
  const showGeneric = m.generic_name && !m.name.toLowerCase().includes(m.generic_name.toLowerCase().split(' + ')[0]);
  const details = [m.dosage, m.instructions].filter(Boolean).join(' · ');

  return (
    <Card className={`p-4 ${m.is_active ? '' : 'opacity-80'}`}>
      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
        <div className="w-11 h-11 rounded-lg bg-accent-soft text-accent-ink flex items-center justify-center shrink-0">
          <Pill size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-ink-900">{m.name}</p>
            <Badge tone={status.tone}>{status.label}</Badge>
          </div>
          {(showGeneric || m.brand_names.length > 0) && (
            <p className="text-xs text-ink-500 mt-0.5">
              {[showGeneric ? m.generic_name : '', m.brand_names.length ? `Brand: ${m.brand_names.join(', ')}` : '']
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
          {details && <p className="text-xs text-ink-500 mt-0.5">{details}</p>}
          {m.frequency && <p className="text-xs text-ink-300 mt-0.5">{m.frequency}</p>}
          {m.status_reason && <p className="text-xs text-ink-700 mt-2 leading-relaxed">{m.status_reason}</p>}
        </div>
        {m.is_active && m.reminders.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {m.reminders.map((r) => {
              const taken = takenReminderIds.has(r.id);
              return (
                <button
                  key={r.id}
                  onClick={() => !taken && onMarkTaken(r.id)}
                  disabled={taken}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    taken ? 'bg-success-bg text-success' : 'bg-warning-bg text-warning hover:opacity-80'
                  }`}
                >
                  {taken ? <Check size={12} /> : <Clock3 size={12} />}
                  <span>{r.time_of_day?.slice(0, 5)}</span>
                  <span>{taken ? 'Taken today' : 'Mark taken'}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {m.is_active && m.newer_prescriptions_without > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-warning-bg/60 px-3 py-2">
          <span className="text-xs text-ink-700 flex-1 min-w-[12rem]">Are you still taking this?</span>
          <Button variant="secondary" className="!px-3 !py-1.5 text-xs" onClick={() => onSetStatus('taking')}>
            Yes, still taking
          </Button>
          <Button variant="ghost" className="!px-3 !py-1.5 text-xs" onClick={() => onSetStatus('stopped')}>
            No, stopped
          </Button>
        </div>
      )}

      {m.possible_duplicates.map((s) => (
        <div key={s.id} className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-info-bg/60 px-3 py-2">
          <GitMerge size={14} className="text-info shrink-0" />
          <span className="text-xs text-ink-700 flex-1 min-w-[12rem]">
            Possibly the same medicine as <strong>{s.name}</strong> — {s.reason.toLowerCase()}.
          </span>
          <Button variant="secondary" className="!px-3 !py-1.5 text-xs" onClick={() => onMerge(s.id)}>
            Same medicine — merge
          </Button>
          <Button variant="ghost" className="!px-3 !py-1.5 text-xs" onClick={() => onKeepSeparate(s.id)}>
            Different
          </Button>
        </div>
      ))}

      <div className="mt-3 pt-3 border-t border-border flex flex-wrap items-center gap-x-4 gap-y-2">
        {m.history.length > 0 && (
          <button
            onClick={() => setShowHistory((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-medium text-accent-ink"
            aria-expanded={showHistory}
          >
            <History size={12} />
            {showHistory ? 'Hide history' : `Prescription history (${m.history.length})`}
          </button>
        )}
        {!m.is_active && (
          <button onClick={() => onSetStatus('taking')} className="text-xs font-medium text-ink-500 hover:text-accent-ink">
            I'm still taking this
          </button>
        )}
        {m.is_active && m.newer_prescriptions_without === 0 && m.origin === 'prescription' && (
          <button onClick={() => onSetStatus('stopped')} className="text-xs font-medium text-ink-500 hover:text-ink-900">
            Mark as stopped
          </button>
        )}
        <div className="ml-auto">
          {confirmingDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-danger">Remove "{m.name}"?</span>
              <button onClick={onDelete} className="text-xs font-medium text-danger">
                Yes, remove
              </button>
              <button onClick={onCancelDelete} className="text-xs font-medium text-ink-500">
                Cancel
              </button>
            </div>
          ) : (
            <button onClick={onAskDelete} className="flex items-center gap-1.5 text-xs font-medium text-ink-500 hover:text-danger">
              <Trash2 size={12} /> Remove
            </button>
          )}
        </div>
      </div>

      {showHistory && (
        <ol className="mt-3 space-y-2">
          {m.history.map((h, i) => (
            <li key={i} className="rounded-lg bg-surface px-3 py-2 text-xs">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-semibold text-ink-900">{formatDate(h.date) || 'Undated'}</span>
                {h.doctor_name && <span className="text-ink-700">{doctorLabel(h.doctor_name)}</span>}
                {h.hospital_name && <span className="text-ink-500">· {h.hospital_name}</span>}
                {h.action && <Badge tone={h.action === 'stop' ? 'danger' : 'neutral'}>{ACTION_LABEL[h.action] ?? h.action}</Badge>}
              </div>
              <p className="mt-1 text-ink-700">
                {[h.name, h.dosage && h.dosage !== h.strength ? h.dosage : '', h.frequency, h.instructions, h.duration]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              {h.action_text && <p className="mt-0.5 text-ink-500 italic">“{h.action_text}”</p>}
              {h.source_deleted ? (
                <p className="mt-1 text-ink-300">From a document that was later deleted from the locker.</p>
              ) : (
                <div className="mt-1 flex flex-wrap gap-2">
                  {h.documents.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => onOpenDocument(d.id)}
                      className="inline-flex items-center gap-1 text-accent-ink hover:underline"
                    >
                      <FileText size={11} /> {d.title || 'View prescription'}
                    </button>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
