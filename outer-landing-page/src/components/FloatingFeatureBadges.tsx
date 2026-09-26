import { motion } from 'framer-motion'
import { FolderIcon, InsuranceIcon, MedicineIcon, PersonIcon } from './icons'

interface Badge {
  icon: typeof FolderIcon
  label: string
  /** position of the badge itself, in % of the wrapping container */
  top: string
  left: string
  /** where the connector line ends, near the browser mockup, in % */
  toTop: string
  toLeft: string
  duration: number
}

const badges: Badge[] = [
  {
    icon: FolderIcon,
    label: 'Medical Records',
    top: '15%',
    left: '-2%',
    toTop: '21%',
    toLeft: '12%',
    duration: 3.2,
  },
  {
    icon: InsuranceIcon,
    label: 'Insurance',
    top: '34%',
    left: '-7%',
    toTop: '39%',
    toLeft: '12%',
    duration: 3.8,
  },
  {
    icon: MedicineIcon,
    label: 'Medicines',
    top: '52%',
    left: '-4%',
    toTop: '57%',
    toLeft: '12%',
    duration: 3.4,
  },
  {
    icon: PersonIcon,
    label: 'Doctors',
    top: '70%',
    left: '1%',
    toTop: '75%',
    toLeft: '12%',
    duration: 4,
  },
]

/** Converts a "N%" string to a plain number for SVG coordinates (viewBox is 0 0 100 100). */
const num = (pct: string) => Number.parseFloat(pct)

export default function FloatingFeatureBadges() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {/* connector lines */}
      <svg
        className="absolute inset-0 h-full w-full overflow-visible"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="badgeLine" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#2563eb" stopOpacity="0.05" />
            <stop offset="55%" stopColor="#2563eb" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#2563eb" stopOpacity="0.05" />
          </linearGradient>
        </defs>
        {badges.map((badge) => {
          const x1 = num(badge.left) + 3.5
          const y1 = num(badge.top) + 3.5
          const x2 = num(badge.toLeft)
          const y2 = num(badge.toTop)
          const midX = (x1 + x2) / 2
          const path = `M ${x1} ${y1} Q ${midX} ${y1} ${x2} ${y2}`
          return (
            <motion.path
              key={badge.label}
              d={path}
              fill="none"
              stroke="url(#badgeLine)"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeDasharray="3 2.5"
              vectorEffect="non-scaling-stroke"
              animate={{ strokeDashoffset: [0, -11] }}
              transition={{ duration: badge.duration, repeat: Infinity, ease: 'linear' }}
            />
          )
        })}
      </svg>

      {/* badge circles */}
      {badges.map((badge, i) => (
        <motion.div
          key={badge.label}
          title={badge.label}
          className="absolute flex h-12 w-12 items-center justify-center rounded-full border border-brand-light bg-white text-brand shadow-lg shadow-brand/10 sm:h-14 sm:w-14"
          style={{ top: badge.top, left: badge.left }}
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: 4 + i * 0.4, repeat: Infinity, ease: 'easeInOut', delay: i * 0.3 }}
        >
          <badge.icon className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={1.8} />
        </motion.div>
      ))}
    </div>
  )
}
