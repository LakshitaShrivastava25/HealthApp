import { useEffect, useState } from 'react';
import { Pill, Clock3, Check, Plus, X, Trash2 } from 'lucide-react';
import Topbar from '../components/Topbar';
import { Card, Button } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { medicinesApi } from '../lib/api';

type Reminder = { id: string; time_of_day: string; days_of_week: string };
type Medication = {
  id: string;
  name: string;
  dosage: string;
  instructions: string;
  frequency: string;
  reminders: Reminder[];
};
type DoseLog = { id: string; reminder: string; status: string; scheduled_for: string };

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

export default function Medicines() {
  const { activeProfile } = useAuth();
  const [medications, setMedications] = useState<Medication[]>([]);
  const [takenReminderIds, setTakenReminderIds] = useState<Set<string>>(new Set());

  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDosage, setNewDosage] = useState('');
  const [newInstructions, setNewInstructions] = useState('');
  const [newFrequency, setNewFrequency] = useState('daily');
  const [newTime, setNewTime] = useState('08:00');
  const [saving, setSaving] = useState(false);

  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  async function loadMedications() {
    if (!activeProfile) return;
    const { data } = await medicinesApi.list(activeProfile.id);
    setMedications(data.results ?? data);
  }

  async function loadTodaysDoseLogs() {
    if (!activeProfile) return;
    const { data } = await medicinesApi.listDoseLogs(activeProfile.id);
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
  }, [activeProfile]);

  async function markTaken(reminderId: string) {
    await medicinesApi.logDose(reminderId, 'taken', new Date().toISOString());
    setTakenReminderIds((prev) => new Set(prev).add(reminderId));
  }

  async function handleAddMedicine() {
    if (!activeProfile || !newName.trim()) return;
    setSaving(true);
    try {
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

  return (
    <>
      <Topbar
        title="Medicines & Reminders"
        subtitle="Manage your medicines and never miss a dose"
        action={
          <Button onClick={() => setShowAddForm((v) => !v)}>
            {showAddForm ? <X size={16} /> : <Plus size={16} />} {showAddForm ? 'Cancel' : 'Add Medicine'}
          </Button>
        }
      />

      <main className="p-8">
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

        {medications.length === 0 && !showAddForm && (
          <Card className="p-10 text-center text-sm text-ink-500">
            No medicines on file yet — they're created automatically when a prescription is processed,
            or click "Add Medicine" to add one yourself.
          </Card>
        )}

        <div className="space-y-3">
          {medications.map((m) => (
            <Card key={m.id} className="p-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="w-11 h-11 rounded-lg bg-brand-lavender text-brand-purple flex items-center justify-center shrink-0">
                  <Pill size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-ink-900">{m.name}</p>
                  <p className="text-xs text-ink-500 mt-0.5">{m.dosage} · {m.instructions}</p>
                  <p className="text-xs text-ink-300 mt-0.5">{m.frequency}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {m.reminders.map((r) => {
                    const taken = takenReminderIds.has(r.id);
                    return (
                      <button
                        key={r.id}
                        onClick={() => !taken && markTaken(r.id)}
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
              </div>

              <div className="mt-3 pt-3 border-t border-border">
                {confirmingDeleteId === m.id ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-danger">Remove "{m.name}"?</span>
                    <button onClick={() => handleDelete(m.id)} className="text-xs font-medium text-danger">
                      Yes, remove
                    </button>
                    <button onClick={() => setConfirmingDeleteId(null)} className="text-xs font-medium text-ink-500">
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmingDeleteId(m.id)}
                    className="flex items-center gap-1.5 text-xs font-medium text-ink-500 hover:text-danger"
                  >
                    <Trash2 size={12} /> Remove
                  </button>
                )}
              </div>
            </Card>
          ))}
        </div>
      </main>
    </>
  );
}
