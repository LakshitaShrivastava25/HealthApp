/**
 * Every keyframe the auth screens use, injected by <AuthShell> and by any
 * other page that renders <AnimatedMedicalBackground> directly (the
 * landing selector does).
 *
 * These live in CSS rather than Framer Motion on purpose: they are
 * infinite ambient loops with no React state behind them, so running them
 * on the compositor costs nothing per frame, while a Framer animation
 * would hold a JS-driven value open for the life of the page. Framer is
 * used for the things that actually respond to state — entrances, step
 * changes, parallax, success — where it earns its keep.
 *
 * Only `transform`, `opacity` and (on one tiny path) `stroke-dashoffset`
 * are animated. No width/height/top/left/box-shadow loops.
 *
 * The prefers-reduced-motion block at the bottom is the real
 * accessibility switch — it stops the ambient loops outright rather than
 * merely shortening them, so a person who asked for stillness gets a
 * still page.
 */
export default function AuthKeyframes() {
  return (
    <style>{`
      @keyframes hn-float-a {
        0%, 100% { transform: translate3d(0, 0, 0) rotate(0deg); }
        25%      { transform: translate3d(6px, -14px, 0) rotate(2.2deg); }
        50%      { transform: translate3d(-4px, -22px, 0) rotate(-1.4deg); }
        75%      { transform: translate3d(-8px, -9px, 0) rotate(1.1deg); }
      }
      @keyframes hn-float-b {
        0%, 100% { transform: translate3d(0, 0, 0) rotate(0deg); }
        33%      { transform: translate3d(-9px, -16px, 0) rotate(-2.6deg); }
        66%      { transform: translate3d(7px, -8px, 0) rotate(1.8deg); }
      }
      @keyframes hn-float-c {
        0%, 100% { transform: translate3d(0, 0, 0) rotate(-1deg); }
        50%      { transform: translate3d(5px, -18px, 0) rotate(3deg); }
      }
      @keyframes hn-float-d {
        0%, 100% { transform: translate3d(0, 0, 0) rotate(1.5deg) scale(1); }
        40%      { transform: translate3d(-6px, -11px, 0) rotate(-2deg) scale(1.02); }
        70%      { transform: translate3d(4px, -19px, 0) rotate(2.4deg) scale(0.99); }
      }

      /* Plus signs fade as they drift, so they read as ambient rather than
         as a fixed constellation stuck to the page. */
      @keyframes hn-drift-fade {
        0%, 100% { transform: translate3d(0, 0, 0) rotate(0deg); opacity: 0.30; }
        50%      { transform: translate3d(-7px, -20px, 0) rotate(9deg); opacity: 0.62; }
      }

      @keyframes hn-glow-pulse {
        0%, 100% { opacity: 0.55; transform: scale(0.96); }
        50%      { opacity: 1;    transform: scale(1.04); }
      }
      @keyframes hn-ecg-run {
        0%   { stroke-dashoffset: 210; }
        100% { stroke-dashoffset: -30; }
      }

      @keyframes hn-orbit     { from { transform: rotate(0deg); }   to { transform: rotate(360deg); } }
      @keyframes hn-orbit-rev { from { transform: rotate(360deg); } to { transform: rotate(0deg); } }

      /* The colour field behind everything. Large blurred blobs moving
         slowly — never a background-position or filter animation. */
      @keyframes hn-blob-a {
        0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
        50%      { transform: translate3d(60px, 40px, 0) scale(1.12); }
      }
      @keyframes hn-blob-b {
        0%, 100% { transform: translate3d(0, 0, 0) scale(1.05); }
        50%      { transform: translate3d(-70px, -30px, 0) scale(0.94); }
      }
      @keyframes hn-blob-c {
        0%, 100% { transform: translate3d(0, 0, 0) scale(0.98); }
        50%      { transform: translate3d(40px, -55px, 0) scale(1.08); }
      }

      @keyframes hn-particle {
        0%       { transform: translate3d(0, 0, 0); opacity: 0; }
        15%      { opacity: 0.7; }
        85%      { opacity: 0.5; }
        100%     { transform: translate3d(8px, -70px, 0); opacity: 0; }
      }

      @keyframes hn-card-float {
        0%, 100% { transform: translate3d(0, 0, 0); }
        50%      { transform: translate3d(0, -3px, 0); }
      }

      @keyframes hn-shake {
        0%, 100%   { transform: translate3d(0, 0, 0); }
        20%, 60%   { transform: translate3d(-5px, 0, 0); }
        40%, 80%   { transform: translate3d(5px, 0, 0); }
      }

      @keyframes hn-dot-bounce {
        0%, 80%, 100% { transform: translate3d(0, 0, 0); opacity: 0.4; }
        40%           { transform: translate3d(0, -4px, 0); opacity: 1; }
      }

      @keyframes hn-spin { to { transform: rotate(360deg); } }

      .hn-float-a { animation: hn-float-a 9s   ease-in-out infinite; }
      .hn-float-b { animation: hn-float-b 7.5s ease-in-out infinite; }
      .hn-float-c { animation: hn-float-c 10.5s ease-in-out infinite; }
      .hn-float-d { animation: hn-float-d 8.5s ease-in-out infinite; }
      .hn-drift-fade { animation: hn-drift-fade 11s ease-in-out infinite; }
      .hn-glow-pulse { animation: hn-glow-pulse 4.5s ease-in-out infinite; transform-origin: center; }
      .hn-ecg-run    { animation: hn-ecg-run 4s linear infinite; }
      .hn-orbit      { animation: hn-orbit 46s linear infinite; }
      .hn-orbit-rev  { animation: hn-orbit-rev 62s linear infinite; }
      .hn-blob-a     { animation: hn-blob-a 24s ease-in-out infinite; }
      .hn-blob-b     { animation: hn-blob-b 30s ease-in-out infinite; }
      .hn-blob-c     { animation: hn-blob-c 27s ease-in-out infinite; }
      .hn-particle   { animation: hn-particle linear infinite; }
      .hn-card-float { animation: hn-card-float 6s ease-in-out infinite; }
      .hn-shake      { animation: hn-shake 0.4s ease-in-out 1; }
      .hn-dot-bounce { animation: hn-dot-bounce 1.1s ease-in-out infinite; }
      .hn-spin       { animation: hn-spin 0.7s linear infinite; }

      @media (prefers-reduced-motion: reduce) {
        .hn-float-a, .hn-float-b, .hn-float-c, .hn-float-d,
        .hn-drift-fade, .hn-glow-pulse, .hn-ecg-run,
        .hn-orbit, .hn-orbit-rev,
        .hn-blob-a, .hn-blob-b, .hn-blob-c,
        .hn-particle, .hn-card-float, .hn-shake, .hn-dot-bounce {
          animation: none !important;
        }
        /* Particles animate in from opacity 0, so with the animation off
           they would never appear at all. Pin them visible instead. */
        .hn-particle { opacity: 0.45 !important; }
        .hn-drift-fade { opacity: 0.45 !important; }
        .hn-spin { animation: hn-spin 1.4s linear infinite; }
      }
    `}</style>
  );
}
