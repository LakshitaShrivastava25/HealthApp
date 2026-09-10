import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User,
  ShieldCheck,
  BellRing,
  LifeBuoy,
  MessageCircle,
  FileText,
  Info,
  ChevronRight,
  Trash2,
  Check,
} from 'lucide-react';
import Topbar from '../components/Topbar';
import { Card, Button } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { authApi, profilesApi } from '../lib/api';

const notBuiltItems = [
  { icon: ShieldCheck, label: 'Security & Privacy' },
  { icon: BellRing, label: 'Notification Preferences' },
];

const supportItems = [
  { icon: LifeBuoy, label: 'Help Center' },
  { icon: MessageCircle, label: 'Contact Support' },
  { icon: FileText, label: 'Terms & Conditions' },
  { icon: ShieldCheck, label: 'Privacy Policy' },
  { icon: Info, label: 'About Us' },
];

export default function Settings() {
  const { logout, activeProfile, refreshProfiles } = useAuth();
  const navigate = useNavigate();

  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState(activeProfile?.full_name || '');
  const [dob, setDob] = useState(activeProfile?.date_of_birth || '');
  const [gender, setGender] = useState(activeProfile?.gender || '');
  const [bloodGroup, setBloodGroup] = useState(activeProfile?.blood_group || '');
  const [heightCm, setHeightCm] = useState(activeProfile?.height_cm?.toString() || '');
  const [weightKg, setWeightKg] = useState(activeProfile?.weight_kg?.toString() || '');
  const [language, setLanguage] = useState(activeProfile?.preferred_language || 'English');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  function startEditing() {
    setFullName(activeProfile?.full_name || '');
    setDob(activeProfile?.date_of_birth || '');
    setGender(activeProfile?.gender || '');
    setBloodGroup(activeProfile?.blood_group || '');
    setHeightCm(activeProfile?.height_cm?.toString() || '');
    setWeightKg(activeProfile?.weight_kg?.toString() || '');
    setLanguage(activeProfile?.preferred_language || 'English');
    setEditing(true);
  }

  async function handleSaveProfile() {
    if (!activeProfile) return;
    setSaving(true);
    try {
      await profilesApi.update(activeProfile.id, {
        full_name: fullName,
        date_of_birth: dob || undefined,
        gender: gender || undefined,
        blood_group: bloodGroup,
        height_cm: heightCm ? Number(heightCm) : undefined,
        weight_kg: weightKg ? Number(weightKg) : undefined,
        preferred_language: language,
      });
      await refreshProfiles();
      setEditing(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  function handleLogout() {
    logout();
    navigate('/patient/login');
  }

  async function handleDeleteAccount() {
    setDeleting(true);
    try {
      await authApi.deleteAccount();
      logout();
      navigate('/patient/login');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <Topbar title="Settings" subtitle="Manage your account and preferences" />

      <main className="p-8 max-w-3xl">
        <Card className="p-5 mb-6">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-semibold text-ink-900 flex items-center gap-2">
              <User size={16} className="text-brand-purple" /> Profile Information
            </p>
            {!editing && (
              <button onClick={startEditing} className="text-xs font-medium text-brand-purple">
                Edit
              </button>
            )}
          </div>

          {!editing ? (
            <div className="mt-3 space-y-1">
              <p className="text-sm text-ink-900">{activeProfile?.full_name}</p>
              <p className="text-xs text-ink-500 capitalize">{activeProfile?.relation}</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-xs text-ink-500">
                <span>Date of birth: {activeProfile?.date_of_birth || '—'}</span>
                <span className="capitalize">Gender: {activeProfile?.gender || '—'}</span>
                <span>Blood group: {activeProfile?.blood_group || '—'}</span>
                <span>Height: {activeProfile?.height_cm ? `${activeProfile.height_cm} cm` : '—'}</span>
                <span>Weight: {activeProfile?.weight_kg ? `${activeProfile.weight_kg} kg` : '—'}</span>
                <span>Language: {activeProfile?.preferred_language || 'English'}</span>
              </div>
              {saved && (
                <p className="text-xs text-success flex items-center gap-1 mt-2">
                  <Check size={12} /> Saved
                </p>
              )}
            </div>
          ) : (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Full name"
                className="text-sm px-3 py-2 rounded-lg border border-border outline-none"
              />
              <input
                type="date"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
                className="text-sm px-3 py-2 rounded-lg border border-border outline-none"
              />
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                className="text-sm px-3 py-2 rounded-lg border border-border outline-none"
              >
                <option value="">Gender</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
              <input
                value={bloodGroup}
                onChange={(e) => setBloodGroup(e.target.value)}
                placeholder="Blood group (e.g. B+)"
                className="text-sm px-3 py-2 rounded-lg border border-border outline-none"
              />
              <input
                type="number"
                value={heightCm}
                onChange={(e) => setHeightCm(e.target.value)}
                placeholder="Height (cm)"
                className="text-sm px-3 py-2 rounded-lg border border-border outline-none"
              />
              <input
                type="number"
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
                placeholder="Weight (kg)"
                className="text-sm px-3 py-2 rounded-lg border border-border outline-none"
              />
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="text-sm px-3 py-2 rounded-lg border border-border outline-none sm:col-span-2"
              >
                <option value="English">English</option>
                <option value="Hindi">Hindi</option>
                <option value="Marathi">Marathi</option>
                <option value="Tamil">Tamil</option>
                <option value="Telugu">Telugu</option>
                <option value="Bengali">Bengali</option>
              </select>

              <div className="flex gap-2 sm:col-span-2">
                <Button onClick={handleSaveProfile} disabled={saving || !fullName.trim()}>
                  {saving ? 'Saving...' : 'Save Changes'}
                </Button>
                <Button variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="p-5">
            <p className="text-sm font-semibold text-ink-900 mb-2">Account</p>
            <p className="text-xs text-ink-500 mb-2">Not built yet — no backend model exists for these.</p>
            <div className="space-y-0.5">
              {notBuiltItems.map(({ icon: Icon, label }) => (
                <button
                  key={label}
                  disabled
                  title="Not yet built — this screen is planned but not implemented"
                  className="w-full flex items-center justify-between px-2 py-3 rounded-lg opacity-60 cursor-not-allowed"
                >
                  <span className="flex items-center gap-3 text-sm font-medium text-ink-700">
                    <Icon size={17} className="text-ink-500" /> {label}
                  </span>
                  <ChevronRight size={15} className="text-ink-500" />
                </button>
              ))}
            </div>

            <div className="mt-4 pt-4 border-t border-border">
              {!confirmingDelete ? (
                <button
                  onClick={() => setConfirmingDelete(true)}
                  className="flex items-center gap-1.5 text-xs font-medium text-danger hover:text-danger/80"
                >
                  <Trash2 size={13} /> Delete Account
                </button>
              ) : (
                <div className="bg-danger-bg rounded-lg p-3">
                  <p className="text-xs text-danger font-medium mb-2">
                    Delete your account? This deactivates it immediately — you won't be able to log
                    back in. Your medical records are not erased and can be restored by contacting support.
                  </p>
                  <div className="flex gap-2">
                    <Button variant="danger" onClick={handleDeleteAccount} disabled={deleting}>
                      <Trash2 size={13} /> {deleting ? 'Deleting...' : 'Yes, delete my account'}
                    </Button>
                    <Button variant="ghost" onClick={() => setConfirmingDelete(false)} disabled={deleting}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </Card>

          <Card className="p-5">
            <p className="text-sm font-semibold text-ink-900 mb-2">Support & Legal</p>
            <div className="space-y-0.5">
              {supportItems.map(({ icon: Icon, label }) => (
                <button
                  key={label}
                  disabled
                  title="Not yet built — this screen is planned but not implemented"
                  className="w-full flex items-center justify-between px-2 py-3 rounded-lg opacity-60 cursor-not-allowed"
                >
                  <span className="flex items-center gap-3 text-sm font-medium text-ink-700">
                    <Icon size={17} className="text-ink-500" /> {label}
                  </span>
                  <ChevronRight size={15} className="text-ink-500" />
                </button>
              ))}
            </div>
          </Card>
        </div>

        <Button variant="danger" className="w-full mt-6 justify-center py-3" onClick={handleLogout}>
          Logout
        </Button>
      </main>
    </>
  );
}
