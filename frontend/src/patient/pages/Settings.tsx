import { useEffect, useState } from 'react';
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
  ShieldAlert,
} from 'lucide-react';
import Topbar from '../components/Topbar';
import { Card, Button } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { allergiesApi, authApi, profilesApi } from '../lib/api';
import { todayIso } from '@shared/dates';

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

type Allergy = { id: string; kind: string; substance: string; reaction: string };

/** AllergyRecord.Kind, for the little tag beside each substance. */
const ALLERGY_KIND_LABELS: Record<string, string> = {
  drug: 'Drug',
  food: 'Food',
  environmental: 'Environmental',
  other: 'Other',
};

/** "prefer_not_to_say" -> "Prefer not to say"; "male" -> "Male"; "" -> "—". */
function genderLabel(gender?: string) {
  if (!gender) return '—';
  const words = gender.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export default function Settings() {
  const { logout, activeProfile, refreshProfiles } = useAuth();

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

  /**
   * Allergies live in their own table (AllergyRecord, one row per substance)
   * rather than on Profile, so they need their own fetch — the profile
   * object in AuthContext does not carry them.
   *
   * Refetched per profile: switching family members from the header must not
   * leave the previous person's allergies on screen, which on a medical
   * record is worse than showing none at all.
   */
  const [allergies, setAllergies] = useState<Allergy[]>([]);
  const [allergiesLoaded, setAllergiesLoaded] = useState(false);

  useEffect(() => {
    if (!activeProfile) return;
    let cancelled = false;
    setAllergiesLoaded(false);
    allergiesApi
      .list(activeProfile.id)
      .then((r) => {
        if (cancelled) return;
        setAllergies((r.data.results ?? r.data) as Allergy[]);
        setAllergiesLoaded(true);
      })
      .catch(() => {
        // A failed fetch must not be rendered as "no known allergies" —
        // allergiesLoaded stays false so the card says nothing either way.
        if (!cancelled) setAllergies([]);
      });
    return () => {
      cancelled = true;
    };
  }, [activeProfile]);

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
    window.location.assign('/');
  }

  async function handleDeleteAccount() {
    setDeleting(true);
    try {
      await authApi.deleteAccount();
      logout();
      window.location.assign('/');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <Topbar title="Settings" subtitle="Manage your account and preferences" />

      <main className="p-4 sm:p-6 lg:p-8 max-w-3xl">
        <Card className="p-5 mb-6">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-semibold text-ink-900 flex items-center gap-2">
              <User size={16} className="text-accent-ink" /> Profile Information
            </p>
            {!editing && (
              <button onClick={startEditing} className="text-xs font-medium text-accent-ink">
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
                {/* Sentence case, not `capitalize`: the stored value is
                    snake_case, and per-word capitalisation turns
                    prefer_not_to_say into "Prefer Not To Say". */}
                <span>Gender: {genderLabel(activeProfile?.gender)}</span>
                <span>Blood group: {activeProfile?.blood_group || '—'}</span>
                <span>Height: {activeProfile?.height_cm ? `${activeProfile.height_cm} cm` : '—'}</span>
                <span>Weight: {activeProfile?.weight_kg ? `${activeProfile.weight_kg} kg` : '—'}</span>
                <span>Language: {activeProfile?.preferred_language || 'English'}</span>
              </div>

              <div className="mt-3 border-t border-border pt-3">
                <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-500">
                  <ShieldAlert size={12} className="text-warning" /> Allergies
                </p>
                {!allergiesLoaded ? (
                  <p className="text-xs text-ink-300">Loading…</p>
                ) : allergies.length === 0 ? (
                  <p className="text-xs text-ink-500">None recorded.</p>
                ) : (
                  <ul className="space-y-1">
                    {allergies.map((a) => (
                      <li key={a.id} className="flex flex-wrap items-baseline gap-x-2 text-xs">
                        <span className="font-medium text-ink-900">{a.substance}</span>
                        <span className="rounded-full bg-surface px-1.5 py-0.5 text-[10px] text-ink-500">
                          {ALLERGY_KIND_LABELS[a.kind] || a.kind}
                        </span>
                        {a.reaction && <span className="text-ink-500">— {a.reaction}</span>}
                      </li>
                    ))}
                  </ul>
                )}
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
              {/* Capped at today, matching the signup form and the
                  add-family-member form. The server rejects a future date
                  of birth as well, so an uncapped picker here would only
                  produce a rejected save. */}
              <input
                type="date"
                max={todayIso()}
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
                {/* Profile.Gender's fourth choice. Omitting it meant anyone
                    who had picked it elsewhere saw a blank gender here, and
                    silently lost it on the next save. */}
                <option value="prefer_not_to_say">Prefer not to say</option>
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
                    <Icon size={16} className="text-ink-500" /> {label}
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
                    <Icon size={16} className="text-ink-500" /> {label}
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
