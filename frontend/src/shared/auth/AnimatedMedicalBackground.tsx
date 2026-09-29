import { useId, type ReactNode } from 'react';
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
  { l: 3, t: 35, s: 3, d: 15, delay: 2.9 },
  { l: 12, t: 58, s: 4, d: 12, delay: 4.4 },
  { l: 25, t: 6, s: 3, d: 17, delay: 1.3 },
  { l: 31, t: 63, s: 5, d: 14, delay: 5.8 },
  { l: 40, t: 30, s: 3, d: 19, delay: 0.4 },
  { l: 52, t: 62, s: 4, d: 13, delay: 3.3 },
  { l: 63, t: 8, s: 3, d: 16, delay: 4.9 },
  { l: 69, t: 68, s: 4, d: 18, delay: 1.6 },
  { l: 85, t: 48, s: 3, d: 15, delay: 5.1 },
  { l: 91, t: 92, s: 5, d: 12, delay: 2.6 },
] as const;

/* Plus signs get their own table — different sizes, tones and speeds, so
   they never pulse in lockstep. Doubled up from the original set so the
   wide mid-canvas bands (which have nothing else in them) aren't bare. */
const PLUSES = [
  { l: '30%', t: '16%', size: 26, tone: 'purple', dur: 11, delay: 0, depth: 4, hide: '' },
  { l: '68%', t: '10%', size: 18, tone: 'teal', dur: 13, delay: 2.4, depth: 3, hide: '' },
  { l: '78%', t: '62%', size: 34, tone: 'purple', dur: 9.5, delay: 1.1, depth: 5, hide: '' },
  { l: '17%', t: '78%', size: 22, tone: 'teal', dur: 14, delay: 3.7, depth: 4, hide: 'hidden sm:block' },
  { l: '52%', t: '92%', size: 16, tone: 'purple', dur: 12, delay: 5, depth: 3, hide: 'hidden lg:block' },
  { l: '89%', t: '34%', size: 20, tone: 'purple', dur: 10.5, delay: 1.8, depth: 4, hide: 'hidden lg:block' },
  { l: '9%', t: '48%', size: 20, tone: 'teal', dur: 12.5, delay: 2.9, depth: 4, hide: 'hidden lg:block' },
  { l: '41%', t: '8%', size: 15, tone: 'purple', dur: 10, delay: 4.2, depth: 3, hide: 'hidden md:block' },
  { l: '58%', t: '84%', size: 24, tone: 'teal', dur: 13.5, delay: 0.7, depth: 4, hide: 'hidden sm:block' },
  { l: '95%', t: '58%', size: 17, tone: 'purple', dur: 11.5, delay: 3.4, depth: 3, hide: 'hidden lg:block' },
  { l: '4%', t: '90%', size: 19, tone: 'teal', dur: 14.5, delay: 1.4, depth: 4, hide: 'hidden md:block' },
  { l: '35%', t: '95%', size: 14, tone: 'purple', dur: 9, delay: 5.4, depth: 3, hide: 'hidden lg:block' },
] as const;

/* A scatter of tiny twinkling glints — the little bright pinpricks the
   reference mock has drifting along its wave. Pure decoration, no medical
   meaning, just something living in the otherwise-bare mid-canvas. */
const GLINTS = [
  { l: 12, t: 12, size: 5, delay: 0 },
  { l: 30, t: 45, size: 6, delay: 1.4 },
  { l: 46, t: 20, size: 4, delay: 2.8 },
  { l: 54, t: 70, size: 5, delay: 0.6 },
  { l: 62, t: 38, size: 6, delay: 3.6 },
  { l: 73, t: 14, size: 4, delay: 2.1 },
  { l: 81, t: 55, size: 5, delay: 4.4 },
  { l: 90, t: 22, size: 6, delay: 1.1 },
  { l: 20, t: 82, size: 4, delay: 3.2 },
  { l: 67, t: 88, size: 5, delay: 0.2 },
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
        className="absolute left-[1%] bottom-[3%] hidden xl:block"
      >
        <FloatingObject float="hn-float-a" opacity={0.5}>
          <Stethoscope size={240} />
        </FloatingObject>
      </ParallaxLayer>

      {/* Heart + ECG: pushed further right and higher than the stethoscope
          — before they crowded the same corner, now they spread across
          the whole low-left quadrant instead of the one corner. Still the
          one object from this pair that survives on every breakpoint. */}
      <ParallaxLayer origin={origin} strength={6} className="absolute left-[19%] bottom-[13%] sm:left-[21%]">
        <FloatingObject float="hn-float-b" opacity={0.62}>
          <HeartEcg size={158} animated={!reduced} />
        </FloatingObject>
      </ParallaxLayer>

      {/* Prescription paper (with its drawn signature): low-right corner,
          the "documents" half of the story. */}
      <ParallaxLayer
        origin={origin}
        strength={8}
        className="absolute right-[2%] bottom-[4%] hidden xl:block"
      >
        <FloatingObject float="hn-float-c" opacity={0.55}>
          <Prescription size={184} />
        </FloatingObject>
      </ParallaxLayer>

      {/* Shield: security, spread further from the prescription so the
          low-right quadrant fills out the same way the low-left one does
          — kept on tablet because it carries the privacy message the
          security badge repeats in words. */}
      <ParallaxLayer origin={origin} strength={7} className="absolute bottom-[22%] right-[17%] hidden sm:block">
        <FloatingObject float="hn-float-d" opacity={0.5}>
          <MedicalShield size={140} animated={!reduced} />
        </FloatingObject>
      </ParallaxLayer>

      {/* A second, smaller heartbeat up in the top band, between the
          Symptoms and Doctor Consultation clusters — the upper half had
          a wide gap of bare gradient with nothing living in it. */}
      <ParallaxLayer origin={origin} strength={5} className="absolute left-[16%] top-[5%] hidden 2xl:block">
        <FloatingObject float="hn-float-d" opacity={0.45}>
          <HeartEcg size={68} animated={!reduced} />
        </FloatingObject>
      </ParallaxLayer>

      {/* ...and its mirror on the right, between Treatment and Better
          Health, for the same reason. */}
      <ParallaxLayer origin={origin} strength={5} className="absolute right-[13%] top-[3%] hidden 2xl:block">
        <FloatingObject float="hn-float-a" opacity={0.4}>
          <Capsule size={64} />
        </FloatingObject>
      </ParallaxLayer>

      {/* 4a — the story: symptoms → doctor → treatment → better health,
          each a photo-illustration cluster with a labelled pill underneath,
          threaded together by the journey line below. Every position here
          is lifted straight from the reference mock (measured in its own
          1672×941 pixel space, then expressed as a percentage) rather than
          eyeballed, so the composition matches it point for point. Wide
          layout only — four extra clusters have nowhere honest to go once
          the viewport narrows, so they hide rather than crowd the card. */}
      <div className="pointer-events-none absolute inset-0 hidden 2xl:block">
        {/* the connecting journey line: one thin, pale, mostly-still path —
            the mock's line is barely there, not a bold animated stripe —
            plus three small arrows marking each hand-off. */}
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 1672 941"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            d="M0,300 C100,345 200,345 300,290 C370,255 430,270 460,295 C520,340 560,330 600,270
               C700,190 800,260 850,330 C950,400 1020,315 1080,270 C1140,225 1165,255 1200,300
               C1260,355 1320,350 1360,320 C1410,285 1440,300 1470,318 C1550,360 1610,315 1672,295"
            fill="none"
            stroke={C.white}
            strokeOpacity="0.65"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            d="M0,300 C100,345 200,345 300,290 C370,255 430,270 460,295 C520,340 560,330 600,270
               C700,190 800,260 850,330 C950,400 1020,315 1080,270 C1140,225 1165,255 1200,300
               C1260,355 1320,350 1360,320 C1410,285 1440,300 1470,318 C1550,360 1610,315 1672,295"
            fill="none"
            stroke={C.purpleSoft}
            strokeOpacity="0.35"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray="4 70"
            className={reduced ? '' : 'hn-flow-run'}
          />
          <JourneyArrow x={300} y={290} rotate={-18} />
          <JourneyArrow x={1080} y={270} rotate={-12} />
          <JourneyArrow x={1360} y={320} rotate={-6} />
        </svg>

        <StoryCluster origin={origin} strength={5} left="1%" top="21%" label="Symptoms" tone="purple">
          <div className="relative">
            <CharacterArt src={patientImg} alt="" size={220} float="hn-float-b" />
            <SymptomBadge icon="thermometer" label="Fever" tone="purple" style={{ left: 82, top: 50 }} delay={0} />
            <SymptomBadge icon="zap" label="Headache" tone="purple" style={{ left: 150, top: 80 }} delay={0.8} />
            <SymptomBadge icon="battery" label="Fatigue" tone="pink" style={{ left: 168, top: 134 }} delay={1.6} />
          </div>
        </StoryCluster>

        <StoryCluster origin={origin} strength={4} left="23%" top="15%" label="Doctor Consultation" tone="teal">
          <div className="relative">
            <CharacterArt src={doctorImg} alt="" size={220} float="hn-float-c" />
            <div className="absolute" style={{ left: 88, top: -26 }}>
              <FloatingObject float="hn-float-d" opacity={0.95}>
                <PlusBadge size={58} />
              </FloatingObject>
            </div>
          </div>
        </StoryCluster>

        <StoryCluster origin={origin} strength={4} left="70%" top="20%" label="Treatment" tone="blue">
          <div className="relative">
            <div className="absolute" style={{ left: -62, top: -60 }}>
              <FloatingObject float="hn-float-b" opacity={0.7}>
                <span
                  className="block rounded-full"
                  style={{
                    width: 24,
                    height: 24,
                    background: `radial-gradient(circle at 35% 30%, ${C.white}, ${C.tealSoft} 60%, ${C.teal} 100%)`,
                    boxShadow: `0 0 16px ${C.teal}55`,
                  }}
                />
              </FloatingObject>
            </div>
            <FloatingObject float="hn-float-c" opacity={1}>
              <Prescription size={130} />
            </FloatingObject>
            <div className="absolute" style={{ left: 52, top: 92 }}>
              <FloatingObject float="hn-float-a" opacity={1}>
                <BlisterPack width={96} />
              </FloatingObject>
            </div>
            <div className="absolute" style={{ left: 98, top: 16 }}>
              <FloatingObject float="hn-float-d" opacity={1}>
                <MedicalShield size={62} animated={!reduced} />
              </FloatingObject>
            </div>
          </div>
        </StoryCluster>

        <StoryCluster origin={origin} strength={5} left="84%" top="16%" label="Better Health" tone="teal">
          <div className="relative">
            <div className="absolute" style={{ left: 92, top: -86 }}>
              <FloatingObject float="hn-float-a" opacity={0.6}>
                <PlusMark size={34} tone="purple" />
              </FloatingObject>
            </div>
            <CharacterArt src={healthyImg} alt="" size={220} float="hn-float-a" />
            <div className="absolute" style={{ left: 148, top: 6 }}>
              <FloatingObject float="hn-float-b" opacity={0.85}>
                <HeartBadge size={58} />
              </FloatingObject>
            </div>
            <div className="absolute" style={{ left: -4, top: 36 }}>
              <FloatingObject float="hn-float-c" opacity={0.8}>
                <SparkleBadge size={42} />
              </FloatingObject>
            </div>
          </div>
        </StoryCluster>
      </div>

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

      {/* 5a — tiny twinkling glints, scattered across the mid-canvas so
          the wide bare bands between the corner objects and the card
          aren't empty gradient. */}
      <ParallaxLayer origin={origin} strength={1} className="absolute inset-0 hidden md:block">
        {GLINTS.map((g, i) => (
          <span
            key={i}
            className="hn-twinkle absolute rounded-full"
            style={{
              left: `${g.l}%`,
              top: `${g.t}%`,
              width: g.size,
              height: g.size,
              background: C.white,
              boxShadow: `0 0 ${g.size * 2}px ${C.white}, 0 0 ${g.size}px ${C.tealSoft}`,
              animationDelay: `${g.delay}s`,
            }}
          />
        ))}
      </ParallaxLayer>

      {/* A couple of extra medical accents in the wide mid-left / mid-right
          bands — otherwise the largest stretch of the page has nothing in
          it but blob gradient. */}
      <ParallaxLayer origin={origin} strength={3} className="absolute left-[6%] top-[52%] hidden lg:block">
        <FloatingObject float="hn-float-c" opacity={0.4}>
          <PlusMark size={22} tone="teal" />
        </FloatingObject>
      </ParallaxLayer>
      <ParallaxLayer origin={origin} strength={3} className="absolute right-[7%] top-[46%] hidden lg:block">
        <FloatingObject float="hn-float-b" opacity={0.4}>
          <Capsule size={48} />
        </FloatingObject>
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
      className="hn-float-d hn-pulse-soft mt-3 inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-white/80 px-3 py-1 text-[11px] font-medium shadow-sm backdrop-blur-sm"
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
    <div
      className={`relative ${float} hn-pulse-slow`}
      style={{ willChange: 'transform', width: size, height: size }}
    >
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
        animate={{ opacity: 0.82, scale: 1 }}
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
const SYMPTOM_TONES = { purple: C.purple, teal: C.teal, pink: '#E0669B' } as const;

function SymptomBadge({
  icon,
  label,
  tone,
  style,
  delay,
}: {
  icon: keyof typeof SYMPTOM_ICONS;
  label: string;
  tone: keyof typeof SYMPTOM_TONES;
  style: { left: number; top: number };
  delay: number;
}) {
  const color = SYMPTOM_TONES[tone];
  return (
    <motion.div
      className="absolute flex items-center gap-1.5 whitespace-nowrap rounded-full bg-white px-2.5 py-1.5 text-[10.5px] font-semibold shadow-md hn-float-c hn-pulse-soft"
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

/* -- Small accent badges, one per cluster ------------------------------ */

/** The chevron marking each hand-off on the journey line. */
function JourneyArrow({ x, y, rotate }: { x: number; y: number; rotate: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate})`} opacity="0.55">
      <path
        d="M-9,-11 L9,0 L-9,11"
        fill="none"
        stroke={C.purple}
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  );
}

/** The small blue rounded-square "plus" badge over the doctor cluster. */
function PlusBadge({ size = 58 }: { size?: number }) {
  const id = useId();
  const grad = `plus-badge-${id}`;
  return (
    <svg width={size} height={size} viewBox="0 0 58 58" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={grad} x1="10%" y1="0%" x2="90%" y2="100%">
          <stop offset="0%" stopColor={C.blue} />
          <stop offset="100%" stopColor={C.purple} />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="54" height="54" rx="16" fill={`url(#${grad})`} opacity="0.92" />
      <rect x="2" y="2" width="54" height="54" rx="16" stroke={C.white} strokeOpacity="0.4" strokeWidth="1.5" />
      <path d="M29 16 V42 M16 29 H42" stroke={C.white} strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}

/** The small heart-with-ECG badge over the "Better Health" cluster —
 *  visually a compact cousin of the big bottom-left HeartEcg. */
function HeartBadge({ size = 58 }: { size?: number }) {
  const id = useId();
  const grad = `heart-badge-${id}`;
  return (
    <svg width={size} height={size} viewBox="0 0 58 58" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={grad} x1="10%" y1="0%" x2="90%" y2="100%">
          <stop offset="0%" stopColor={C.blue} />
          <stop offset="100%" stopColor={C.purple} />
        </linearGradient>
      </defs>
      <circle cx="29" cy="29" r="27" fill={C.white} opacity="0.5" />
      <path
        d="M29 42 C26 39 10 28 10 17 C10 11 15 7 20 7 C24 7 27 9 29 13 C31 9 34 7 38 7 C43 7 48 11 48 17 C48 28 32 39 29 42 Z"
        fill={`url(#${grad})`}
        opacity="0.92"
      />
      <path
        d="M13 24 H22 L25 18 L29 32 L33 22 L36 24 H45"
        stroke={C.white}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** The small four-point sparkle/star badge floating beside the healthy
 *  woman — a little "glow up" marker with no medical meaning of its own. */
function SparkleBadge({ size = 42 }: { size?: number }) {
  const id = useId();
  const grad = `sparkle-badge-${id}`;
  return (
    <svg width={size} height={size} viewBox="0 0 42 42" fill="none" aria-hidden="true">
      <defs>
        <radialGradient id={grad}>
          <stop offset="0%" stopColor={C.white} />
          <stop offset="60%" stopColor={C.tealSoft} />
          <stop offset="100%" stopColor={C.teal} />
        </radialGradient>
      </defs>
      <circle cx="21" cy="21" r="20" fill={`url(#${grad})`} opacity="0.9" />
      <path
        d="M21 10 C21 16 22 19 28 19 C22 19 21 22 21 28 C21 22 20 19 14 19 C20 19 21 16 21 10 Z"
        fill={C.white}
        opacity="0.95"
      />
    </svg>
  );
}

/** The teal blister pack of pills beside the treatment clipboard. */
function BlisterPack({ width = 96 }: { width?: number }) {
  const id = useId();
  const grad = `blister-${id}`;
  const cols = 4;
  const rows = 2;
  const pad = 10;
  const cell = (width - pad * 2) / cols;
  const height = cell * rows + pad * 2;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={grad} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={C.tealSoft} />
          <stop offset="100%" stopColor={C.teal} />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width={width} height={height} rx="14" fill={`url(#${grad})`} opacity="0.85" />
      <rect x="0" y="0" width={width} height={height} rx="14" stroke={C.white} strokeOpacity="0.5" strokeWidth="1.5" />
      {Array.from({ length: rows }).map((_, r) =>
        Array.from({ length: cols }).map((_, c) => (
          <ellipse
            key={`${r}-${c}`}
            cx={pad + cell * c + cell / 2}
            cy={pad + cell * r + cell / 2}
            rx={cell * 0.32}
            ry={cell * 0.38}
            fill={C.white}
            opacity="0.85"
          />
        )),
      )}
    </svg>
  );
}
