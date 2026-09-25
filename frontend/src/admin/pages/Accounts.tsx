import { useEffect, useState } from 'react';
import { Search, Users, ShieldOff } from 'lucide-react';
import Topbar from '../components/Topbar';
import { Card, Badge, EmptyState } from '../components/ui';
import { adminApi } from '../lib/api';

type Account = {
  id: string;
  phone_number: string;
  is_active: boolean;
  date_joined: string;
};

export default function Accounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [query, setQuery] = useState('');
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  function load(search?: string) {
    adminApi.accounts(search).then((r) => setAccounts(r.data.results ?? r.data));
  }

  useEffect(() => load(), []);

  useEffect(() => {
    const t = setTimeout(() => load(query || undefined), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  async function handleDeactivate(id: string) {
    await adminApi.deactivateAccount(id);
    setConfirmingId(null);
    load(query || undefined);
  }

  return (
    <>
      <Topbar title="Users & Accounts" subtitle="Search and manage patient accounts" />
      <main className="p-4 sm:p-6 lg:p-8">
        <div className="relative mb-5 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-300" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by phone number..."
            className="w-full pl-9 pr-3 py-2.5 text-sm rounded-lg border border-border bg-card outline-none focus:ring-2 focus:ring-accent/30"
          />
        </div>

        {accounts.length === 0 ? (
          <Card>
            <EmptyState icon={<Users size={22} />} title="No accounts found" note="Try a different search." />
          </Card>
        ) : (
          <div className="space-y-2">
            {accounts.map((a) => (
              <Card key={a.id} className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-ink-900">{a.phone_number}</p>
                  <p className="text-xs text-ink-500">Joined {new Date(a.date_joined).toLocaleDateString()}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge tone={a.is_active ? 'success' : 'danger'}>{a.is_active ? 'Active' : 'Deactivated'}</Badge>
                  {a.is_active && (
                    confirmingId === a.id ? (
                      <div className="flex items-center gap-2">
                        <button onClick={() => handleDeactivate(a.id)} className="text-xs font-medium text-danger">
                          Confirm
                        </button>
                        <button onClick={() => setConfirmingId(null)} className="text-xs font-medium text-ink-500">
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmingId(a.id)}
                        className="flex items-center gap-1 text-xs font-medium text-ink-500 hover:text-danger"
                      >
                        <ShieldOff size={13} /> Deactivate
                      </button>
                    )
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
