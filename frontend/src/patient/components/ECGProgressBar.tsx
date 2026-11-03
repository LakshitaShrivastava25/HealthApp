import { useEffect, useRef } from 'react';

const WIDTH = 300;
const HEIGHT = 60;
const MID_Y = HEIGHT / 2;
const CYCLE_W = 60;
const CYCLES = Math.ceil(WIDTH / CYCLE_W) + 1;

function buildECGPath(): string {
  const p: string[] = [`M 0 ${MID_Y}`];
  for (let i = 0; i < CYCLES; i++) {
    const x = i * CYCLE_W;
    p.push(
      `L ${x + 8} ${MID_Y}`,
      `L ${x + 12} ${MID_Y - 4}`,
      `L ${x + 16} ${MID_Y}`,
      `L ${x + 20} ${MID_Y}`,
      `L ${x + 22} ${MID_Y + 6}`,
      `L ${x + 26} ${MID_Y - 24}`,
      `L ${x + 30} ${MID_Y + 10}`,
      `L ${x + 34} ${MID_Y}`,
      `L ${x + 40} ${MID_Y - 6}`,
      `L ${x + 46} ${MID_Y}`,
      `L ${x + 60} ${MID_Y}`,
    );
  }
  return p.join(' ');
}

const ECG_D = buildECGPath();

type Props = { progress: number; isComplete?: boolean };

export default function ECGProgressBar({ progress, isComplete }: Props) {
  const clipW = Math.max(0, Math.min(1, progress)) * WIDTH;
  const pct = Math.round(progress * 100);
  const pulseRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    const el = pulseRef.current;
    if (!el) return;
    if (isComplete) {
      el.style.opacity = '1';
      return;
    }
    let raf: number;
    let t = 0;
    const tick = () => {
      t += 16;
      el.style.opacity = String(0.4 + 0.6 * Math.abs(Math.sin(t / 300)));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isComplete]);

  return (
    <div className="flex flex-col items-center py-3">
      <svg width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="overflow-hidden rounded-lg">
        <defs>
          <clipPath id="ecg-clip">
            <rect x="0" y="0" width={clipW} height={HEIGHT} />
          </clipPath>
        </defs>
        <path d={ECG_D} stroke="var(--color-border, #e5e7eb)" strokeWidth={1.5} fill="none" />
        <path
          ref={pulseRef}
          d={ECG_D}
          stroke={isComplete ? '#22c55e' : 'var(--color-accent, #7c3aed)'}
          strokeWidth={2.5}
          fill="none"
          clipPath="url(#ecg-clip)"
        />
      </svg>
      <span className={`mt-1 text-xs font-semibold ${isComplete ? 'text-green-500' : 'text-accent'}`}>
        {isComplete ? 'Uploaded' : `${pct}%`}
      </span>
    </div>
  );
}
