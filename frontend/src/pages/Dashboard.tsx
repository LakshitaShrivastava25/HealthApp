import { useEffect, useState } from 'react';
import { Plus, Sparkles, FileText, Pill as PillIcon, Stethoscope, ArrowRight, Bell } from 'lucide-react';
import Topbar from '../components/Topbar';
import { Card, CardHeader, Button, ProgressRing, Badge } from '../components/ui';
import AIBotMascot from '../components/AIBotMascot';
import DocumentDetailModal from '../components/DocumentDetailModal';
import { useAuth } from '../context/AuthContext';
import { documentsApi, doctorAccessApi, medicinesApi, profilesApi, timelineApi } from '../lib/api';

const docBadgeTone: Record<string, 'info' | 'success' | 'warning' | 'neutral' | 'danger'> = {
  report: 'info',
  prescription: 'success',
  scan: 'warning',
  discharge: 'neutral',
  other: 'neutral',
};

type Doc = { id: string; title: string; category: string; status: string; document_date: string | null; hospital_name: string };
type Med = { id: string; name: string; dosage: string; instructions: string; reminders: { id: string; time_of_day: string }[] };
type Notification = { id: string; text: string; tone: 'warning' | 'info' };

export default function Dashboard() {
  const { activeProfile, profiles } = useAuth();
  const [documents, setDocuments] = useState<Doc[]>([]);
  const [medications, setMedications] = useState<Med[]>([]);
  const [timelineCount, setTimelineCount] = useState(0);
  const [doctorAccessCount, setDoctorAccessCount] = useState(0);
  const [question, setQuestion] = useState('');
  const [askLoading, setAskLoading] = useState(false);
  const [askAnswer, setAskAnswer] = useState<string | null>(null);
  const [openDocId, setOpenDocId] = useState<string | null>(null);
  const [notifOpen, setNotifOpen] = useState(false);

  useEffect(() => {
    if (!activeProfile) return;
    loadDocuments();
    medicinesApi.list(activeProfile.id).then((r) => setMedications(r.data.results ?? r.data));
    timelineApi.list(activeProfile.id).then((r) => setTimelineCount((r.data.results ?? r.data).length));
    doctorAccessApi
      .listForProfile(activeProfile.id)
      .then((r) => {
        const grants = r.data.results ?? r.data;
        setDoctorAccessCount(grants.filter((g: { status: string }) => g.status === 'approved').length);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProfile]);

  function loadDocuments() {
    if (!activeProfile) return;
    documentsApi.list(activeProfile.id).then((r) => setDocuments((r.data.results ?? r.data).slice(0, 5)));
  }

  async function handleAsk() {
    if (!activeProfile || !question.trim()) return;
    setAskLoading(true);
    setAskAnswer(null);
    try {
      const { data } = await profilesApi.ask(activeProfile.id, question);
      setAskAnswer(data.answer);
    } catch {
      setAskAnswer('Something went wrong reaching the AI assistant. Is the backend running?');
    } finally {
      setAskLoading(false);
    }
  }

  // Real notifications, derived from actual data — not decorative.
  const notifications: Notification[] = [
    ...documents
      .filter((d) => d.status === 'needs_review')
      .map((d) => ({ id: `doc-${d.id}`, text: `"${d.title}" needs your review`, tone: 'warning' as const })),
    ...documents
      .filter((d) => d.status === 'processing')
      .map((d) => ({ id: `proc-${d.id}`, text: `"${d.title}" is still processing`, tone: 'info' as const })),
  ];

  // A readiness score built from real signals on the account — not a medical
  // measurement. Kept deliberately simple and explainable.
  const readinessChecks = [
    { label: 'Profile has a blood group on file', done: !!activeProfile?.blood_group },
    { label: 'At least one document uploaded', done: documents.length > 0 },
    { label: 'At least one medicine tracked', done: medications.length > 0 },
    { label: 'More than one family profile added', done: profiles.length > 1 },
  ];
  const readinessScore = Math.round((readinessChecks.filter((c) => c.done).length / readinessChecks.length) * 100);
  const readinessLabel = readinessScore >= 75 ? 'Well set up' : readinessScore >= 40 ? 'Getting there' : 'Just started';

  const firstName = activeProfile?.full_name.split(' ')[0] || '';

  return (
    <>
      <Topbar
        title={`Welcome back, ${firstName || '...'} 👋`}
        subtitle="Here's your health summary for today"
        action={
          <div className="flex items-center gap-3">
            <div className="relative">
              <button
                onClick={() => setNotifOpen((v) => !v)}
                className="relative w-10 h-10 rounded-full flex items-center justify-center text-ink-700 hover:bg-surface transition-colors"
              >
                <Bell size={19} />
                {notifications.length > 0 && (
                  <span className="absolute top-2 right-2.5 w-2 h-2 rounded-full bg-danger" />
                )}
              </button>
              {notifOpen && (
                <div className="absolute right-0 mt-2 w-72 bg-card border border-border rounded-xl shadow-card py-2 z-20">
                  <p className="px-3 pb-1 text-xs font-semibold text-ink-500 uppercase tracking-wide">Notifications</p>
                  {notifications.length === 0 ? (
                    <p className="px-3 py-3 text-sm text-ink-500">You're all caught up.</p>
                  ) : (
                    notifications.map((n) => (
                      <div key={n.id} className="px-3 py-2 text-sm text-ink-700 flex items-start gap-2">
                        <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${n.tone === 'warning' ? 'bg-warning' : 'bg-info'}`} />
                        {n.text}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
            <Button onClick={() => window.location.assign('/locker')}>
              <Plus size={16} /> Add Record
            </Button>
          </div>
        }
      />

      <main className="p-8 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 !bg-gradient-to-br from-brand-teal to-brand-purple !border-0 text-white p-6 flex flex-col justify-between">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium opacity-90">
                  <Sparkles size={16} /> AI Health Assistant
                </div>
                <p className="text-lg font-semibold mt-2 max-w-xs">
                  Ask anything about your health, reports, medicines or symptoms.
                </p>
              </div>
              <AIBotMascot size={110} />
            </div>

            {askAnswer && (
              <div className="bg-white/15 backdrop-blur rounded-xl px-4 py-3 text-sm mb-3">
                {askAnswer}
              </div>
            )}

            <div className="mt-2 bg-white/15 backdrop-blur rounded-xl flex items-center px-4 py-3">
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
                placeholder="Type your question here..."
                className="bg-transparent placeholder-white/70 text-sm flex-1 outline-none"
              />
              <button
                onClick={handleAsk}
                disabled={askLoading || !question.trim()}
                className="w-8 h-8 rounded-full bg-white text-brand-purple flex items-center justify-center disabled:opacity-50"
              >
                <ArrowRight size={16} />
              </button>
            </div>
          </Card>

          <Card className="p-6 flex flex-col items-center justify-center text-center">
            <p className="text-sm font-semibold text-ink-500 mb-3">Account Readiness</p>
            <div className="relative">
              <ProgressRing value={readinessScore} />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xl font-bold text-ink-900">{readinessScore}</span>
              </div>
            </div>
            <p className="text-sm font-semibold text-success mt-3">{readinessLabel}</p>
            <div className="mt-3 space-y-1 text-left w-full">
              {readinessChecks.map((c) => (
                <p key={c.label} className={`text-xs flex items-center gap-1.5 ${c.done ? 'text-ink-500' : 'text-ink-300'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${c.done ? 'bg-success' : 'bg-border'}`} />
                  {c.label}
                </p>
              ))}
            </div>
          </Card>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-ink-700 mb-3">Health at a Glance</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Active Medicines', value: medications.length, icon: PillIcon, href: '/medicines' },
              { label: 'Documents on file', value: documents.length, icon: FileText, href: '/locker' },
              { label: 'Timeline Events', value: timelineCount, icon: Bell, href: '/timeline' },
              { label: 'Doctors with access', value: doctorAccessCount, icon: Stethoscope, href: '/find-care' },
            ].map((s) => (
              <Card
                key={s.label}
                className="p-4 flex items-start gap-3 cursor-pointer hover:border-brand-purple transition-colors"
                onClick={() => window.location.assign(s.href)}
              >
                <div className="w-10 h-10 rounded-lg bg-brand-lavender text-brand-purple flex items-center justify-center shrink-0">
                  <s.icon size={18} />
                </div>
                <div>
                  <p className="text-xl font-bold text-ink-900 leading-tight">{s.value}</p>
                  <p className="text-xs text-ink-500 mt-0.5">{s.label}</p>
                </div>
              </Card>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader title="Recent Records" />
            <div className="px-5 pb-5 pt-3 space-y-1">
              {documents.length === 0 && (
                <p className="text-sm text-ink-500 py-4">No documents uploaded yet — try Medical Locker.</p>
              )}
              {documents.map((d) => (
                <button
                  key={d.id}
                  onClick={() => setOpenDocId(d.id)}
                  className="w-full flex items-center justify-between py-2.5 border-b border-border last:border-0 text-left hover:bg-surface -mx-2 px-2 rounded-lg transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium text-ink-900">{d.title}</p>
                    <p className="text-xs text-ink-500 mt-0.5">{d.document_date || ''} {d.hospital_name}</p>
                  </div>
                  <Badge tone={docBadgeTone[d.category] || 'neutral'}>{d.category}</Badge>
                </button>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title="Active Medicines" />
            <div className="px-5 pb-5 pt-3 space-y-1">
              {medications.length === 0 && (
                <p className="text-sm text-ink-500 py-4">No medicines on file yet.</p>
              )}
              {medications.map((m) => (
                <button
                  key={m.id}
                  onClick={() => window.location.assign('/medicines')}
                  className="w-full flex items-center gap-3 py-2.5 border-b border-border last:border-0 text-left hover:bg-surface -mx-2 px-2 rounded-lg transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium text-ink-900">{m.name}</p>
                    <p className="text-xs text-ink-500 mt-0.5">{m.dosage} · {m.instructions}</p>
                  </div>
                </button>
              ))}
            </div>
          </Card>
        </div>
      </main>

      {openDocId && <DocumentDetailModal documentId={openDocId} onClose={() => setOpenDocId(null)} onUpdated={loadDocuments} onDeleted={loadDocuments} />}
    </>
  );
}
