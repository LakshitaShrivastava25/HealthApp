import { Capsule, HeartEcg, MedicalShield, PlusMark, Stethoscope } from '../auth/MedicalArt';

/**
 * A sparse, in-app cousin of the auth screens' AnimatedMedicalBackground.
 *
 * The auth version is a full environment: six illustrated objects, six plus
 * marks, twenty-two particles, three orbit rings and three blurred colour
 * blobs, at 0.42–0.62 opacity, with pointer parallax. That is right for a
 * page whose only job is a login card, and completely wrong behind real
 * content.
 *
 * This one reuses the same artwork and the same CSS-keyframe technique, but:
 *   - 3 icons in a header, 5 in a panel (never more)
 *   - roughly half the opacity (0.10–0.26 vs 0.42–0.62)
 *   - slower loops (18–26s vs 7.5–10.5s)
 *   - no parallax, no rings, no particles, no blobs
 *   - clipped to its own parent rather than the viewport
 *
 * The parent must be `relative` (this fills it via `absolute inset-0`). It
 * also sets its own `overflow-hidden`, so an oversized icon can never widen
 * the page — the mobile-overflow failure mode from the responsiveness work.
 */
export default function AmbientBackground({
  variant = 'panel',
  tone = 'brand',
  className = '',
}: {
  /** `header` is sparser and smaller, for a short page-title strip. */
  variant?: 'panel' | 'header';
  /**
   * `brand` keeps the artwork's own purple/teal — for white cards.
   * `light` renders it as white silhouettes, for dark/gradient surfaces.
   * The art hard-codes its palette rather than using currentColor, so the
   * only way to recolour it wholesale is a filter.
   */
  tone?: 'brand' | 'light';
  className?: string;
}) {
  const lighten = tone === 'light' ? { filter: 'brightness(0) invert(1)' } : undefined;

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
      style={lighten}
    >
      {variant === 'header' ? (
        <>
          <span className="hn-ambient-b absolute -top-6 right-[6%] block" style={{ opacity: 0.1 }}>
            <Stethoscope size={92} />
          </span>
          <span className="hn-ambient-a absolute -bottom-7 right-[26%] hidden sm:block" style={{ opacity: 0.12 }}>
            <Capsule size={46} />
          </span>
          <span className="hn-ambient-c absolute top-1/2 right-[18%] hidden lg:block" style={{ opacity: 0.14 }}>
            <PlusMark size={16} tone="teal" />
          </span>
        </>
      ) : (
        <>
          <span className="hn-ambient-a absolute -right-8 -top-10 block" style={{ opacity: 0.16 }}>
            <Stethoscope size={150} />
          </span>
          <span className="hn-ambient-b absolute -bottom-10 -left-8 block" style={{ opacity: 0.14 }}>
            <HeartEcg size={104} animated={false} />
          </span>
          <span className="hn-ambient-c absolute bottom-6 right-[18%] hidden sm:block" style={{ opacity: 0.18 }}>
            <Capsule size={58} />
          </span>
          <span className="hn-ambient-b absolute left-[22%] top-4 hidden md:block" style={{ opacity: 0.12 }}>
            <MedicalShield size={72} animated={false} />
          </span>
          <span className="hn-ambient-a absolute left-[46%] bottom-[18%] hidden sm:block" style={{ opacity: 0.26 }}>
            <PlusMark size={18} tone="purple" />
          </span>
        </>
      )}
    </div>
  );
}
