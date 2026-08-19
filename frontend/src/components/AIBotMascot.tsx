import { useEffect, useState } from 'react';

/**
 * Self-contained animated bot mascot. Pure inline SVG + CSS keyframes,
 * no external assets or animation libraries. Fixed viewBox (0 0 160 190),
 * matching width/height props passed in — will not overflow its container.
 */
export default function AIBotMascot({ size = 160 }: { size?: number }) {
  const [blink, setBlink] = useState(false);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    const scheduleNextBlink = () => {
      const delay = 3200 + Math.random() * 2200;
      timeoutId = setTimeout(() => {
        setBlink(true);
        setTimeout(() => setBlink(false), 160);
        scheduleNextBlink();
      }, delay);
    };
    scheduleNextBlink();
    return () => clearTimeout(timeoutId);
  }, []);

  return (
    <div style={{ width: size, height: size * 1.1875, position: 'relative' }}>
      <style>{`
        @keyframes bot-float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-6px); }
        }
        @keyframes bot-eye-glow {
          0%, 100% { opacity: 0.75; }
          50% { opacity: 1; }
        }
        @keyframes bot-antenna-glow {
          0%, 100% { opacity: 0.55; }
          50% { opacity: 1; }
        }
        @keyframes bot-core-pulse {
          0%, 100% { opacity: 0.4; transform: scale(0.92); }
          50% { opacity: 0.9; transform: scale(1); }
        }
        .bot-float-group { animation: bot-float 3s ease-in-out infinite; transform-origin: center; }
        .bot-eye-glow { animation: bot-eye-glow 2.6s ease-in-out infinite; }
        .bot-antenna-tip { animation: bot-antenna-glow 2s ease-in-out infinite; }
        .bot-antenna-tip-right { animation-delay: 0.15s; }
        .bot-core { animation: bot-core-pulse 2.4s ease-in-out infinite; transform-origin: 80px 128px; }
      `}</style>

      <svg
        width={size}
        height={size * 1.1875}
        viewBox="0 0 160 190"
        role="img"
        aria-label="AI health assistant mascot"
      >
        <defs>
          <linearGradient id="botHeadGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="100%" stopColor="#DCE4F5" />
          </linearGradient>
          <linearGradient id="botBodyGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#F0F4FE" />
            <stop offset="100%" stopColor="#CBD8F3" />
          </linearGradient>
          <linearGradient id="botScreenGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#1E2A4A" />
            <stop offset="100%" stopColor="#0B1224" />
          </linearGradient>
          <radialGradient id="botEyeGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#BAE6FD" />
            <stop offset="55%" stopColor="#38BDF8" />
            <stop offset="100%" stopColor="#0EA5E9" />
          </radialGradient>
        </defs>

        <g className="bot-float-group">
          {/* ground shadow — directly under the body, part of the same group */}
          <ellipse cx="80" cy="182" rx="32" ry="6" fill="#000000" opacity="0.08" />

          {/* antennae */}
          <line x1="58" y1="42" x2="50" y2="20" stroke="#B9C6E6" strokeWidth="2.5" strokeLinecap="round" />
          <circle className="bot-antenna-tip" cx="50" cy="16" r="4.5" fill="#38BDF8" />
          <line x1="102" y1="42" x2="110" y2="20" stroke="#B9C6E6" strokeWidth="2.5" strokeLinecap="round" />
          <circle className="bot-antenna-tip bot-antenna-tip-right" cx="110" cy="16" r="4.5" fill="#38BDF8" />

          {/* head shell */}
          <rect x="30" y="40" width="100" height="78" rx="28" fill="url(#botHeadGradient)" stroke="#B9C6E6" strokeWidth="1" />

          {/* small side ear/vent details */}
          <rect x="24" y="66" width="7" height="24" rx="3.5" fill="#DCE4F5" stroke="#B9C6E6" strokeWidth="0.75" />
          <rect x="129" y="66" width="7" height="24" rx="3.5" fill="#DCE4F5" stroke="#B9C6E6" strokeWidth="0.75" />

          {/* dark screen face */}
          <rect x="44" y="54" width="72" height="52" rx="18" fill="url(#botScreenGradient)" />

          {/* eyes + synced blink */}
          <g style={{ transform: blink ? 'scaleY(0.08)' : 'scaleY(1)', transformOrigin: '80px 78px', transition: 'transform 90ms ease' }}>
            <circle className="bot-eye-glow" cx="65" cy="78" r="8" fill="url(#botEyeGlow)" />
            <circle cx="65" cy="78" r="3" fill="#F0FBFF" opacity="0.9" />
            <circle className="bot-eye-glow" cx="95" cy="78" r="8" fill="url(#botEyeGlow)" />
            <circle cx="95" cy="78" r="3" fill="#F0FBFF" opacity="0.9" />
          </g>

          {/* subtle smile */}
          <path d="M 68 92 Q 80 98 92 92" fill="none" stroke="#38BDF8" strokeWidth="2" strokeLinecap="round" opacity="0.75" />

          {/* neck */}
          <rect x="68" y="118" width="24" height="10" rx="4" fill="#CBD8F3" />

          {/* body */}
          <rect x="36" y="126" width="88" height="50" rx="22" fill="url(#botBodyGradient)" stroke="#B9C6E6" strokeWidth="1" />

          {/* shoulder joints */}
          <circle cx="40" cy="140" r="7" fill="#DCE4F5" stroke="#B9C6E6" strokeWidth="0.75" />
          <circle cx="120" cy="140" r="7" fill="#DCE4F5" stroke="#B9C6E6" strokeWidth="0.75" />

          {/* chest core, pulsing */}
          <circle className="bot-core" cx="80" cy="128" r="9" fill="#38BDF8" opacity="0.55" />
          <circle cx="80" cy="156" r="7" fill="#7DD3FC" opacity="0.85" />
          <circle cx="80" cy="156" r="3" fill="#F0FBFF" opacity="0.9" />
        </g>
      </svg>
    </div>
  );
}
