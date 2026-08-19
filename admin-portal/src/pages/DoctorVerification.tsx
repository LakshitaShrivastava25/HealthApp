import { useEffect, useState } from 'react';
import { Stethoscope, Check, X } from 'lucide-react';
import Topbar from '../components/Topbar';
import { Card, Badge, Button, EmptyState } from '../components/ui';
import { adminApi } from '../lib/api';

type Doctor = {
  id: string;
  full_name: string;
  specialization: string;
  qualification: string;
  verification_status: string;
  license_document: string | null;
};

export default function DoctorVerification() {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    adminApi.doctorVerification().then((r) => {
      const list: Doctor[] = r.data.results ?? r.data;
      setDoctors(list.filter((d) => d.verification_status === 'pending'));
    });
  }

  useEffect(load, []);

  async function handleApprove(id: string) {
    setBusyId(id);
    try {
      await adminApi.approveDoctor(id);
      load();
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(id: string) {
    setBusyId(id);
    try {
      await adminApi.rejectDoctor(id);
      load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <Topbar title="Doctor Verification" subtitle="Doctors awaiting approval before they can access the Doctor Portal" />
      <main className="p-8">
        {doctors.length === 0 ? (
          <Card>
            <EmptyState icon={<Stethoscope size={22} />} title="Queue is clear" note="No doctors currently awaiting verification." />
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {doctors.map((d) => (
              <Card key={d.id} className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-sm font-semibold text-ink-900">Dr. {d.full_name}</p>
                    <p className="text-xs text-ink-500">{d.specialization}</p>
                    <p className="text-xs text-ink-300 mt-0.5">{d.qualification}</p>
                  </div>
                  <Badge tone="warning">pending</Badge>
                </div>
                {d.license_document ? (
                  <a href={d.license_document} target="_blank" rel="noreferrer" className="text-xs text-brand-purple">
                    View license document →
                  </a>
                ) : (
                  <p className="text-xs text-ink-300">No license document uploaded</p>
                )}
                <div className="flex gap-2 mt-4">
                  <Button onClick={() => handleApprove(d.id)} disabled={busyId === d.id}>
                    <Check size={15} /> Approve
                  </Button>
                  <Button variant="danger" onClick={() => handleReject(d.id)} disabled={busyId === d.id}>
                    <X size={15} /> Reject
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
