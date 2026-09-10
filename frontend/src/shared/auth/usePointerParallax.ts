import { useEffect } from 'react';
import { useMotionValue, useSpring, type MotionValue } from 'framer-motion';
import { useReducedMotion } from './useReducedMotion';

export type ParallaxOrigin = { x: MotionValue<number>; y: MotionValue<number> };

/**
 * Pointer-driven parallax origin for the background layers.
 *
 * Deliberately built on motion values rather than React state: the pointer
 * fires dozens of events a second, and putting that through setState would
 * re-render the whole background tree every time. Motion values write
 * straight to the transform, so React renders once and never again.
 *
 * Returns springed -1..1 coordinates. Individual layers convert these to
 * their own pixel offset via <ParallaxLayer strength={n}> — that split is
 * what produces the layered 3D feel (particles barely move, the
 * stethoscope moves most) without every layer re-reading the pointer.
 */
export function usePointerParallax(): ParallaxOrigin {
  const reduced = useReducedMotion();

  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  // Springed so objects trail the cursor slightly instead of tracking it
  // rigidly — rigid tracking reads as "the page is following me", which is
  // exactly the aggressive feel we don't want.
  const x = useSpring(rawX, { stiffness: 40, damping: 18, mass: 0.6 });
  const y = useSpring(rawY, { stiffness: 40, damping: 18, mass: 0.6 });

  useEffect(() => {
    if (reduced) return;
    // Coarse pointers (touch) have no hover position to track, and firing
    // this on every touch-drag would just fight the user's scroll.
    if (window.matchMedia('(pointer: coarse)').matches) return;

    function handle(e: PointerEvent) {
      rawX.set((e.clientX / window.innerWidth) * 2 - 1);
      rawY.set((e.clientY / window.innerHeight) * 2 - 1);
    }
    window.addEventListener('pointermove', handle, { passive: true });
    return () => window.removeEventListener('pointermove', handle);
  }, [rawX, rawY, reduced]);

  return { x, y };
}
