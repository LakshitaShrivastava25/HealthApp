import { useEffect, useState } from 'react';
import { Activity, FileBarChart, Pill, ScanLine, ShieldAlert, Stethoscope } from 'lucide-react';
import Topbar from '../components/Topbar';
import { Card, Badge, EmptyState } from '../components/ui';
import DocumentDetailModal from '../components/DocumentDetailModal';
import { useAuth } from '../context/AuthContext';
import { timelineApi } from '../lib/api';

const docBadgeTone: Record<string, 'info' | 'success' | 'warning' | 'neutral' | 'danger'> = {
  report: 'info',
  prescription: 'success',
  scan: 'warning',
  discharge: 'neutral',
  diagnosis: 'danger',
  allergy: 'warning',
};

/** Dot colour, halo tint and icon per category — the visual key for the rail. */
const eventStyle: Record<string, { dot: string; ring: string; icon: typeof Activity; label: string }> = {
  report: { dot: 'bg-info', ring: 'ring-info-bg', icon: FileBarChart, label: 'Report' },
  prescription: { dot: 'bg-success', ring: 'ring-success-bg', icon: Pill, label: 'Prescription' },
  scan: { dot: 'bg-warning', ring: 'ring-warning-bg', icon: ScanLine, label: 'Scan' },
  discharge: { dot: 'bg-ink-300', ring: 'ring-surface', icon: Stethoscope, label: 'Discharge' },
  diagnosis: { dot: 'bg-danger', ring: 'ring-danger-bg', icon: Activity, label: 'Diagnosis' },
  allergy: { dot: 'bg-warning', ring: 'ring-warning-bg', icon: ShieldAlert, label: 'Allergy' },
};
const fallbackStyle = { dot: 'bg-accent', ring: 'ring-accent-soft', icon: Activity, label: 'Event' };

type TimelineEvent = {
  id: string;
  event_date: string;
  event_type: string;
  title: string;
  summary: string;
  source_document: string | null;
};

export default function HealthTimeline() {
  const { activeProfile } = useAuth();
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [openDocId, setOpenDocId] = useState<string | null>(null);

  function loadEvents() {
    if (!activeProfile) return;
    timelineApi.list(activeProfile.id).then((r) => setEvents(r.data.results ?? r.data));
  }

  useEffect(() => {
    loadEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProfile]);

  const grouped = events.reduce<Record<string, TimelineEvent[]>>((acc, e) => {
    const year = e.event_date.slice(0, 4);
    acc[year] = acc[year] || [];
    acc[year].push(e);
    return acc;
  }, {});
  const years = Object.keys(grouped).sort().reverse();

  return (
    <>
      <Topbar title="Health Timeline" subtitle="Your health journey in chronological order" />

      <main className="p-4 sm:p-6 lg:p-8 max-w-3xl">
        {years.length === 0 && (
          <Card>
            <EmptyState
              icon={<Activity size={22} />}
              title="No timeline events yet"
              note="Your timeline builds itself from the documents you upload — add one in Medical Locker to get started."
            />
          </Card>
        )}
        {years.map((year) => (
          <div key={year} className="mb-8">
            <p className="mb-4 flex items-center gap-2 text-base font-bold tracking-tight text-ink-900">
              {year}
              <span className="h-px flex-1 bg-border" />
            </p>
            {/* Thicker, softly tinted rail — the spine of the timeline rather
                than an incidental divider. */}
            <div className="relative space-y-4 border-l-[3px] border-accent-soft pl-7">
              {grouped[year].map((e) => {
                const clickable = !!e.source_document;
                const style = eventStyle[e.event_type] || fallbackStyle;
                const StyleIcon = style.icon;
                const CardEl = (
                  <Card
                    interactive={clickable}
                    className={`p-4 flex items-center justify-between ${clickable ? 'hover:border-accent transition-colors' : ''}`}
                  >
                    <div className="flex gap-4">
                      <p className="text-xs font-semibold text-ink-500 w-16 shrink-0 pt-0.5">
                        {new Date(e.event_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                      </p>
                      <div>
                        <p className="text-sm font-semibold text-ink-900">{e.title}</p>
                        <p className="text-xs text-ink-500 mt-0.5">{e.summary}</p>
                      </div>
                    </div>
                    <Badge tone={docBadgeTone[e.event_type] || 'neutral'}>{e.event_type}</Badge>
                  </Card>
                );

                return (
                  <div key={e.id} className="relative">
                    {/* Colour-coded node sitting on the rail, with the
                        category's own icon inside it. */}
                    <span
                      className={`absolute -left-[34px] top-2 flex h-[22px] w-[22px] items-center justify-center rounded-full text-white ring-4 ${style.dot} ${style.ring}`}
                    >
                      <StyleIcon size={12} strokeWidth={2.5} />
                    </span>
                    {clickable ? (
                      <button onClick={() => setOpenDocId(e.source_document)} className="w-full text-left">
                        {CardEl}
                      </button>
                    ) : (
                      CardEl
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </main>

      {openDocId && (
        <DocumentDetailModal
          documentId={openDocId}
          onClose={() => setOpenDocId(null)}
          onUpdated={loadEvents}
          onDeleted={() => {
            setOpenDocId(null);
            loadEvents();
          }}
        />
      )}
    </>
  );
}
