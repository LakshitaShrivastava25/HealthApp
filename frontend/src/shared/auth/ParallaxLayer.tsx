import type { ReactNode } from 'react';
import { motion, useTransform } from 'framer-motion';
import type { ParallaxOrigin } from './usePointerParallax';

/**
 * One depth plane in the background. `strength` is the maximum pixel
 * offset this layer travels as the pointer crosses the whole viewport —
 * small for distant things (particles), large for near ones (stethoscope).
 *
 * Each layer is its own component so the useTransform calls stay stable;
 * doing this with a factory function inside the parent would be calling
 * hooks in a loop.
 */
export default function ParallaxLayer({
  origin,
  strength,
  className = '',
  children,
}: {
  origin: ParallaxOrigin;
  strength: number;
  className?: string;
  children: ReactNode;
}) {
  const x = useTransform(origin.x, (v) => v * strength);
  const y = useTransform(origin.y, (v) => v * strength);

  return (
    <motion.div style={{ x, y }} className={className}>
      {children}
    </motion.div>
  );
}
