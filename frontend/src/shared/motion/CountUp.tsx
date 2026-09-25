import { useEffect, useRef, useState } from 'react';

/**
 * Counts a stat up to its value on mount.
 *
 * Hand-rolled on requestAnimationFrame rather than pulling in an animation
 * library: framer-motion is already bundled, but using its animate() for a
 * single integer would hold a JS-driven value open for the life of the
 * mount, and this is a one-shot ~600ms tween of one number.
 *
 * Respects prefers-reduced-motion by rendering the final value immediately —
 * a counting number is exactly the kind of movement that setting asks to
 * stop.
 */
export default function CountUp({
  value,
  duration = 600,
  className,
}: {
  value: number;
  duration?: number;
  className?: string;
}) {
  const [shown, setShown] = useState(value);
  const frame = useRef<number | undefined>(undefined);

  useEffect(() => {
    const reduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduced || !Number.isFinite(value) || value <= 0) {
      setShown(value);
      return;
    }

    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // easeOutCubic — quick out of the gate, settles gently on the number.
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(value * eased));
      if (t < 1) frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);

    return () => {
      if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    };
  }, [value, duration]);

  return <span className={className}>{shown}</span>;
}
