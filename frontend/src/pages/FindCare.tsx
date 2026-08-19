import { useEffect, useState } from 'react';
import { Search, Star } from 'lucide-react';
import Topbar from '../components/Topbar';
import { Card } from '../components/ui';
import { doctorsApi } from '../lib/api';

type Doctor = {
  id: string;
  full_name: string;
  specialization: string;
  experience_years: number;
  verification_status: string;
  clinic_name: string;
};

export default function FindCare() {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    doctorsApi.list().then((r) => {
      const list: Doctor[] = r.data.results ?? r.data;
      setDoctors(list.filter((d) => d.verification_status === 'verified'));
    });
  }, []);

  const filtered = doctors.filter(
    (d) =>
      d.full_name.toLowerCase().includes(query.toLowerCase()) ||
      d.specialization.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <>
      <Topbar title="Find Care" subtitle="Find the right doctor near you" />

      <main className="p-8">
        <div className="relative mb-6 max-w-lg">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-300" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search doctors, specialties..."
            className="w-full pl-9 pr-3 py-2.5 text-sm rounded-lg border border-border bg-card outline-none focus:ring-2 focus:ring-brand-purple/30"
          />
        </div>

        {filtered.length === 0 && (
          <Card className="p-10 text-center text-sm text-ink-500">
            No verified doctors on the platform yet — this list populates once doctors register and
            an admin approves them in the Admin Portal.
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {filtered.map((d) => (
            <Card key={d.id} className="p-4">
              <div className="w-12 h-12 rounded-full bg-brand-lavender text-brand-purple flex items-center justify-center font-semibold mb-3">
                {d.full_name.split(' ').slice(-1)[0][0]}
              </div>
              <p className="text-sm font-semibold text-ink-900">{d.full_name}</p>
              <p className="text-xs text-ink-500 mt-0.5">{d.specialization}</p>
              <p className="text-xs text-ink-300 mt-0.5">{d.experience_years}+ Years Exp.</p>
              {d.clinic_name && <p className="text-xs text-ink-300 mt-0.5">{d.clinic_name}</p>}
              <div className="flex items-center gap-1 mt-2">
                <Star size={13} className="text-warning fill-warning" />
                <span className="text-xs text-ink-500">Not yet rated</span>
              </div>
            </Card>
          ))}
        </div>
      </main>
    </>
  );
}
