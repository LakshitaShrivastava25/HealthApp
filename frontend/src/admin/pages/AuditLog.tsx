import { useEffect, useState } from 'react';
import { ScrollText } from 'lucide-react';
import Topbar from '../components/Topbar';
import { Card, Badge, EmptyState } from '../components/ui';
import { adminApi } from '../lib/api';

type LogEntry = {
  id: string;
  action: string;
  target_type: string;
  target_id: string;
  created_at: string;
};

export default function AuditLog() {
  const [logs, setLogs] = useState<LogEntry[]>([]);

  useEffect(() => {
    adminApi.auditLog().then((r) => setLogs(r.data.results ?? r.data));
  }, []);

  return (
    <>
      <Topbar title="Audit Log" subtitle="Every staff action, in order — who did what, and when" />
      <main className="p-4 sm:p-6 lg:p-8">
        {logs.length === 0 ? (
          <Card>
            <EmptyState icon={<ScrollText size={22} />} title="No actions yet" note="Staff actions will appear here as they happen." />
          </Card>
        ) : (
          <Card>
            <div className="divide-y divide-border">
              {logs.map((l) => (
                <div key={l.id} className="px-5 py-3.5 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-ink-900">
                      <Badge tone="neutral">{l.action.replace(/_/g, ' ')}</Badge>
                    </p>
                    <p className="text-xs text-ink-500 mt-1">
                      {l.target_type} · {l.target_id.slice(0, 8)}...
                    </p>
                  </div>
                  <p className="text-xs text-ink-300">{new Date(l.created_at).toLocaleString()}</p>
                </div>
              ))}
            </div>
          </Card>
        )}
      </main>
    </>
  );
}
