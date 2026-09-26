import {
  ActivityIcon,
  BellIcon,
  ClipboardListIcon,
  FolderIcon,
  GridIcon,
  InsuranceIcon,
  MedicineIcon,
  PersonIcon,
  SettingsIcon,
  UsersIcon,
} from './icons'

const sidebarItems = [
  { icon: GridIcon, label: 'Dashboard', active: true },
  { icon: FolderIcon, label: 'Medical Locker' },
  { icon: ClipboardListIcon, label: 'Prescriptions' },
  { icon: InsuranceIcon, label: 'Insurance' },
  { icon: MedicineIcon, label: 'Medicines' },
  { icon: ActivityIcon, label: 'Health Timeline' },
  { icon: PersonIcon, label: 'Doctors' },
  { icon: UsersIcon, label: 'Family' },
]

const records = [
  { label: 'Blood Test Report', meta: 'Dr. Mehta · 2 days ago' },
  { label: 'X-Ray — Left Wrist', meta: 'Apollo Clinic · 5 days ago' },
  { label: 'Annual Checkup', meta: 'Dr. Sharma · 1 week ago' },
]

/** Small circular gauge used in the "Health Score" stat card. */
function HealthGauge() {
  const radius = 15.5
  const circumference = 2 * Math.PI * radius
  const progress = 0.82

  return (
    <svg viewBox="0 0 36 36" className="h-11 w-11 -rotate-90">
      <circle cx="18" cy="18" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="3.5" />
      <circle
        cx="18"
        cy="18"
        r={radius}
        fill="none"
        stroke="#2563eb"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - progress)}
      />
    </svg>
  )
}

function TimelineChart() {
  return (
    <svg viewBox="0 0 200 56" className="h-14 w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="timelineFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2563eb" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#2563eb" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d="M0 40 L28 32 L56 38 L84 18 L112 26 L140 12 L168 20 L200 8 L200 56 L0 56 Z"
        fill="url(#timelineFill)"
      />
      <path
        d="M0 40 L28 32 L56 38 L84 18 L112 26 L140 12 L168 20 L200 8"
        fill="none"
        stroke="#2563eb"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default function DashboardMockup() {
  return (
    <div
      className="w-[520px] overflow-hidden rounded-2xl border border-slate-200/70 bg-white will-change-transform"
      style={{
        transform: 'perspective(1800px) rotateY(-6deg) rotateZ(-3deg)',
        transformOrigin: 'center center',
        boxShadow:
          '0 45px 90px -25px rgba(37, 99, 235, 0.32), 0 20px 45px -15px rgba(15, 23, 42, 0.18)',
      }}
    >
      {/* browser chrome */}
      <div className="flex items-center gap-1.5 border-b border-slate-100 px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-rose-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
        <span className="ml-3 rounded-full bg-slate-50 px-3 py-1 text-[10px] font-medium text-slate-400">
          app.healthnow.in/dashboard
        </span>
      </div>

      <div className="flex">
        {/* sidebar */}
        <div className="flex w-14 flex-col items-center gap-2 border-r border-slate-100 bg-slate-50/60 py-4">
          {sidebarItems.map((item) => (
            <span
              key={item.label}
              title={item.label}
              className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                item.active ? 'bg-brand text-white' : 'text-slate-400'
              }`}
            >
              <item.icon className="h-4 w-4" strokeWidth={1.9} />
            </span>
          ))}
          <span className="mt-auto flex h-9 w-9 items-center justify-center rounded-lg text-slate-300">
            <SettingsIcon className="h-4 w-4" strokeWidth={1.9} />
          </span>
        </div>

        {/* main content */}
        <div className="flex-1 space-y-4 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-ink">Good Morning, Aditi 👋</p>
              <p className="text-[11px] text-body">Here&apos;s your family&apos;s health overview</p>
            </div>
            <span className="h-8 w-8 rounded-full bg-brand-light" />
          </div>

          {/* stat cards */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
              <div className="flex items-center gap-2">
                <HealthGauge />
                <div>
                  <p className="text-sm font-bold text-ink">82</p>
                  <p className="text-[9px] leading-tight text-body">Health Score</p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-light text-accent-dark">
                <BellIcon className="h-3.5 w-3.5" strokeWidth={1.9} />
              </span>
              <p className="mt-2 text-sm font-bold text-ink">3 Reminders</p>
              <p className="text-[9px] leading-tight text-body">Due today</p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-light text-brand">
                <InsuranceIcon className="h-3.5 w-3.5" strokeWidth={1.9} />
              </span>
              <p className="mt-2 text-sm font-bold text-ink">2 Plans</p>
              <p className="text-[9px] leading-tight text-body">Active insurance</p>
            </div>
          </div>

          <div className="grid grid-cols-5 gap-4">
            {/* recent records */}
            <div className="col-span-3 rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold text-ink">Recent Records</p>
                <p className="text-[10px] font-medium text-brand">View all</p>
              </div>
              <div className="divide-y divide-slate-50">
                {records.map((record) => (
                  <div key={record.label} className="flex items-center gap-2 py-1.5 first:pt-0 last:pb-0">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-50 text-slate-400">
                      <FolderIcon className="h-3 w-3" strokeWidth={1.9} />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[10.5px] font-medium text-ink">{record.label}</p>
                      <p className="truncate text-[9px] text-body">{record.meta}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* timeline chart */}
            <div className="col-span-2 rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
              <div className="mb-1 flex items-center gap-1.5">
                <ActivityIcon className="h-3 w-3 text-brand" strokeWidth={2} />
                <p className="text-[10.5px] font-semibold text-ink">Health Timeline</p>
              </div>
              <TimelineChart />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
