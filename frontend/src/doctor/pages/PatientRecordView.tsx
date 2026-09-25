import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { FileText, AlertTriangle, History, Plus, X, Pill, ExternalLink } from 'lucide-react';
import Topbar from '../components/Topbar';
import { Card, Badge, Button, EmptyState } from '../components/ui';
import { patientDataApi, notesApi, api } from '../lib/api';

type TimelineEvent = { id: string; event_date: string; title: string; summary: string; event_type: string };
// `file` is the uploaded document's URL. The serializer already returned it;
// this view simply never asked for it, so a doctor could see titles but not
// open anything.
type Doc = { id: string; title: string; category: string; document_date: string | null; file: string | null };
type Medication = { id: string; name: string; dosage: string; frequency: string; instructions: string };
type Allergy = { id: string; substance: string; reaction: string };

export default function PatientRecordView() {
  const { profileId } = useParams<{ profileId: string }>();
  const [patientName, setPatientName] = useState('');
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [documents, setDocuments] = useState<Doc[]>([]);
  const [allergies, setAllergies] = useState<Allergy[]>([]);
  const [medications, setMedications] = useState<Medication[]>([]);

  const [showNoteForm, setShowNoteForm] = useState(false);
  const [diagnosis, setDiagnosis] = useState('');
  const [prescription, setPrescription] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!profileId) return;
    api.get(`/profiles/${profileId}/`).then((r) => setPatientName(r.data.full_name));
    patientDataApi.timeline(profileId).then((r) => setTimeline(r.data.results ?? r.data));
    patientDataApi.documents(profileId).then((r) => setDocuments(r.data.results ?? r.data));
    patientDataApi.allergies(profileId).then((r) => setAllergies(r.data.results ?? r.data));
    patientDataApi.medications(profileId).then((r) => setMedications(r.data.results ?? r.data));
  }, [profileId]);

  async function handleAddNote() {
    if (!profileId) return;
    setSaveError('');
    setSaving(true);
    try {
      await notesApi.create({ profile: profileId, diagnosis, prescription, notes });
      setDiagnosis('');
      setPrescription('');
      setNotes('');
      setShowNoteForm(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setSaveError('Could not save the note. You may no longer have approved access to this patient.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Topbar
        title={patientName || 'Patient Record'}
        subtitle="Read-only — you're viewing this with the patient's approval"
        action={
          <Button onClick={() => setShowNoteForm((v) => !v)}>
            {showNoteForm ? <X size={16} /> : <Plus size={16} />} {showNoteForm ? 'Cancel' : 'Add Consultation Note'}
          </Button>
        }
      />
      <main className="p-4 sm:p-6 lg:p-8 space-y-6">
        {saved && <p className="text-sm text-success">Consultation note saved.</p>}

        {showNoteForm && (
          <Card className="p-5">
            <p className="text-sm font-semibold text-ink-900 mb-3">New Consultation Note</p>
            <input
              value={diagnosis}
              onChange={(e) => setDiagnosis(e.target.value)}
              placeholder="Diagnosis"
              className="w-full text-sm px-3 py-2 rounded-lg border border-border outline-none mb-2"
            />
            <textarea
              value={prescription}
              onChange={(e) => setPrescription(e.target.value)}
              placeholder="Prescription"
              rows={2}
              className="w-full text-sm px-3 py-2 rounded-lg border border-border outline-none mb-2"
            />
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes / follow-up instructions"
              rows={3}
              className="w-full text-sm px-3 py-2 rounded-lg border border-border outline-none mb-3"
            />
            {saveError && <p className="text-xs text-danger mb-2">{saveError}</p>}
            <Button onClick={handleAddNote} disabled={saving || !diagnosis.trim()}>
              {saving ? 'Saving...' : 'Save Note'}
            </Button>
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="p-5">
            <p className="text-sm font-semibold text-ink-900 flex items-center gap-2 mb-3">
              <AlertTriangle size={15} className="text-warning" /> Allergies
            </p>
            {allergies.length === 0 ? (
              <p className="text-xs text-ink-500">None on file.</p>
            ) : (
              <ul className="space-y-1.5">
                {allergies.map((a) => (
                  <li key={a.id} className="text-xs text-ink-700">
                    • {a.substance} {a.reaction && `— ${a.reaction}`}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-5 md:col-span-2">
            <p className="text-sm font-semibold text-ink-900 flex items-center gap-2 mb-3">
              <FileText size={15} className="text-info" /> Documents
            </p>
            {documents.length === 0 ? (
              <EmptyState compact icon={<FileText size={20} />} title="No documents" note="This patient has not uploaded any documents yet." />
            ) : (
              <div className="space-y-2">
                {documents.map((d) => (
                  <div key={d.id} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      {/* Opens the real uploaded file, the same way the
                          patient's own Medical Locker does. Access is still
                          gated server-side by the approved grant that let
                          this page load at all. */}
                      {d.file ? (
                        <a
                          href={d.file}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-medium text-accent-ink hover:underline inline-flex items-center gap-1"
                        >
                          {d.title}
                          <ExternalLink size={11} className="shrink-0" />
                        </a>
                      ) : (
                        <p className="text-xs text-ink-700">{d.title}</p>
                      )}
                      {d.document_date && <p className="text-[11px] text-ink-300">{d.document_date}</p>}
                      {!d.file && <p className="text-[11px] text-ink-300">No file attached</p>}
                    </div>
                    <Badge tone="neutral">{d.category}</Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <Card className="p-5">
          <p className="text-sm font-semibold text-ink-900 flex items-center gap-2 mb-3">
            <Pill size={15} className="text-success" /> Active Medications
          </p>
          {medications.length === 0 ? (
            <EmptyState compact icon={<Pill size={20} />} title="No active medications" note="Nothing is currently recorded for this patient." />
          ) : (
            <div className="space-y-2">
              {medications.map((m) => (
                <div key={m.id} className="flex items-start justify-between gap-4 border-b border-border last:border-0 pb-2 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink-900">{m.name}</p>
                    <p className="text-xs text-ink-500 mt-0.5">
                      {[m.dosage, m.frequency].filter(Boolean).join(' · ') || '—'}
                    </p>
                  </div>
                  {m.instructions && <p className="text-xs text-ink-300 shrink-0">{m.instructions}</p>}
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <p className="text-sm font-semibold text-ink-900 flex items-center gap-2 mb-3">
            <History size={15} className="text-accent-ink" /> Timeline
          </p>
          {timeline.length === 0 ? (
            <EmptyState icon={<History size={20} />} title="No timeline events" note="Nothing recorded yet." />
          ) : (
            <div className="space-y-2">
              {timeline.map((e) => (
                <div key={e.id} className="flex items-center justify-between border-b border-border last:border-0 pb-2">
                  <div>
                    <p className="text-sm text-ink-900">{e.title}</p>
                    <p className="text-xs text-ink-500">{e.summary}</p>
                  </div>
                  <p className="text-xs text-ink-300">{e.event_date}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </main>
    </>
  );
}
