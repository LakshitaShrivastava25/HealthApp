import {
  ActivityIcon,
  FolderIcon,
  GridIcon,
  InsuranceIcon,
  MedicineIcon,
  PersonIcon,
  UsersIcon,
} from './icons'

const quickAccess = [
  { icon: FolderIcon, label: 'Records' },
  { icon: InsuranceIcon, label: 'Insurance' },
  { icon: MedicineIcon, label: 'Medicines' },
  { icon: PersonIcon, label: 'Doctors' },
  { icon: ActivityIcon, label: 'Timeline' },
  { icon: UsersIcon, label: 'Family' },
]

const tabs = [GridIcon, FolderIcon, MedicineIcon, PersonIcon]

interface PhoneMockupProps {
  className?: string
  /** Leans the phone out of the browser mockup's corner with a subtle 3D tilt. */
  tilted?: boolean
}

export default function PhoneMockup({ className = '', tilted = false }: PhoneMockupProps) {
  return (
    <div
      className={`aspect-[9/19.5] w-[128px] shrink-0 rounded-[1.6rem] border-[5px] border-slate-900 bg-white will-change-transform ${className}`}
      style={
        tilted
          ? {
              transform: 'perspective(1200px) rotateY(-6deg) rotateZ(4deg)',
              transformOrigin: 'bottom right',
              boxShadow: '0 25px 45px -12px rgba(15, 23, 42, 0.35)',
            }
          : { boxShadow: '0 25px 45px -12px rgba(15, 23, 42, 0.35)' }
      }
    >
      <div className="flex h-full flex-col overflow-hidden rounded-[1.15rem] bg-white">
        {/* notch */}
        <div className="flex shrink-0 justify-center pb-1 pt-1.5">
          <span className="h-1.5 w-8 rounded-full bg-slate-900/80" />
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-hidden px-2.5 pb-1.5">
          <div>
            <p className="text-[9px] font-semibold text-ink">Good Morning 👋</p>
            <p className="text-[6.5px] text-body">Family health overview</p>
          </div>

          {/* mini stat row */}
          <div className="flex gap-1.5">
            <div className="flex-1 rounded-lg border border-slate-100 bg-white p-1.5 shadow-sm">
              <p className="text-[9px] font-bold text-brand">82</p>
              <p className="text-[5.5px] leading-tight text-body">Health Score</p>
            </div>
            <div className="flex-1 rounded-lg border border-slate-100 bg-white p-1.5 shadow-sm">
              <p className="text-[9px] font-bold text-accent-dark">3</p>
              <p className="text-[5.5px] leading-tight text-body">Reminders</p>
            </div>
          </div>

          {/* quick access grid */}
          <div className="grid grid-cols-3 gap-1">
            {quickAccess.map((item) => (
              <div
                key={item.label}
                className="flex flex-col items-center gap-0.5 rounded-lg bg-brand-light/50 py-1"
              >
                <item.icon className="h-2.5 w-2.5 text-brand" strokeWidth={2} />
                <span className="text-[5px] font-medium text-brand-dark">{item.label}</span>
              </div>
            ))}
          </div>

          {/* recent records mini list */}
          <div className="space-y-1 rounded-lg border border-slate-100 p-1.5">
            <p className="text-[6px] font-semibold text-ink">Recent Records</p>
            <div className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 shrink-0 rounded bg-slate-100" />
              <p className="truncate text-[5.5px] text-body">Blood Test · 2d ago</p>
            </div>
            <div className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 shrink-0 rounded bg-slate-100" />
              <p className="truncate text-[5.5px] text-body">X-Ray · 5d ago</p>
            </div>
          </div>
        </div>

        {/* bottom tab bar */}
        <div className="flex shrink-0 items-center justify-around border-t border-slate-100 py-1.5">
          {tabs.map((Icon, i) => (
            <Icon key={i} className={`h-3 w-3 ${i === 0 ? 'text-brand' : 'text-slate-300'}`} strokeWidth={2} />
          ))}
        </div>
      </div>
    </div>
  )
}
