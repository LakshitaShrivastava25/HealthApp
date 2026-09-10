import { useEffect, useState } from 'react';
import Topbar from '../components/Topbar';
import { Card, Badge } from '../components/ui';
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

      <main className="p-8 max-w-3xl">
        {years.length === 0 && (
          <Card className="p-10 text-center text-sm text-ink-500">
            No timeline events yet — they're built automatically from documents you upload.
          </Card>
        )}
        {years.map((year) => (
          <div key={year} className="mb-8">
            <p className="text-sm font-bold text-ink-900 mb-3">{year}</p>
            <div className="relative pl-6 border-l-2 border-border space-y-4">
              {grouped[year].map((e) => {
                const clickable = !!e.source_document;
                const CardEl = (
                  <Card
                    className={`p-4 flex items-center justify-between ${clickable ? 'hover:border-brand-purple transition-colors' : ''}`}
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
                    <span className="absolute -left-[29px] top-1.5 w-3 h-3 rounded-full bg-brand-purple ring-4 ring-brand-lavender" />
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
