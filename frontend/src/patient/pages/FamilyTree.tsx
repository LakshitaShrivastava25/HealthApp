import { useCallback, useEffect, useState } from 'react';
import { Check, UserCheck, X, Clock, Users } from 'lucide-react';
import Topbar from '../components/Topbar';
import { Card, Button } from '../components/ui';
import { familyApi } from '../lib/api';
import { useAuth } from '../context/AuthContext';

type TreeNode = {
  id: string;
  name: string;
  relation: string;
  initials: string;
  phone_number: string;
  phone_verified: boolean;
  gender: string;
  date_of_birth: string | null;
  blood_group: string;
};

type TreeEdge = {
  from: string;
  to: string;
  relation: string;
  cross_account?: boolean;
};

type LinkRequest = {
  id: string;
  from_account_phone: string;
  from_profile_name: string;
  to_phone: string;
  relation: string;
  profile_data: Record<string, string>;
  status: string;
  created_at: string;
};

const RELATION_COLORS: Record<string, string> = {
  self: 'bg-accent text-white',
  father: 'bg-blue-100 text-blue-800',
  mother: 'bg-pink-100 text-pink-800',
  spouse: 'bg-purple-100 text-purple-800',
  son: 'bg-green-100 text-green-800',
  daughter: 'bg-amber-100 text-amber-800',
  other: 'bg-gray-100 text-gray-700',
};

export default function FamilyTree() {
  const { refreshProfiles } = useAuth();
  const [nodes, setNodes] = useState<TreeNode[]>([]);
  const [, setEdges] = useState<TreeEdge[]>([]);
  const [selfId, setSelfId] = useState<string | null>(null);
  const [requests, setRequests] = useState<LinkRequest[]>([]);
  const [sentRequests, setSentRequests] = useState<LinkRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [responding, setResponding] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [treeRes, recvRes, sentRes] = await Promise.all([
        familyApi.tree(),
        familyApi.linkRequests('received'),
        familyApi.linkRequests('sent'),
      ]);
      const tree = treeRes.data;
      setNodes(tree.nodes);
      setEdges(tree.edges);
      setSelfId(tree.self_id);
      const recv = recvRes.data.results ?? recvRes.data;
      setRequests(Array.isArray(recv) ? recv : []);
      const sent = sentRes.data.results ?? sentRes.data;
      setSentRequests(Array.isArray(sent) ? sent : []);
    } catch {
      // Silent — page still renders with empty state.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleRespond(id: string, action: 'approve' | 'deny') {
    setResponding(id);
    try {
      await familyApi.respondToRequest(id, action);
      await load();
      if (action === 'approve') await refreshProfiles();
    } finally {
      setResponding(null);
    }
  }

  const selfNode = nodes.find((n) => n.id === selfId);
  const familyNodes = nodes.filter((n) => n.id !== selfId);
  const pendingReceived = requests.filter((r) => r.status === 'pending');
  const pendingSent = sentRequests.filter((r) => r.status === 'pending');

  // Group family members by generation
  const parents = familyNodes.filter((n) => n.relation === 'father' || n.relation === 'mother');
  const spouse = familyNodes.filter((n) => n.relation === 'spouse');
  const children = familyNodes.filter((n) => n.relation === 'son' || n.relation === 'daughter');
  const others = familyNodes.filter((n) => n.relation === 'other');

  return (
    <>
      <Topbar title="Family Tree" subtitle="Your family members and connections" />
      <main className="p-4 sm:p-6 lg:p-8 max-w-4xl space-y-6">

        {/* Pending approval requests */}
        {pendingReceived.length > 0 && (
          <Card className="p-5 border-warning/30 bg-warning/5">
            <p className="text-sm font-semibold text-ink-900 flex items-center gap-2 mb-3">
              <UserCheck size={16} className="text-warning" /> Pending approval requests
            </p>
            <div className="space-y-3">
              {pendingReceived.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg bg-card border border-border p-3">
                  <div>
                    <p className="text-sm font-medium text-ink-900">{r.from_profile_name}</p>
                    <p className="text-xs text-ink-500">
                      Wants to add you as <span className="capitalize font-medium">{r.relation}</span> in their family
                    </p>
                    <p className="text-xs text-ink-400 mt-0.5">From: {r.from_account_phone}</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      onClick={() => handleRespond(r.id, 'approve')}
                      disabled={responding === r.id}
                      className="!px-3 !py-1.5 text-xs"
                    >
                      <Check size={13} /> Approve
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => handleRespond(r.id, 'deny')}
                      disabled={responding === r.id}
                      className="!px-3 !py-1.5 text-xs"
                    >
                      <X size={13} /> Deny
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Sent pending requests */}
        {pendingSent.length > 0 && (
          <Card className="p-5">
            <p className="text-sm font-semibold text-ink-900 flex items-center gap-2 mb-3">
              <Clock size={16} className="text-ink-500" /> Awaiting approval
            </p>
            <div className="space-y-2">
              {pendingSent.map((r) => (
                <div key={r.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                  <div className="w-9 h-9 rounded-full bg-surface flex items-center justify-center text-xs font-bold text-ink-500">
                    {(r.profile_data.full_name || '?').split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-ink-900">{r.profile_data.full_name}</p>
                    <p className="text-xs text-ink-500">
                      <span className="capitalize">{r.relation}</span> — waiting for {r.to_phone} to approve
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Family tree visualization */}
        {loading ? (
          <div className="text-center py-12 text-sm text-ink-500">Loading family tree...</div>
        ) : nodes.length === 0 ? (
          <Card className="p-8 text-center">
            <Users size={32} className="mx-auto text-ink-300 mb-3" />
            <p className="text-sm font-medium text-ink-700">No family members yet</p>
            <p className="text-xs text-ink-500 mt-1">Add family members from the profile switcher in the header.</p>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Parents row */}
            {parents.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400 mb-2">Parents</p>
                <div className="flex flex-wrap gap-3">
                  {parents.map((n) => <TreeCard key={n.id} node={n} />)}
                </div>
                <div className="flex justify-center my-2">
                  <div className="w-px h-6 bg-border" />
                </div>
              </div>
            )}

            {/* Self + Spouse row */}
            <div className="flex flex-wrap items-center justify-center gap-4">
              {selfNode && <TreeCard node={selfNode} isSelf />}
              {spouse.length > 0 && (
                <>
                  <div className="w-8 h-px bg-accent" />
                  {spouse.map((n) => <TreeCard key={n.id} node={n} />)}
                </>
              )}
            </div>

            {/* Children row */}
            {children.length > 0 && (
              <div>
                <div className="flex justify-center my-2">
                  <div className="w-px h-6 bg-border" />
                </div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400 mb-2">Children</p>
                <div className="flex flex-wrap gap-3">
                  {children.map((n) => <TreeCard key={n.id} node={n} />)}
                </div>
              </div>
            )}

            {/* Others */}
            {others.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400 mb-2 mt-4">Other</p>
                <div className="flex flex-wrap gap-3">
                  {others.map((n) => <TreeCard key={n.id} node={n} />)}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </>
  );
}

function TreeCard({ node, isSelf }: { node: TreeNode; isSelf?: boolean }) {
  const colorCls = RELATION_COLORS[node.relation] || RELATION_COLORS.other;
  return (
    <div className={`rounded-xl border ${isSelf ? 'border-accent/40 bg-accent/5' : 'border-border bg-card'} p-4 min-w-[150px] max-w-[200px] text-center shadow-sm`}>
      <div className={`mx-auto w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold ${colorCls}`}>
        {node.initials}
      </div>
      <p className="mt-2 text-sm font-semibold text-ink-900 truncate">{node.name}</p>
      <p className="text-[11px] text-ink-500 capitalize">{node.relation}</p>
      {node.phone_number && (
        <p className="text-[10px] text-ink-400 mt-1 flex items-center justify-center gap-1">
          {node.phone_number}
          {node.phone_verified && <Check size={10} className="text-success" />}
        </p>
      )}
      {node.blood_group && (
        <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] bg-surface text-ink-500">{node.blood_group}</span>
      )}
    </div>
  );
}
