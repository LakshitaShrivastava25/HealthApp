import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

const shared = {
  viewBox: '0 0 24 24',
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

export function FamilyRecordsIcon(props: IconProps) {
  return (
    <svg {...shared} {...props}>
      <path d="M9 4h6a1 1 0 0 1 1 1v1h1a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h1V5a1 1 0 0 1 1-1Z" />
      <path d="M12 12.6c-1.4-1.6-3.8-.5-3.8 1.2 0 1.7 2.2 2.8 3.8 4.1 1.6-1.3 3.8-2.4 3.8-4.1 0-1.7-2.4-2.8-3.8-1.2Z" />
    </svg>
  )
}

export function AIAssistantIcon(props: IconProps) {
  return (
    <svg {...shared} {...props}>
      <path d="M4 5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9l-4 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" />
      <path d="M12 8.3 12.7 10 14.4 10.7 12.7 11.4 12 13.1 11.3 11.4 9.6 10.7 11.3 10Z" />
    </svg>
  )
}

export function InsuranceIcon(props: IconProps) {
  return (
    <svg {...shared} {...props}>
      <path d="M12 3 4.5 5.8v5.4c0 4.6 3.2 7.9 7.5 9.3 4.3-1.4 7.5-4.7 7.5-9.3V5.8L12 3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  )
}

export function MedicineIcon(props: IconProps) {
  return (
    <svg {...shared} {...props}>
      <path d="M4.9 14.8a5 5 0 0 1 0-7.1l2.8-2.8a5 5 0 0 1 7.1 7.1l-2.8 2.8a5 5 0 0 1-7.1 0Z" />
      <path d="m8.4 8.4 7.1 7.1" />
    </svg>
  )
}

export function EmergencyQRIcon(props: IconProps) {
  return (
    <svg {...shared} {...props}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <path d="M15 15h6M18 12v9" />
    </svg>
  )
}

export function VerifiedDoctorIcon(props: IconProps) {
  return (
    <svg {...shared} {...props}>
      <circle cx="10" cy="8" r="4" />
      <path d="M3.5 20c0-3.6 3-6 6.5-6" />
      <circle cx="17.5" cy="16.5" r="4" />
      <path d="m15.8 16.5 1.2 1.2 2.2-2.4" />
    </svg>
  )
}

/* --- Hero / dashboard-mockup icon set --- */

export function SparkleIcon(props: IconProps) {
  return (
    <svg {...shared} {...props}>
      <path d="M12 3v3.2M12 17.8V21M3 12h3.2M17.8 12H21M5.6 5.6l2.3 2.3M16.1 16.1l2.3 2.3M18.4 5.6l-2.3 2.3M7.9 16.1l-2.3 2.3" />
      <path d="M12 8.5 12.9 11.1 15.5 12 12.9 12.9 12 15.5 11.1 12.9 8.5 12 11.1 11.1Z" />
    </svg>
  )
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <svg {...shared} {...props}>
      <path d="M4 12h16M13 5l7 7-7 7" />
    </svg>
  )
}

export function SmartphoneIcon(props: IconProps) {
  return (
    <svg {...shared} {...props}>
      <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
      <path d="M10.5 18h3" />
    </svg>
  )
}

export function ShieldCheckIcon(props: IconProps) {
  return (
    <svg {...shared} {...props}>
      <path d="M12 3 4.5 5.8v5.4c0 4.6 3.2 7.9 7.5 9.3 4.3-1.4 7.5-4.7 7.5-9.3V5.8L12 3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  )
}

export function LockIcon(props: IconProps) {
  return (
    <svg {...shared} {...props}>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
      <path d="M7.5 10.5V7a4.5 4.5 0 0 1 9 0v3.5" />
      <path d="M12 14.5v3" />
    </svg>
  )
}

export function UsersIcon(props: IconProps) {
  return (
    <svg {...shared} {...props}>
      <circle cx="9" cy="8.5" r="3.2" />
      <path d="M2.8 20c0-3.3 2.7-5.8 6.2-5.8s6.2 2.5 6.2 5.8" />
      <path d="M15.5 5.2a3.2 3.2 0 0 1 0 6.3" />
      <path d="M18 14.6c2 .5 3.3 2.3 3.3 4.5" />
    </svg>
  )
}

export function FolderIcon(props: IconProps) {
  return (
    <svg {...shared} {...props}>
      <path d="M3.5 6.5a1.5 1.5 0 0 1 1.5-1.5h4l2 2.3h8a1.5 1.5 0 0 1 1.5 1.5v8.7a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5Z" />
    </svg>
  )
}

export function ClipboardListIcon(props: IconProps) {
  return (
    <svg {...shared} {...props}>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 3.5h6a1 1 0 0 1 1 1V6H8V4.5a1 1 0 0 1 1-1Z" />
      <path d="M8.5 11.5h7M8.5 14.5h7M8.5 17.5h4" />
    </svg>
  )
}

export function ActivityIcon(props: IconProps) {
  return (
    <svg {...shared} {...props}>
      <path d="M3 12.5h3.5l2-6 3.5 12 2.2-9 1.5 3h5.3" />
    </svg>
  )
}

export function PersonIcon(props: IconProps) {
  return (
    <svg {...shared} {...props}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20c0-3.9 3.4-6.8 7.5-6.8s7.5 2.9 7.5 6.8" />
    </svg>
  )
}

export function GridIcon(props: IconProps) {
  return (
    <svg {...shared} {...props}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </svg>
  )
}

export function SettingsIcon(props: IconProps) {
  return (
    <svg {...shared} {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2.2M12 18.3v2.2M20.5 12h-2.2M5.7 12H3.5M17.7 6.3l-1.6 1.6M7.9 16.1l-1.6 1.6M17.7 17.7l-1.6-1.6M7.9 7.9 6.3 6.3" />
    </svg>
  )
}

export function BellIcon(props: IconProps) {
  return (
    <svg {...shared} {...props}>
      <path d="M6 10a6 6 0 0 1 12 0c0 4 1.5 5.5 1.5 5.5H4.5S6 14 6 10Z" />
      <path d="M10 18.5a2 2 0 0 0 4 0" />
    </svg>
  )
}

/* --- Navbar / How-It-Works icon set --- */

export function HeartPulseIcon(props: IconProps) {
  return (
    <svg {...shared} {...props}>
      <path d="M12 20.2c-4.4-2.7-9-6.4-9-11.3a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 4.9-4.6 8.6-9 11.3Z" />
      <path d="M5.5 10.5h2.3l1.4-2.6 1.8 4.8 1.3-2.2h4.2" />
    </svg>
  )
}

export function MenuIcon(props: IconProps) {
  return (
    <svg {...shared} {...props}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  )
}

export function CloseIcon(props: IconProps) {
  return (
    <svg {...shared} {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  )
}

export function PersonPlusIcon(props: IconProps) {
  return (
    <svg {...shared} {...props}>
      <circle cx="10" cy="8" r="4" />
      <path d="M2.8 20c0-3.9 3.2-6.8 7.2-6.8 1.2 0 2.3.3 3.3.8" />
      <path d="M18.5 9v6M15.5 12h6" />
    </svg>
  )
}

export function UploadIcon(props: IconProps) {
  return (
    <svg {...shared} {...props}>
      <path d="M12 15V4M8 8l4-4 4 4" />
      <path d="M4.5 15v3a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3" />
    </svg>
  )
}

export function CpuIcon(props: IconProps) {
  return (
    <svg {...shared} {...props}>
      <rect x="6" y="6" width="12" height="12" rx="2" />
      <rect x="9.5" y="9.5" width="5" height="5" rx="1" />
      <path d="M9.5 2.5v2.3M14.5 2.5v2.3M9.5 19.2v2.3M14.5 19.2v2.3M2.5 9.5h2.3M2.5 14.5h2.3M19.2 9.5h2.3M19.2 14.5h2.3" />
    </svg>
  )
}

export function TrendingUpIcon(props: IconProps) {
  return (
    <svg {...shared} {...props}>
      <path d="M3.5 16.5 10 10l4 4 6.5-6.5" />
      <path d="M15 7.5h5.5V13" />
    </svg>
  )
}

export function ArrowLongRightIcon(props: IconProps) {
  return (
    <svg {...shared} {...props}>
      <path d="M3 12h17M14 6l6 6-6 6" />
    </svg>
  )
}

/* --- Benefits / Security / About icon set --- */

export function ClockIcon(props: IconProps) {
  return (
    <svg {...shared} {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  )
}

export function KeyIcon(props: IconProps) {
  return (
    <svg {...shared} {...props}>
      <circle cx="7.5" cy="14.5" r="4" />
      <path d="M10.5 11.5 19 3M16.5 5.5l2 2M14 8l1.7 1.7" />
    </svg>
  )
}

export function MailIcon(props: IconProps) {
  return (
    <svg {...shared} {...props}>
      <rect x="3" y="5.5" width="18" height="13" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </svg>
  )
}

/* --- Testimonials icon set --- */

export function StarIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M12 2.5l2.92 6.18 6.83.67-5.1 4.66 1.44 6.74L12 17.6l-6.09 3.15 1.44-6.74-5.1-4.66 6.83-.67Z" />
    </svg>
  )
}
