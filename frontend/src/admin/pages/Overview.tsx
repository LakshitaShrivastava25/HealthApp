import { useEffect, useState } from 'react';
import { FileText, ShieldCheck, Stethoscope, Users, ArrowRight, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Topbar from '../components/Topbar';
import { Card } from '../components/ui';
import { adminApi } from '../lib/api';
import { useAuth } from '../context/AuthContext';

type Summary = {
  total_users: number;
  documents_needing_review: number;
  policies_needing_review: number;
  doctor_verification_queue: number;
};

const tones = {
  purple: { bg: 'bg-accent-soft', text: 'text-accent-ink', ring: 'hover:ring-accent/30' },
  teal: { bg: 'bg-teal-50', text: 'text-brand-teal', ring: 'hover:ring-brand-teal/30' },
  warning: { bg: 'bg-warning-bg', text: 'text-warning', ring: 'hover:ring-warning/30' },
  danger: { bg: 'bg-danger-bg', text: 'text-danger', ring: 'hover:ring-danger/30' },
};

export default function Overview() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const navigate = useNavigate();
  const { staff } = useAuth();

  function formatPhone(phone?: string) {
    if (!phone) return '';
    // +919876500099 -> +91 98765 00099
    const match = phone.match(/^(\+\d+?)(\d{5})(\d{5})$/);
    return match ? `${match[1]} ${match[2]} ${match[3]}` : phone;
  }

  useEffect(() => {
    adminApi.dashboardSummary().then((r) => setSummary(r.data));
  }, []);

  const tiles = [
    { label: 'Total Patients', value: summary?.total_users, icon: Users, href: '/accounts', tone: 'purple' as const },
    { label: 'Documents Needing Review', value: summary?.documents_needing_review, icon: FileText, href: '/documents', tone: 'teal' as const },
    { label: 'Policies Needing Review', value: summary?.policies_needing_review, icon: ShieldCheck, href: '/insurance-policies', tone: 'warning' as const },
    { label: 'Doctors Awaiting Verification', value: summary?.doctor_verification_queue, icon: Stethoscope, href: '/doctor-verification', tone: 'danger' as const },
  ];

  const pendingTotal =
    (summary?.documents_needing_review || 0) + (summary?.policies_needing_review || 0) + (summary?.doctor_verification_queue || 0);

  return (
    <>
      <Topbar title="Overview" subtitle="Platform status at a glance" />
      <main className="p-4 sm:p-6 lg:p-8 space-y-6">
        <Card className="!bg-gradient-to-br from-brand-teal to-brand-purple !border-0 text-white p-6 flex items-center justify-between overflow-hidden relative">
          <div className="relative z-10">
            <div className="flex items-center gap-2 text-sm font-medium opacity-90 mb-2">
              <Sparkles size={16} /> Welcome back{staff?.phone_number ? `, ${formatPhone(staff.phone_number)}` : ''}
            </div>
            <p className="text-2xl font-bold">
              {pendingTotal === 0 ? "You're all caught up 🎉" : `${pendingTotal} item${pendingTotal === 1 ? '' : 's'} need your attention`}
            </p>
            <p className="text-sm opacity-80 mt-1">
              {pendingTotal === 0 ? 'Nothing pending across documents, policies, or doctor verification.' : 'Review queues below to keep things moving.'}
            </p>
          </div>
          <div className="w-24 h-24 rounded-full bg-white/10 flex items-center justify-center shrink-0 relative z-10">
            <ShieldCheck size={40} className="opacity-90" />
          </div>
          <div className="absolute -right-6 -bottom-10 w-40 h-40 rounded-full bg-white/5" />
          <div className="absolute right-16 -top-8 w-24 h-24 rounded-full bg-white/5" />
        </Card>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {tiles.map((t) => {
            const tone = tones[t.tone];
            return (
              <Card
                key={t.label}
                className={`p-5 cursor-pointer transition-all hover:shadow-lg hover:-translate-y-0.5 hover:ring-2 ${tone.ring} group`}
                onClick={() => navigate(t.href)}
              >
                <div className="flex items-start justify-between">
                  <div className={`w-11 h-11 rounded-xl ${tone.bg} ${tone.text} flex items-center justify-center mb-3`}>
                    <t.icon size={20} />
                  </div>
                  <ArrowRight size={15} className="text-ink-300 group-hover:text-ink-500 group-hover:translate-x-0.5 transition-all mt-1" />
                </div>
                <p className="text-3xl font-bold text-ink-900">{t.value ?? '—'}</p>
                <p className="text-xs text-ink-500 mt-1 font-medium">{t.label}</p>
              </Card>
            );
          })}
        </div>
      </main>
    </>
  );
}
