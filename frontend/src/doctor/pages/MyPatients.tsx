import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, ArrowRight, Clock3, CalendarClock } from 'lucide-react';
import Topbar from '../components/Topbar';
import { Card, Badge, EmptyState, Button } from '../components/ui';
import { accessApi, api, doctorApi } from '../lib/api';
import ClinicAvailability, { type Availability } from '../components/ClinicAvailability';

type Grant = {
  id: string;
  profile: string;
  status: string;
  requested_at: string;
  responded_at: string | null;
};

export default function MyPatients() {
  const [grants, setGrants] = useState<Grant[]>([]);
  const [profileNames, setProfileNames] = useState<Record<string, string>>({});
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [editingAvailability, setEditingAvailability] = useState(false);
  const navigate = useNavigate();

  async function load() {
    const { data } = await accessApi.list();
    const list: Grant[] = data.results ?? data;
    setGrants(list);
  }

  useEffect(() => {
    load();
    // The doctor's own record, for the availability panel's current values.
    doctorApi.me().then((r) =>
      setAvailability({
        available_days: r.data.available_days,
        clinic_open_time: r.data.clinic_open_time,
        clinic_close_time: r.data.clinic_close_time,
      })
    );
  }, []);

  useEffect(() => {
    // Profile names come from GET /api/profiles/ — the backend now includes
    // any profile the doctor has an APPROVED grant for, so this list is
    // exactly the patients whose names we're allowed to know.
    api.get('/profiles/').then((r) => {
      const list = r.data.results ?? r.data;
      const map: Record<string, string> = {};
      list.forEach((p: { id: string; full_name: string }) => {
        map[p.id] = p.full_name;
      });
      setProfileNames(map);
    });
  }, [grants]);

  const approved = grants.filter((g) => g.status === 'approved');
  const pending = grants.filter((g) => g.status === 'pending');

  return (
    <>
      <Topbar
        title="My Patients"
        subtitle="Patients who have approved your access"
        action={
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => setEditingAvailability((v) => !v)}>
              <CalendarClock size={15} /> Clinic Availability
            </Button>
            <Button onClick={() => navigate('/doctor/request-access')}>Request Access</Button>
          </div>
        }
      />
      <main className="p-4 sm:p-6 lg:p-8 space-y-6">
        {editingAvailability && availability && (
          <ClinicAvailability
            current={availability}
            onSaved={setAvailability}
            onClose={() => setEditingAvailability(false)}
          />
        )}
        {pending.length > 0 && (
          <div>
            <p className="text-sm font-semibold text-ink-700 mb-3 flex items-center gap-1.5">
              <Clock3 size={15} className="text-warning" /> Awaiting patient response
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {pending.map((g) => (
                <Card key={g.id} className="p-4">
                  <p className="text-sm font-medium text-ink-900">{profileNames[g.profile] || 'Patient'}</p>
                  <Badge tone="warning">pending patient approval</Badge>
                </Card>
              ))}
            </div>
          </div>
        )}

        <div>
          <p className="text-sm font-semibold text-ink-700 mb-3">Approved patients</p>
          {approved.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Users size={22} />}
                title="No patients yet"
                note="Request access to a patient's records — they'll need to approve it from their app before you can view anything."
              />
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {approved.map((g) => (
                <button key={g.id} onClick={() => navigate(`/doctor/patients/${g.profile}`)} className="text-left">
                  <Card interactive className="p-4 hover:border-accent transition-colors flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-ink-900">{profileNames[g.profile] || 'Patient'}</p>
                      <Badge tone="success">approved</Badge>
                    </div>
                    <ArrowRight size={16} className="text-ink-300" />
                  </Card>
                </button>
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
