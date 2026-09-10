import { useEffect, useState } from 'react';
import { Search, Users } from 'lucide-react';
import Topbar from '../components/Topbar';
import { Card, Badge, EmptyState } from '../components/ui';
import { adminApi } from '../lib/api';

/**
 * A directory of registered patient profiles — who exists, and which login
 * they belong to.
 *
 * Deliberately not a medical view: no allergies, medicines, documents or
 * insurance. Those live behind the individual review screens, which are
 * audited per action. This list answers "who is on the platform", nothing
 * more.
 *
 * Distinct from "Users & Accounts", which lists login ACCOUNTS. One account
 * can hold several profiles (a person plus the family members they manage),
 * so the two lists genuinely differ in length and in what they show.
 */
type Patient = {
  id: string;
  full_name: string;
  relation: string;
  account: string;
  account_phone_number: string;
  created_at: string;
};

export default function Patients() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [query, setQuery] = useState('');

  function load(search?: string) {
    adminApi.patients(search).then((r) => setPatients(r.data.results ?? r.data));
  }

  useEffect(() => load(), []);

  useEffect(() => {
    // Debounced so typing doesn't fire a request per keystroke — same
    // pattern the Users & Accounts search already uses.
    const t = setTimeout(() => load(query || undefined), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return (
    <>
      <Topbar title="Patients" subtitle="Every registered patient profile across all accounts" />
      <main className="p-8">
        <div className="relative mb-5 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-300" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or phone number..."
            className="w-full pl-9 pr-3 py-2.5 text-sm rounded-lg border border-border bg-card outline-none focus:ring-2 focus:ring-brand-purple/30"
          />
        </div>

        {patients.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Users size={22} />}
              title={query ? 'No patients found' : 'No patient profiles yet'}
              note={query ? 'Try a different search.' : 'Profiles appear here once people complete signup.'}
            />
          </Card>
        ) : (
          <>
            <p className="text-xs text-ink-500 mb-3">
              {patients.length} profile{patients.length === 1 ? '' : 's'}
            </p>
            <div className="space-y-2">
              {patients.map((p) => (
                <Card key={p.id} className="p-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink-900 truncate">{p.full_name}</p>
                    <p className="text-xs text-ink-500 mt-0.5">
                      {p.account_phone_number}
                      <span className="text-ink-300"> · joined {new Date(p.created_at).toLocaleDateString()}</span>
                    </p>
                  </div>
                  <Badge tone="neutral">
                    <span className="capitalize">{p.relation}</span>
                  </Badge>
                </Card>
              ))}
            </div>
          </>
        )}
      </main>
    </>
  );
}
