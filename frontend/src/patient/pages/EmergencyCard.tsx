import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { RefreshCcw, ShieldCheck, ShieldOff, Download, Share2, Printer, Droplet, AlertTriangle, Pill, Phone, Check } from 'lucide-react';
import Topbar from '../components/Topbar';
import { Card, Button, Badge } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { emergencyApi, allergiesApi, medicinesApi } from '../lib/api';
import PhoneInput, { usePhoneInput } from '@shared/components/PhoneInput';
import { API_BASE_URL } from '@shared/apiConfig';

type EmergencyProfile = {
  id: string;
  public_token: string;
  is_active: boolean;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  include_blood_group: boolean;
  include_allergies: boolean;
  include_medications: boolean;
  include_emergency_contact: boolean;
};

type ToggleKey = 'include_blood_group' | 'include_allergies' | 'include_medications' | 'include_emergency_contact';

export default function EmergencyCard() {
  const { activeProfile } = useAuth();
  const [ep, setEp] = useState<EmergencyProfile | null>(null);
  const [contactName, setContactName] = useState('');
  const { country, setCountry, digits, setDigits, isComplete, fullNumber } = usePhoneInput();
  const [creating, setCreating] = useState(false);
  const [shareStatus, setShareStatus] = useState('');
  const [toggleSaved, setToggleSaved] = useState(false);
  const [toggleError, setToggleError] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [allergies, setAllergies] = useState<string[]>([]);
  const [medications, setMedications] = useState<string[]>([]);

  async function load() {
    if (!activeProfile) return;
    const { data } = await emergencyApi.list(activeProfile.id);
    const list = data.results ?? data;
    setEp(list[0] || null);
  }

  async function loadMedicalSummary() {
    if (!activeProfile) return;
    const [allergyRes, medRes] = await Promise.all([
      allergiesApi.list(activeProfile.id),
      medicinesApi.list(activeProfile.id),
    ]);
    const allergyList = allergyRes.data.results ?? allergyRes.data;
    const medList = medRes.data.results ?? medRes.data;
    setAllergies(allergyList.map((a: { substance: string }) => a.substance));
    setMedications(medList.map((m: { name: string }) => m.name));
  }

  useEffect(() => {
    load();
    loadMedicalSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProfile]);

  const publicUrl = ep ? `${API_BASE_URL}/public/emergency/${ep.public_token}/` : '';

  useEffect(() => {
    if (!ep || !ep.is_active || !canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, publicUrl, { width: 160, margin: 1 }, (err) => {
      if (err) console.error('QR generation failed:', err);
    });
  }, [ep, publicUrl]);

  async function handleCreate() {
    if (!activeProfile) return;
    setCreating(true);
    try {
      await emergencyApi.create(activeProfile.id, contactName, fullNumber);
      await load();
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke() {
    if (!ep) return;
    await emergencyApi.revoke(ep.id);
    await load();
  }

  async function handleRegenerate() {
    if (!ep) return;
    await emergencyApi.regenerate(ep.id);
    await load();
  }

  async function handleToggle(key: ToggleKey) {
    if (!ep) return;
    const previousValue = ep[key];
    const newValue = !previousValue;
    setEp({ ...ep, [key]: newValue }); // optimistic
    setToggleError('');
    try {
      await emergencyApi.update(ep.id, { [key]: newValue });
      setToggleSaved(true);
      setTimeout(() => setToggleSaved(false), 1800);
    } catch {
      // Revert — without this, a failed save would leave the switch
      // showing the new position while the server still holds the old
      // value, with nothing on screen to indicate the mismatch.
      setEp((current) => (current ? { ...current, [key]: previousValue } : current));
      setToggleSaved(false); // otherwise a success right before this failure could leave "Saved" showing alongside the error for the rest of its timer
      setToggleError("Couldn't save that change. Check your connection and try again.");
    }
  }

  function handleDownload() {
    if (!canvasRef.current) return;
    const link = document.createElement('a');
    link.download = 'emergency-qr.png';
    link.href = canvasRef.current.toDataURL('image/png');
    link.click();
  }

  async function handleShare() {
    if (!ep) return;
    const shareData = {
      title: 'Emergency Health Card',
      text: 'Scan this to see my emergency medical information.',
      url: publicUrl,
    };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        // user cancelled the share sheet — not an error
      }
    } else {
      await navigator.clipboard.writeText(publicUrl);
      setShareStatus('Link copied to clipboard');
      setTimeout(() => setShareStatus(''), 2500);
    }
  }

  function handlePrint() {
    window.print();
  }

  return (
    <>
      <Topbar title="Emergency Health Card" subtitle="Show this QR in any medical emergency" />

      <main className="p-8">
        {!ep ? (
          <Card className="p-6 max-w-lg">
            <p className="text-sm font-semibold text-ink-900 mb-1">Set up your Emergency Card</p>
            <p className="text-xs text-ink-500 mb-4">
              This generates a QR that reveals only what you choose below to anyone who scans it —
              no login required. You control exactly what's shown.
            </p>
            <input
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="Emergency contact name"
              className="w-full text-sm px-3 py-2 rounded-lg border border-border outline-none mb-2"
            />
            <div className="mb-4">
              <PhoneInput country={country} onCountryChange={setCountry} digits={digits} onDigitsChange={setDigits} />
            </div>
            <Button onClick={handleCreate} disabled={creating || !contactName || !isComplete}>
              {creating ? 'Creating...' : 'Generate Emergency QR'}
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-4xl">
            <Card className="p-6 print-area">
              <div className="flex flex-col sm:flex-row gap-6">
                <div className="w-40 h-40 rounded-xl border border-border bg-surface flex items-center justify-center shrink-0 mx-auto sm:mx-0 overflow-hidden">
                  {ep.is_active ? (
                    <canvas ref={canvasRef} />
                  ) : (
                    <p className="text-xs text-ink-300 text-center px-3">QR revoked — reactivate to generate a new one</p>
                  )}
                </div>

                <div className="flex-1">
                  <Badge tone={ep.is_active ? 'success' : 'danger'}>{ep.is_active ? 'Active' : 'Revoked'}</Badge>
                  <p className="text-sm font-semibold text-ink-900 mt-3">{activeProfile?.full_name}</p>

                  {ep.include_blood_group && activeProfile?.blood_group && (
                    <div className="mt-2">
                      <p className="text-xs text-ink-500">Blood Group</p>
                      <p className="text-sm font-semibold text-danger mt-0.5">{activeProfile.blood_group}</p>
                    </div>
                  )}

                  {ep.include_allergies && allergies.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs text-ink-500">Allergies</p>
                      <p className="text-sm font-semibold text-warning mt-0.5">{allergies.join(', ')}</p>
                    </div>
                  )}

                  {ep.include_medications && medications.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs text-ink-500">Current Medications</p>
                      <p className="text-sm font-semibold text-ink-900 mt-0.5">{medications.join(', ')}</p>
                    </div>
                  )}

                  {ep.include_emergency_contact && (
                    <div className="mt-2">
                      <p className="text-xs text-ink-500">Emergency Contact</p>
                      <p className="text-sm font-semibold text-ink-900 mt-0.5">
                        {ep.emergency_contact_name} · {ep.emergency_contact_phone}
                      </p>
                    </div>
                  )}
                  <div className="mt-3">
                    <p className="text-xs text-ink-500">Public URL (what a scanner opens)</p>
                    <p className="text-xs text-ink-500 mt-0.5 break-all">{publicUrl}</p>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 mt-6 pt-6 border-t border-border print:hidden">
                {ep.is_active && (
                  <>
                    <Button onClick={handleDownload}>
                      <Download size={16} /> Download
                    </Button>
                    <Button variant="ghost" onClick={handleShare}>
                      <Share2 size={16} /> Share
                    </Button>
                    <Button variant="ghost" onClick={handlePrint}>
                      <Printer size={16} /> Print
                    </Button>
                  </>
                )}
                <Button variant="ghost" onClick={handleRegenerate}>
                  <RefreshCcw size={16} /> Regenerate
                </Button>
                {ep.is_active ? (
                  <Button variant="danger" onClick={handleRevoke}>
                    <ShieldOff size={16} /> Revoke
                  </Button>
                ) : (
                  <Button variant="secondary" onClick={handleRegenerate}>
                    <ShieldCheck size={16} /> Reactivate (new QR)
                  </Button>
                )}
                {shareStatus && <span className="text-xs text-success">{shareStatus}</span>}
              </div>
            </Card>

            <Card className="p-6">
              <p className="text-sm font-semibold text-ink-900 mb-1">What's Included</p>
              <p className="text-xs text-ink-500 mb-4">
                Exactly what a scanner sees — toggle any item off to leave it out of the public card.
              </p>

              <div className="space-y-4">
                <IncludeRow
                  icon={<Droplet size={16} className="text-danger" />}
                  title="Blood Group"
                  detail={activeProfile?.blood_group || 'Not on file'}
                  checked={ep.include_blood_group}
                  onChange={() => handleToggle('include_blood_group')}
                />
                <IncludeRow
                  icon={<AlertTriangle size={16} className="text-warning" />}
                  title="Allergies"
                  detail={allergies.length > 0 ? allergies.join(', ') : 'None on file'}
                  checked={ep.include_allergies}
                  onChange={() => handleToggle('include_allergies')}
                />
                <IncludeRow
                  icon={<Pill size={16} className="text-info" />}
                  title="Current Medications"
                  detail={medications.length > 0 ? medications.join(', ') : 'None on file'}
                  checked={ep.include_medications}
                  onChange={() => handleToggle('include_medications')}
                />
                <IncludeRow
                  icon={<Phone size={16} className="text-success" />}
                  title="Emergency Contact"
                  detail={`${ep.emergency_contact_name} · ${ep.emergency_contact_phone}`}
                  checked={ep.include_emergency_contact}
                  onChange={() => handleToggle('include_emergency_contact')}
                />
              </div>

              {toggleSaved && <p className="text-xs text-success mt-4 flex items-center gap-1"><Check size={12} /> Saved</p>}
              {toggleError && <p className="text-xs text-danger mt-4">{toggleError}</p>}
            </Card>
          </div>
        )}
      </main>
    </>
  );
}

function IncludeRow({
  icon,
  title,
  detail,
  checked,
  onChange,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <div className={`flex items-start justify-between transition-opacity ${checked ? '' : 'opacity-40'}`}>
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 shrink-0">{icon}</span>
        <div>
          <p className="text-sm font-medium text-ink-900">{title}</p>
          <p className="text-xs text-ink-500">{detail}</p>
          {!checked && <p className="text-[11px] text-ink-300 mt-0.5 italic">Hidden from card</p>}
        </div>
      </div>
      <ToggleSwitch checked={checked} onChange={onChange} />
    </div>
  );
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      className={`w-10 h-6 rounded-full relative transition-colors shrink-0 ${checked ? 'bg-brand-purple' : 'bg-border'}`}
    >
      <span
        className={`absolute top-0.5 w-5 h-5 rounded-full bg-white flex items-center justify-center transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      >
        {checked && <Check size={11} className="text-brand-purple" />}
      </span>
    </button>
  );
}
