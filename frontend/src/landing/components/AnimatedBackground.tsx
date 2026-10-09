import { motion } from 'framer-motion'

const blobs = [
  {
    className: 'left-[-12rem] top-[-8rem] h-[34rem] w-[34rem] bg-blue-300/30',
    x: [0, 60, -30, 0],
    y: [0, 40, -30, 0],
    duration: 24,
  },
  {
    className: 'right-[-10rem] top-[18%] h-[28rem] w-[28rem] bg-emerald-300/25',
    x: [0, -50, 30, 0],
    y: [0, 50, -20, 0],
    duration: 28,
  },
  {
    className: 'bottom-[-12rem] left-[20%] h-[32rem] w-[32rem] bg-sky-200/30',
    x: [0, 40, -60, 0],
    y: [0, -30, 30, 0],
    duration: 32,
  },
]

/** A single strand of the DNA double-helix motif. */
function HelixStrand({ offset, opacity }: { offset: number; opacity: number }) {
  const points = Array.from({ length: 7 }, (_, i) => {
    const y = i * 40
    const x = 40 + Math.sin(i * 0.9 + offset) * 40
    return `${x},${y}`
  })
  const d = `M ${points.join(' L ')}`
  return <path d={d} fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round" opacity={opacity} />
}

function DnaHelix() {
  const rungs = Array.from({ length: 7 }, (_, i) => {
    const y = i * 40
    const x1 = 40 + Math.sin(i * 0.9) * 40
    const x2 = 40 + Math.sin(i * 0.9 + Math.PI) * 40
    return <line key={i} x1={x1} y1={y} x2={x2} y2={y} stroke="#10b981" strokeWidth="1.5" opacity={0.5} />
  })

  return (
    <motion.svg
      viewBox="0 0 80 240"
      className="absolute right-[6%] top-[8%] h-[22rem] w-[7rem] opacity-[0.07]"
      animate={{ y: [0, 22, 0], rotate: [0, 2.5, 0] }}
      transition={{ duration: 26, repeat: Infinity, ease: 'easeInOut' }}
    >
      <HelixStrand offset={0} opacity={0.9} />
      <HelixStrand offset={Math.PI} opacity={0.9} />
      {rungs}
    </motion.svg>
  )
}

function HeartbeatLine() {
  const path =
    'M0 40 H140 L160 10 L180 70 L200 40 L215 40 L225 20 L235 40 H400 L420 40 L440 5 L460 75 L480 40 L495 40 L505 25 L515 40 H700'

  return (
    <svg
      className="absolute left-0 top-[38%] h-24 w-[140%] opacity-[0.08] sm:top-[42%]"
      viewBox="0 0 700 80"
      preserveAspectRatio="none"
    >
      <motion.path
        d={path}
        fill="none"
        stroke="#2563eb"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        animate={{ x: ['0%', '-30%'] }}
        transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
      />
    </svg>
  )
}

function ChartSilhouettes() {
  return (
    <>
      {/* faint bar chart, bottom-left */}
      <motion.svg
        viewBox="0 0 160 90"
        className="absolute bottom-[6%] left-[4%] h-32 w-56 opacity-[0.06]"
        animate={{ x: [0, 14, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
      >
        {[30, 55, 40, 70, 50, 65].map((h, i) => (
          <rect key={i} x={i * 26 + 4} y={90 - h} width="16" height={h} rx="3" fill="#2563eb" />
        ))}
      </motion.svg>

      {/* faint line chart, upper-middle */}
      <motion.svg
        viewBox="0 0 220 90"
        className="absolute right-[18%] top-[6%] h-28 w-64 opacity-[0.06]"
        animate={{ x: [0, -18, 0], y: [0, 10, 0] }}
        transition={{ duration: 30, repeat: Infinity, ease: 'easeInOut' }}
      >
        <path
          d="M0 65 L30 50 L60 58 L90 30 L120 42 L150 18 L180 34 L220 12"
          fill="none"
          stroke="#10b981"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </motion.svg>
    </>
  )
}

export default function AnimatedBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-white">
      {blobs.map((blob) => (
        <motion.div
          key={blob.className}
          className={`absolute rounded-full blur-3xl ${blob.className}`}
          animate={{ x: blob.x, y: blob.y }}
          transition={{ duration: blob.duration, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}

      <HeartbeatLine />
      <DnaHelix />
      <ChartSilhouettes />
    </div>
  )
}
