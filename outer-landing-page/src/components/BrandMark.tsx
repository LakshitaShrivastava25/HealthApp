/**
 * The CuraPath logo mark — the same gradient heart-pulse glyph used on the
 * mobile app icon, the web favicon and the main app's header, redrawn here
 * as inline SVG so this landing page (a separate project from the main
 * frontend) carries the identical logo rather than its own near-miss.
 */
export default function BrandMark({ size = 32 }: { size?: number }) {
  const id = 'curapath-mark'
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="8%" y1="4%" x2="94%" y2="98%">
          <stop offset="0%" stopColor="#4CC7C8" />
          <stop offset="45%" stopColor="#2E9BD6" />
          <stop offset="100%" stopColor="#5B4BC4" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="32" height="32" rx="7.1" fill={`url(#${id})`} />
      <g transform="translate(16 16) scale(0.78) translate(-12 -12)">
        <path
          d="M12 21.3c-.36 0-.7-.14-.96-.39l-6.4-6.19C2.68 12.83 1.4 10.98 1.4 8.77 1.4 5.9 3.66 3.6 6.46 3.6c1.62 0 3.15.78 4.12 2.06.4.53 1.2.53 1.6 0 .97-1.28 2.5-2.06 4.12-2.06 2.8 0 5.06 2.3 5.06 5.17 0 2.21-1.28 4.06-3.24 5.95l-6.4 6.19c-.26.25-.6.39-.96.39z"
          fill="#FFFFFF"
        />
        <path
          d="M3.6 11.85h4.9l.75-1.5 1.85 4.3L13 8.9l1.4 2.95h5.1"
          fill="none"
          stroke="#4A3FA8"
          strokeWidth="1.35"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  )
}
