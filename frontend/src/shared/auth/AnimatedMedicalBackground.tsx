import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { C } from './tokens';
import { Capsule, HeartEcg, MedicalShield, PlusMark, Prescription, Stethoscope } from './MedicalArt';
import ParallaxLayer from './ParallaxLayer';
import { usePointerParallax, type ParallaxOrigin } from './usePointerParallax';
import { useReducedMotion } from './useReducedMotion';
import patientImg from './assets/patient-symptoms.png';
import doctorImg from './assets/doctor-consultation.png';
import healthyImg from './assets/healthy-woman.png';

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

      {/* Stethoscope: largest object, deepest parallax, low-left corner. */}
      <ParallaxLayer
        origin={origin}
        strength={10}
        className="absolute left-[2%] bottom-[6%] hidden xl:block"
      >
        <FloatingObject float="hn-float-a" opacity={0.5}>
          <Stethoscope size={168} />
        </FloatingObject>
      </ParallaxLayer>

      {/* Heart + ECG: sits with the stethoscope in the low-left corner, the
          one object from that pair that survives on every breakpoint. */}
      <ParallaxLayer origin={origin} strength={6} className="absolute left-[10%] bottom-[16%] sm:left-[13%]">
        <FloatingObject float="hn-float-b" opacity={0.62}>
          <HeartEcg size={100} animated={!reduced} />
        </FloatingObject>
      </ParallaxLayer>

      {/* Prescription paper (with its drawn signature): low-right corner,
          the "documents" half of the story. */}
      <ParallaxLayer
        origin={origin}
        strength={8}
        className="absolute right-[3%] bottom-[8%] hidden xl:block"
      >
        <FloatingObject float="hn-float-c" opacity={0.55}>
          <Prescription size={128} />
        </FloatingObject>
      </ParallaxLayer>

      {/* Shield: security, low-right — kept on tablet because it carries
          the privacy message the security badge repeats in words. */}
      <ParallaxLayer origin={origin} strength={7} className="absolute bottom-[20%] right-[13%] hidden sm:block">
        <FloatingObject float="hn-float-d" opacity={0.5}>
          <MedicalShield size={92} animated={!reduced} />
        </FloatingObject>
      </ParallaxLayer>

      {/* 4a — the story: symptoms → doctor → treatment → better health,
          each a photo-illustration cluster with a labelled pill underneath,
          threaded together by the journey line below. Wide layout only —
          four extra clusters have nowhere honest to go once the viewport
          narrows, so they hide rather than crowd the card. */}
      <div className="pointer-events-none absolute inset-0 hidden 2xl:block">
        {/* the connecting journey line, drawn once behind every cluster */}
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 100 45"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            d="M6 34 C 14 18, 20 14, 27 20 C 34 26, 40 30, 50 26 C 60 22, 66 12, 74 16 C 82 20, 88 24, 94 34"
            fill="none"
            stroke={C.purple}
            strokeOpacity="0.22"
            strokeWidth="0.35"
            strokeLinecap="round"
          />
          <path
            d="M6 34 C 14 18, 20 14, 27 20 C 34 26, 40 30, 50 26 C 60 22, 66 12, 74 16 C 82 20, 88 24, 94 34"
            fill="none"
            stroke={C.tealSoft}
            strokeWidth="0.5"
            strokeLinecap="round"
            strokeDasharray="1.4 12"
            className={reduced ? '' : 'hn-flow-run'}
            style={{ opacity: 0.85 }}
          />
        </svg>

        <StoryCluster
          origin={origin}
          strength={5}
          left="4%"
          top="9%"
          label="Symptoms"
          tone="purple"
        >
          <div className="relative">
            <CharacterArt src={patientImg} alt="" size={168} float="hn-float-b" />
            <SymptomBadge icon="thermometer" label="Fever" tone="purple" style={{ left: -18, top: -6 }} delay={0} />
            <SymptomBadge icon="zap" label="Headache" tone="teal" style={{ left: 108, top: 14 }} delay={0.8} />
            <SymptomBadge icon="battery" label="Fatigue" tone="purple" style={{ left: 90, top: 128 }} delay={1.6} />
          </div>
        </StoryCluster>

        <StoryCluster
          origin={origin}
          strength={4}
          left="23%"
          top="4%"
          label="Doctor Consultation"
          tone="teal"
        >
          <CharacterArt src={doctorImg} alt="" size={176} float="hn-float-c" />
        </StoryCluster>

        <StoryCluster
          origin={origin}
          strength={4}
          left="66%"
          top="4%"
          label="Treatment"
          tone="blue"
        >
          <div className="relative">
            <Prescription size={112} />
            <div className="absolute" style={{ left: -14, top: 66 }}>
              <Capsule size={58} />
            </div>
            <div className="absolute" style={{ right: -20, top: -18 }}>
              <MedicalShield size={44} animated={!reduced} />
            </div>
          </div>
        </StoryCluster>

        <StoryCluster
          origin={origin}
          strength={5}
          left="87%"
          top="7%"
          label="Better Health"
          tone="teal"
        >
          <CharacterArt src={healthyImg} alt="" size={168} float="hn-float-a" />
        </StoryCluster>
      </div>

      <ParallaxLayer
        origin={origin}
        strength={5}
        className="absolute bottom-[24%] left-[18%] hidden xl:block"
      >
        <FloatingObject float="hn-float-c" opacity={0.5}>
          <Capsule size={82} />
        </FloatingObject>
      </ParallaxLayer>

      <ParallaxLayer
        origin={origin}
        strength={4}
        className="absolute right-[22%] top-[7%] hidden xl:block 2xl:hidden"
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

/**
 * One "chapter" of the story line: a parallax layer positioned by
 * percentage, holding whatever art the chapter needs, with the labelled
 * pill (the small "● Symptoms" style tag) centred underneath it.
 */
function StoryCluster({
  origin,
  strength,
  left,
  top,
  label,
  tone,
  children,
}: {
  origin: ParallaxOrigin;
  strength: number;
  left: string;
  top: string;
  label: string;
  tone: 'purple' | 'teal' | 'blue';
  children: ReactNode;
}) {
  return (
    <ParallaxLayer origin={origin} strength={strength} className="absolute" style={{ left, top }}>
      <div className="pointer-events-auto">{children}</div>
      <StoryLabel tone={tone}>{label}</StoryLabel>
    </ParallaxLayer>
  );
}

/**
 * The small pill tag under each cluster — a dot in the chapter's tone plus
 * its name, on a soft white card, matching the reference mock's labels.
 */
function StoryLabel({ tone, children }: { tone: 'purple' | 'teal' | 'blue'; children: ReactNode }) {
  const dot = tone === 'teal' ? C.teal : tone === 'blue' ? C.blue : C.purple;
  return (
    <div
      className="mt-3 inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-white/80 px-3 py-1 text-[11px] font-medium shadow-sm backdrop-blur-sm"
      style={{ color: C.ink700 }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: dot }} />
      {children}
    </div>
  );
}

/**
 * One of the three generated character illustrations. A soft radial glow
 * sits behind it for the same reason MedicalArt's shapes carry one — it
 * keeps a flat PNG from reading as "pasted on" — and it floats on the same
 * drift loops the hand-drawn objects use, so nothing on the page moves on
 * its own private rhythm.
 */
function CharacterArt({
  src,
  alt,
  size,
  float,
}: {
  src: string;
  alt: string;
  size: number;
  float: string;
}) {
  return (
    <div className={`relative ${float}`} style={{ willChange: 'transform', width: size, height: size }}>
      <div
        className="absolute inset-0 rounded-full blur-2xl"
        style={{ background: `radial-gradient(circle, ${C.lavender} 0%, transparent 70%)`, opacity: 0.9 }}
      />
      <motion.img
        src={src}
        alt={alt}
        width={size}
        height={size}
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 0.95, scale: 1 }}
        transition={{ duration: 1.1, delay: 0.2 }}
        className="relative select-none"
        draggable={false}
      />
    </div>
  );
}

/* -- Symptom badges ---------------------------------------------------- */

const SYMPTOM_ICONS = {
  thermometer: (
    <path
      d="M8 2a1.5 1.5 0 0 0-1.5 1.5v6.65a3.5 3.5 0 1 0 3 0V3.5A1.5 1.5 0 0 0 8 2Z"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  ),
  zap: (
    <path
      d="M8.8 1.5 2.5 9.2h3.7L5.2 14.5l6.3-7.7H7.8l1-5.3Z"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="currentColor"
      fillOpacity="0.15"
    />
  ),
  battery: (
    <>
      <rect x="1.5" y="5" width="10.5" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.3" fill="none" />
      <path d="M13.2 6.6h1v2.8h-1z" fill="currentColor" />
      <rect x="3" y="6.5" width="2.4" height="3" rx="0.5" fill="currentColor" />
    </>
  ),
} as const;

/**
 * One floating diagnosis chip — icon, short label, its own gentle drift,
 * staggered by `delay` so the three around the patient illustration never
 * move in lockstep.
 */
function SymptomBadge({
  icon,
  label,
  tone,
  style,
  delay,
}: {
  icon: keyof typeof SYMPTOM_ICONS;
  label: string;
  tone: 'purple' | 'teal';
  style: { left: number; top: number };
  delay: number;
}) {
  const color = tone === 'teal' ? C.teal : C.purple;
  return (
    <motion.div
      className="absolute flex items-center gap-1.5 whitespace-nowrap rounded-full bg-white px-2.5 py-1.5 text-[10.5px] font-semibold shadow-md hn-float-c"
      style={{ ...style, color: C.ink700, animationDelay: `${delay}s`, opacity: 0.95 }}
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.6, delay: 0.4 + delay * 0.2 }}
    >
      <svg width="14" height="14" viewBox="0 0 16 16" style={{ color }}>
        {SYMPTOM_ICONS[icon]}
      </svg>
      {label}
    </motion.div>
  );
}
