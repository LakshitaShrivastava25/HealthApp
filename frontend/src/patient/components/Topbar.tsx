import { type ReactNode, useState } from 'react';
import { Bell, ChevronDown, Plus } from 'lucide-react';
import { Avatar } from './ui';
import { useAuth } from '../context/AuthContext';
import { profilesApi } from '../lib/api';

export default function Topbar({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  const { profiles, activeProfile, setActiveProfile, refreshProfiles } = useAuth();
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [addingMember, setAddingMember] = useState(false);
  const [newName, setNewName] = useState('');
  const [newRelation, setNewRelation] = useState('father');

  async function handleAddMember() {
    if (!newName.trim()) return;
    await profilesApi.create({ full_name: newName, relation: newRelation });
    await refreshProfiles();
    setNewName('');
    setAddingMember(false);
    setSwitcherOpen(false);
  }

  return (
    <header className="sticky top-0 z-10 bg-card border-b border-border px-8 py-4 flex items-center justify-between">
      <div>
        <h1 className="text-xl font-bold text-ink-900">{title}</h1>
        {subtitle && <p className="text-sm text-ink-500 mt-0.5">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-4">
        {action}

        <button
          disabled
          title="Not yet built — notifications aren't wired up yet"
          className="relative w-10 h-10 rounded-full flex items-center justify-center text-ink-300 cursor-not-allowed"
        >
          <Bell size={19} />
        </button>

        <div className="relative">
          <button
            onClick={() => setSwitcherOpen((v) => !v)}
            className="flex items-center gap-2.5 pl-1 pr-2 py-1 rounded-full hover:bg-surface transition-colors"
          >
            <Avatar initials={activeProfile?.initials || '?'} />
            <div className="text-left hidden sm:block">
              <p className="text-sm font-semibold text-ink-900 leading-tight">{activeProfile?.full_name || 'Loading...'}</p>
              <p className="text-xs text-ink-500 leading-tight capitalize">{activeProfile?.relation}</p>
            </div>
            <ChevronDown size={16} className="text-ink-500" />
          </button>

          {switcherOpen && (
            <div className="absolute right-0 mt-2 w-72 bg-card border border-border rounded-xl shadow-card py-2 z-20">
              <p className="px-3 pb-1 text-xs font-semibold text-ink-500 uppercase tracking-wide">Switch profile</p>
              {profiles.map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    setActiveProfile(m);
                    setSwitcherOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 hover:bg-surface text-left"
                >
                  <Avatar initials={m.initials} size={30} />
                  <div>
                    <p className="text-sm font-medium text-ink-900">{m.full_name}</p>
                    <p className="text-xs text-ink-500 capitalize">{m.relation}</p>
                  </div>
                </button>
              ))}

              <div className="border-t border-border mt-1 pt-1">
                {!addingMember ? (
                  <button
                    onClick={() => setAddingMember(true)}
                    className="w-full flex items-center gap-2 text-left px-3 py-2 text-sm font-medium text-brand-purple hover:bg-surface"
                  >
                    <Plus size={15} /> Add family member
                  </button>
                ) : (
                  <div className="px-3 py-2 space-y-2">
                    <input
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="Full name"
                      className="w-full text-sm px-2.5 py-1.5 rounded-lg border border-border outline-none"
                    />
                    <select
                      value={newRelation}
                      onChange={(e) => setNewRelation(e.target.value)}
                      className="w-full text-sm px-2.5 py-1.5 rounded-lg border border-border outline-none"
                    >
                      <option value="father">Father</option>
                      <option value="mother">Mother</option>
                      <option value="spouse">Spouse</option>
                      <option value="son">Son</option>
                      <option value="daughter">Daughter</option>
                      <option value="other">Other</option>
                    </select>
                    <button
                      onClick={handleAddMember}
                      className="w-full text-sm font-medium text-white bg-brand-purple rounded-lg py-1.5"
                    >
                      Save
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
