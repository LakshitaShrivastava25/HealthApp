import { useId } from 'react';
import { C } from './tokens';

/**
 * The floating background objects, drawn as real SVG illustrations rather
 * than blown-up icons.
 *
 * A lucide icon at 200px is a 2px stroke stretched thin — it reads as a
 * wireframe, not an object. These carry their own gradients, inner detail
 * and highlights so they hold up at the sizes the background needs.
 *
 * Every gradient id runs through useId(), because two instances of the
 * same object on one page would otherwise collide on `url(#...)` and the
 * second would silently pick up the first one's colours.
 */

type ArtProps = { size?: number; className?: string; animated?: boolean };

/* -- Heart with an ECG trace ----------------------------------------- */

export function HeartEcg({ size = 130, className = '', animated = true }: ArtProps) {
  const id = useId();
  const fill = `heart-fill-${id}`;
  const glow = `heart-glow-${id}`;
  const trace = `heart-trace-${id}`;

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={fill} x1="10%" y1="0%" x2="90%" y2="100%">
          <stop offset="0%" stopColor={C.purpleSoft} />
          <stop offset="55%" stopColor={C.purple} />
          <stop offset="100%" stopColor={C.purpleDark} />
        </linearGradient>
        <linearGradient id={trace} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={C.tealSoft} />
          <stop offset="100%" stopColor={C.white} />
        </linearGradient>
        <radialGradient id={glow}>
          <stop offset="0%" stopColor={C.purple} stopOpacity="0.32" />
          <stop offset="100%" stopColor={C.purple} stopOpacity="0" />
        </radialGradient>
        <filter id={`heart-shadow-${id}`} x="-30%" y="-20%" width="160%" height="150%">
          <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor={C.purpleDark} floodOpacity="0.3" />
        </filter>
      </defs>

      {/* Soft bloom behind the shape — this is what makes it sit *in* the
          scene instead of looking pasted on top of it. */}
      <circle cx="50" cy="50" r="48" fill={`url(#${glow})`} className={animated ? 'hn-glow-pulse' : ''} />

      <path
        d="M50 86 C46 82 12 58 12 34 C12 21 22 12 33 12 C41 12 47 16 50 22 C53 16 59 12 67 12 C78 12 88 21 88 34 C88 58 54 82 50 86 Z"
        fill={`url(#${fill})`}
        filter={`url(#heart-shadow-${id})`}
      />
      {/* Highlight along the upper-left lobe — a flat fill reads as a
          sticker; this gives the shape a light source. */}
      <path
        d="M27 18 C21 22 18 28 18 34 C18 40 20 46 24 52"
        stroke={C.white}
        strokeOpacity="0.4"
        strokeWidth="4"
        strokeLinecap="round"
      />

      <path
        d="M14 52 H33 L38 39 L45 65 L52 43 L57 52 H86"
        stroke={C.white}
        strokeOpacity="0.55"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* A short bright dash chasing the same path — the "living signal"
          read, without making the heart itself visibly beat. */}
      <path
        d="M14 52 H33 L38 39 L45 65 L52 43 L57 52 H86"
        stroke={`url(#${trace})`}
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="16 180"
        className={animated ? 'hn-ecg-run' : ''}
      />
    </svg>
  );
}

/* -- Stethoscope ------------------------------------------------------ */

export function Stethoscope({ size = 190, className = '' }: ArtProps) {
  const id = useId();
  const tube = `steth-tube-${id}`;
  const disc = `steth-disc-${id}`;
  const shadow = `steth-shadow-${id}`;

  return (
    <svg
      width={size}
      height={size * 1.2}
      viewBox="0 0 100 120"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <defs>
        {/* A richer, three-stop gradient with a near-white highlight reads
            as a lit, dimensional object rather than a flat tinted shape —
            the same trick a glossy app icon uses. */}
        <linearGradient id={tube} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={C.white} />
          <stop offset="35%" stopColor={C.purpleSoft} />
          <stop offset="100%" stopColor={C.purpleDark} />
        </linearGradient>
        <linearGradient id={disc} x1="15%" y1="0%" x2="85%" y2="100%">
          <stop offset="0%" stopColor={C.white} />
          <stop offset="30%" stopColor={C.tealSoft} />
          <stop offset="100%" stopColor={C.teal} />
        </linearGradient>
        <filter id={shadow} x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor={C.purpleDark} floodOpacity="0.28" />
        </filter>
      </defs>

      <g filter={`url(#${shadow})`}>
        {/* Binaural tubes meeting at the Y-join */}
        <path d="M26 18 C20 46 32 60 50 62" stroke={`url(#${tube})`} strokeWidth="7" strokeLinecap="round" />
        <path d="M74 18 C80 46 68 60 50 62" stroke={`url(#${tube})`} strokeWidth="7" strokeLinecap="round" />
        {/* Stem down to the chestpiece */}
        <path d="M50 62 C50 82 56 92 63 97" stroke={`url(#${tube})`} strokeWidth="7" strokeLinecap="round" />

        {/* Earpieces */}
        <rect x="19" y="6" width="14" height="14" rx="7" fill={`url(#${tube})`} />
        <rect x="67" y="6" width="14" height="14" rx="7" fill={`url(#${tube})`} />

        {/* Chestpiece, with a bright specular dot for the "glossy" read */}
        <circle cx="72" cy="102" r="15" fill={`url(#${disc})`} />
        <circle cx="72" cy="102" r="9" fill={C.white} opacity="0.5" />
        <circle cx="67" cy="97" r="3.6" fill={C.white} opacity="0.85" />
      </g>
    </svg>
  );
}

/* -- Prescription slip ------------------------------------------------ */

export function Prescription({ size = 150, className = '' }: ArtProps) {
  const id = useId();
  const paper = `rx-paper-${id}`;
  const clip = `rx-clip-${id}`;

  return (
    <svg
      width={size}
      height={size * 1.24}
      viewBox="0 0 100 124"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={paper} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={C.white} />
          <stop offset="100%" stopColor={C.lavender} />
        </linearGradient>
        <linearGradient id={clip} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={C.purpleSoft} />
          <stop offset="100%" stopColor={C.purple} />
        </linearGradient>
        <filter id={`rx-shadow-${id}`} x="-30%" y="-20%" width="160%" height="140%">
          <feDropShadow dx="0" dy="5" stdDeviation="5" floodColor={C.purpleDark} floodOpacity="0.22" />
        </filter>
      </defs>

      <g filter={`url(#rx-shadow-${id})`}>
        <rect x="8" y="12" width="84" height="106" rx="11" fill={`url(#${paper})`} />
        <rect
          x="8"
          y="12"
          width="84"
          height="106"
          rx="11"
          stroke={C.purple}
          strokeOpacity="0.22"
          strokeWidth="1.5"
        />
      {/* Clipboard clasp */}
      <rect x="37" y="4" width="26" height="15" rx="5" fill={`url(#${clip})`} opacity="0.9" />

      {/* The Rx mark, drawn rather than typed so it renders identically
          without depending on a webfont having loaded. */}
      <path
        d="M24 34 V60 M24 34 H33 A8 8 0 0 1 33 50 H24 M31 50 L41 60"
        stroke={C.purple}
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.85"
      />

      <rect x="24" y="70" width="52" height="4.5" rx="2.25" fill={C.purple} opacity="0.2" />
      <rect x="24" y="81" width="40" height="4.5" rx="2.25" fill={C.purple} opacity="0.16" />
      <rect x="24" y="92" width="46" height="4.5" rx="2.25" fill={C.teal} opacity="0.2" />

      {/* Signature */}
      <path
        d="M26 108 C32 100 37 112 43 104 C48 97 53 110 60 102"
        stroke={C.purpleDark}
        strokeOpacity="0.4"
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
      />
      </g>
    </svg>
  );
}

/* -- Shield ----------------------------------------------------------- */

export function MedicalShield({ size = 120, className = '', animated = true }: ArtProps) {
  const id = useId();
  const body = `shield-body-${id}`;
  const glow = `shield-glow-${id}`;

  return (
    <svg
      width={size}
      height={size * 1.1}
      viewBox="0 0 100 110"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={body} x1="10%" y1="0%" x2="90%" y2="100%">
          <stop offset="0%" stopColor={C.white} />
          <stop offset="30%" stopColor={C.tealSoft} />
          <stop offset="75%" stopColor={C.blue} />
          <stop offset="100%" stopColor={C.purple} />
        </linearGradient>
        <radialGradient id={glow}>
          <stop offset="0%" stopColor={C.teal} stopOpacity="0.3" />
          <stop offset="100%" stopColor={C.teal} stopOpacity="0" />
        </radialGradient>
        <filter id={`shield-shadow-${id}`} x="-40%" y="-30%" width="180%" height="160%">
          <feDropShadow dx="0" dy="5" stdDeviation="5" floodColor={C.purpleDark} floodOpacity="0.3" />
        </filter>
      </defs>

      <circle cx="50" cy="55" r="52" fill={`url(#${glow})`} className={animated ? 'hn-glow-pulse' : ''} />

      <g filter={`url(#shield-shadow-${id})`}>
        <path d="M50 6 L88 20 V56 C88 82 70 99 50 106 C30 99 12 82 12 56 V20 Z" fill={`url(#${body})`} />
        <path
          d="M50 6 L88 20 V56 C88 82 70 99 50 106"
          stroke={C.white}
          strokeOpacity="0.4"
          strokeWidth="2"
          fill="none"
        />
        {/* A soft highlight wash across the upper-left face, the thing
            that sells "glossy badge" instead of "flat sticker". */}
        <path d="M50 6 L20 18 V52 C20 40 30 22 50 6 Z" fill={C.white} opacity="0.22" />
        {/* Medical cross */}
        <path d="M43 32 H57 V48 H73 V62 H57 V78 H43 V62 H27 V48 H43 Z" fill={C.white} opacity="0.92" />
      </g>
    </svg>
  );
}

/* -- Capsule ---------------------------------------------------------- */

export function Capsule({ size = 76, className = '' }: ArtProps) {
  const id = useId();
  const left = `cap-l-${id}`;
  const right = `cap-r-${id}`;
  const clipId = `cap-clip-${id}`;

  return (
    <svg
      width={size}
      height={size * 0.44}
      viewBox="0 0 100 44"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={left} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={C.purpleSoft} />
          <stop offset="100%" stopColor={C.purple} />
        </linearGradient>
        <linearGradient id={right} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={C.tealSoft} />
          <stop offset="100%" stopColor={C.teal} />
        </linearGradient>
        <clipPath id={clipId}>
          <rect x="2" y="2" width="96" height="40" rx="20" />
        </clipPath>
      </defs>

      <g clipPath={`url(#${clipId})`} opacity="0.85">
        <rect x="2" y="2" width="49" height="40" fill={`url(#${left})`} />
        <rect x="51" y="2" width="47" height="40" fill={`url(#${right})`} />
        {/* Gloss */}
        <ellipse cx="34" cy="13" rx="22" ry="6" fill={C.white} opacity="0.32" />
      </g>
      <rect x="2" y="2" width="96" height="40" rx="20" stroke={C.white} strokeOpacity="0.4" strokeWidth="1.5" />
    </svg>
  );
}

/* -- Plus mark -------------------------------------------------------- */

export function PlusMark({
  size = 34,
  className = '',
  tone = 'purple',
}: ArtProps & { tone?: 'purple' | 'teal' }) {
  const id = useId();
  const fill = `plus-${id}`;
  const from = tone === 'teal' ? C.tealSoft : C.purpleSoft;
  const to = tone === 'teal' ? C.teal : C.purple;

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={fill} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={from} />
          <stop offset="100%" stopColor={to} />
        </linearGradient>
      </defs>
      <path
        d="M40 8 h20 a8 8 0 0 1 8 8 v16 h16 a8 8 0 0 1 8 8 v20 a8 8 0 0 1 -8 8 h-16 v16 a8 8 0 0 1 -8 8 h-20 a8 8 0 0 1 -8 -8 v-16 h-16 a8 8 0 0 1 -8 -8 v-20 a8 8 0 0 1 8 -8 h16 v-16 a8 8 0 0 1 8 -8 z"
        fill={`url(#${fill})`}
      />
    </svg>
  );
}
