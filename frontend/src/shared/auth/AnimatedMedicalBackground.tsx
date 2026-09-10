import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { C } from './tokens';
import { Capsule, HeartEcg, MedicalShield, PlusMark, Prescription, Stethoscope } from './MedicalArt';
import ParallaxLayer from './ParallaxLayer';
import { usePointerParallax } from './usePointerParallax';
import { useReducedMotion } from './useReducedMotion';

/**
 * The animated environment behind the auth card.
 *
 * Layered back to front:
 *   1. a static base gradient          (never animated — it is the ground)
 *   2. three slow blurred colour blobs (the "alive" feeling)
 *   3. concentric orbit rings + travelling dots
 *   4. six illustrated medical objects, each on its own parallax depth
 *   5. a scatter of small particles
 *   6. a centre wash that lifts the card off the busiest part of the scene
 *
 * Parallax strength climbs with visual nearness — particles 2px, plus
 * signs 4px, heart 6px, prescription 8px, stethoscope 10px — which is
 * what sells the depth. The card itself is not in this tree and does not
 * move with the pointer.
 *
 * Everything here is inert to input: the whole component is
 * pointer-events-none, and only the six objects opt back in so they can
 * respond to hover. That guarantees the background can never swallow a
 * click meant for the form.
 */

/* Fixed rather than random so the layout is identical on every render and
   across reloads — a re-randomising starfield reads as jitter, not life. */
const PARTICLES = [
  { l: 8, t: 22, s: 4, d: 13, delay: 0 },
  { l: 15, t: 68, s: 3, d: 16, delay: 2.5 },
  { l: 22, t: 40, s: 5, d: 11, delay: 1.2 },
  { l: 27, t: 85, s: 3, d: 18, delay: 4 },
  { l: 34, t: 14, s: 4, d: 14, delay: 3.1 },
  { l: 38, t: 58, s: 3, d: 17, delay: 0.6 },
  { l: 44, t: 91, s: 4, d: 12, delay: 5.2 },
  { l: 49, t: 8, s: 3, d: 19, delay: 2 },
  { l: 56, t: 33, s: 5, d: 15, delay: 3.8 },
  { l: 61, t: 76, s: 3, d: 13, delay: 1.5 },
  { l: 66, t: 19, s: 4, d: 16, delay: 4.6 },
  { l: 71, t: 52, s: 3, d: 20, delay: 0.3 },
  { l: 77, t: 88, s: 4, d: 14, delay: 2.8 },
  { l: 82, t: 30, s: 3, d: 17, delay: 5.5 },
  { l: 88, t: 63, s: 5, d: 12, delay: 1.9 },
  { l: 93, t: 11, s: 3, d: 18, delay: 3.4 },
  { l: 5, t: 50, s: 3, d: 15, delay: 4.2 },
  { l: 19, t: 5, s: 4, d: 21, delay: 0.9 },
  { l: 45, t: 46, s: 3, d: 16, delay: 6 },
  { l: 58, t: 96, s: 4, d: 13, delay: 2.2 },
  { l: 74, t: 42, s: 3, d: 19, delay: 5 },
  { l: 96, t: 79, s: 4, d: 14, delay: 3.6 },
] as const;

/* Plus signs get their own table — different sizes, tones and speeds, so
   they never pulse in lockstep. */
const PLUSES = [
  { l: '30%', t: '16%', size: 26, tone: 'purple', dur: 11, delay: 0, depth: 4, hide: '' },
  { l: '68%', t: '10%', size: 18, tone: 'teal', dur: 13, delay: 2.4, depth: 3, hide: '' },
  { l: '78%', t: '62%', size: 34, tone: 'purple', dur: 9.5, delay: 1.1, depth: 5, hide: '' },
  { l: '17%', t: '78%', size: 22, tone: 'teal', dur: 14, delay: 3.7, depth: 4, hide: 'hidden sm:block' },
  { l: '52%', t: '92%', size: 16, tone: 'purple', dur: 12, delay: 5, depth: 3, hide: 'hidden lg:block' },
  { l: '89%', t: '34%', size: 20, tone: 'purple', dur: 10.5, delay: 1.8, depth: 4, hide: 'hidden lg:block' },
] as const;

/* Each ring carries one travelling dot. Alternating direction keeps the
   motion from reading as a single spinning disc. */
const RINGS = [
  { r: 172, spin: 'hn-orbit', dot: C.purple, opacity: 0.1 },
  { r: 262, spin: 'hn-orbit-rev', dot: C.teal, opacity: 0.085 },
  { r: 356, spin: 'hn-orbit', dot: C.purpleSoft, opacity: 0.07 },
] as const;

export default function AnimatedMedicalBackground() {
  const origin = usePointerParallax();
  const reduced = useReducedMotion();

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {/* 1 — base gradient */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(158deg, #FFFFFF 0%, #FBFAFF 28%, #F4F1FD 58%, #EFF3FE 82%, #F6F7FB 100%)',
        }}
      />

      {/* 2 — colour blobs */}
      <div
        className="hn-blob-a absolute -left-[12%] -top-[18%] h-[620px] w-[620px] rounded-full opacity-60 blur-[90px]"
        style={{ background: `radial-gradient(circle, ${C.purple}38 0%, ${C.purple}00 70%)` }}
      />
      <div
        className="hn-blob-b absolute -bottom-[22%] -right-[10%] h-[700px] w-[700px] rounded-full opacity-55 blur-[100px]"
        style={{ background: `radial-gradient(circle, ${C.blue}30 0%, ${C.blue}00 70%)` }}
      />
      <div
        className="hn-blob-c absolute -bottom-[14%] left-[6%] h-[460px] w-[460px] rounded-full opacity-40 blur-[90px]"
        style={{ background: `radial-gradient(circle, ${C.teal}2E 0%, ${C.teal}00 70%)` }}
      />

      {/* 3 — orbit rings, centred on the card */}
      <ParallaxLayer
        origin={origin}
        strength={3}
        className="absolute inset-0 flex items-center justify-center"
      >
        <div className="relative scale-[0.5] sm:scale-75 lg:scale-100">
          {RINGS.map((ring) => (
            <div
              key={ring.r}
              className="absolute rounded-full border"
              style={{
                width: ring.r * 2,
                height: ring.r * 2,
                left: -ring.r,
                top: -ring.r,
                borderColor: `${C.purple}`,
                opacity: ring.opacity,
                borderWidth: 1,
              }}
            />
          ))}
          {RINGS.map((ring) => (
            <div
              key={`dot-${ring.r}`}
              className={`absolute ${ring.spin}`}
              style={{ width: ring.r * 2, height: ring.r * 2, left: -ring.r, top: -ring.r }}
            >
              <span
                className="absolute rounded-full"
                style={{
                  width: 6,
                  height: 6,
                  left: ring.r - 3,
                  top: -3,
                  background: ring.dot,
                  opacity: 0.5,
                  boxShadow: `0 0 10px ${ring.dot}`,
                }}
              />
            </div>
          ))}
        </div>
      </ParallaxLayer>

      {/* 4 — the medical objects */}

      {/* Stethoscope: largest object, deepest parallax, left flank. */}
      <ParallaxLayer
        origin={origin}
        strength={10}
        className="absolute left-[3%] top-[26%] hidden xl:block"
      >
        <FloatingObject float="hn-float-a" opacity={0.5}>
          <Stethoscope size={188} />
        </FloatingObject>
      </ParallaxLayer>

      {/* Heart + ECG: the one object that survives on every breakpoint. */}
      <ParallaxLayer origin={origin} strength={6} className="absolute left-[9%] top-[9%] sm:left-[12%]">
        <FloatingObject float="hn-float-b" opacity={0.62}>
          <HeartEcg size={112} animated={!reduced} />
        </FloatingObject>
      </ParallaxLayer>

      {/* Prescription: right flank, the "documents" half of the story. */}
      <ParallaxLayer
        origin={origin}
        strength={8}
        className="absolute right-[4%] top-[17%] hidden xl:block"
      >
        <FloatingObject float="hn-float-c" opacity={0.55}>
          <Prescription size={148} />
        </FloatingObject>
      </ParallaxLayer>

      {/* Shield: security, low-right — kept on tablet because it carries
          the privacy message the security badge repeats in words. */}
      <ParallaxLayer origin={origin} strength={7} className="absolute bottom-[12%] right-[8%] hidden sm:block">
        <FloatingObject float="hn-float-d" opacity={0.5}>
          <MedicalShield size={104} animated={!reduced} />
        </FloatingObject>
      </ParallaxLayer>

      <ParallaxLayer
        origin={origin}
        strength={5}
        className="absolute bottom-[18%] left-[13%] hidden xl:block"
      >
        <FloatingObject float="hn-float-c" opacity={0.5}>
          <Capsule size={82} />
        </FloatingObject>
      </ParallaxLayer>

      <ParallaxLayer
        origin={origin}
        strength={4}
        className="absolute right-[22%] top-[7%] hidden xl:block"
      >
        <FloatingObject float="hn-float-b" opacity={0.42}>
          <Capsule size={54} />
        </FloatingObject>
      </ParallaxLayer>

      {PLUSES.map((p) => (
        // inset-0 matters: the plus is positioned by percentage, so its
        // parallax layer has to span the viewport for those percentages to
        // resolve against anything. Coordinates live in style rather than
        // Tailwind classes because they are data the compiler can't see.
        <ParallaxLayer
          key={`${p.l}-${p.t}`}
          origin={origin}
          strength={p.depth}
          className={`absolute inset-0 ${p.hide}`}
        >
          <div
            className="hn-drift-fade absolute"
            style={{
              left: p.l,
              top: p.t,
              animationDuration: `${p.dur}s`,
              animationDelay: `${p.delay}s`,
              willChange: 'transform, opacity',
            }}
          >
            <PlusMark size={p.size} tone={p.tone} />
          </div>
        </ParallaxLayer>
      ))}

      {/* 5 — particles */}
      <ParallaxLayer origin={origin} strength={2} className="absolute inset-0">
        {PARTICLES.map((p, i) => (
          <span
            key={i}
            className={`hn-particle absolute rounded-full ${i > 13 ? 'hidden sm:block' : ''}`}
            style={{
              left: `${p.l}%`,
              top: `${p.t}%`,
              width: p.s,
              height: p.s,
              background: i % 3 === 0 ? C.teal : i % 3 === 1 ? C.purple : C.blue,
              animationDuration: `${p.d}s`,
              animationDelay: `${p.delay}s`,
            }}
          />
        ))}
      </ParallaxLayer>

      {/* 6 — centre wash. Without this the card sits on top of the busiest
          part of the scene and the form text loses contrast. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 620px 520px at 50% 50%, rgba(255,255,255,0.72) 0%, rgba(255,255,255,0.34) 45%, rgba(255,255,255,0) 72%)',
        }}
      />

      {/* A whisper of grain stops the large gradients from banding on
          wide, low-bit-depth displays. */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.035 }}
        transition={{ duration: 1.2 }}
        className="absolute inset-0 mix-blend-multiply"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
    </div>
  );
}

/**
 * One floating object: a CSS drift loop, plus a hover response.
 *
 * `pointer-events-auto` is re-enabled only here so the objects can
 * brighten under the cursor while the rest of the background stays
 * completely transparent to input. The hover is deliberately small —
 * 1.03 and a little opacity — because objects that lunge at the cursor
 * read as a toy, not a medical product.
 */
function FloatingObject({
  children,
  float,
  opacity,
}: {
  children: ReactNode;
  float: string;
  opacity: number;
}) {
  return (
    <div className={float} style={{ willChange: 'transform' }}>
      <motion.div
        className="pointer-events-auto cursor-default"
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity, scale: 1 }}
        whileHover={{ opacity: Math.min(opacity + 0.22, 1), scale: 1.03 }}
        transition={{ opacity: { duration: 1.1, delay: 0.15 }, scale: { duration: 0.35 } }}
      >
        {children}
      </motion.div>
    </div>
  );
}
