import { useEffect } from 'react';
import { MotionConfig } from 'framer-motion';
import AboutUs from './components/AboutUs';
import AnimatedBackground from './components/AnimatedBackground';
import Benefits from './components/Benefits';
import Features from './components/Features';
import Footer from './components/Footer';
import GetAppButton from './components/GetAppButton';
import Hero from './components/Hero';
import HowItWorks from './components/HowItWorks';
import Navbar from './components/Navbar';
import Security from './components/Security';
import Testimonials from './components/Testimonials';
import './landing.css';

/**
 * The public landing page — "/" for anyone not signed in.
 *
 * It used to be a separate site (outer-landing-page, at www.curapath.in)
 * that linked across to web.curapath.in. Living in this app instead puts
 * the whole journey on one address:
 *
 *   curapath.in  →  curapath.in/login  →  sign in  →  the app
 *
 * Its styles keep their own palette (the `lp-` colours in
 * tailwind.config.js) so the marketing blue never bleeds into the app.
 */
export default function Landing() {
  // Anchor links (#features, #security, …) glide on this page only; the
  // app's own pages keep instant scrolling.
  useEffect(() => {
    const html = document.documentElement;
    const previous = html.style.scrollBehavior;
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) html.style.scrollBehavior = 'smooth';
    const title = document.title;
    document.title = 'CuraPath — Simplify Family Healthcare';
    return () => {
      html.style.scrollBehavior = previous;
      document.title = title;
    };
  }, []);

  return (
    // reducedMotion="user": for visitors whose OS asks for reduced motion,
    // framer-motion skips transform animations and only fades.
    <MotionConfig reducedMotion="user">
      <div className="cp-landing">
        <a
          href="#main"
          className="fixed top-[calc(0.75rem_+_env(safe-area-inset-top))] left-4 z-[60] -translate-y-[calc(100%_+_2rem)] rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-lp-ink shadow-lg transition-transform focus:translate-y-0 motion-reduce:transition-none"
        >
          Skip to content
        </a>

        {/* overflow-x-clip, not -hidden: it clips stray horizontal overflow
            without making this wrapper a scroll container, which would stop
            the navbar's position: sticky from working. */}
        <div className="relative min-h-screen overflow-x-clip">
          <AnimatedBackground />

          <Navbar />

          <main id="main" className="scroll-mt-20">
            <Hero />
            <Features />
            <HowItWorks />
            <Benefits />
            <Security />
            <Testimonials />
            <AboutUs />
          </main>

          <Footer />
        </div>

        <GetAppButton />
      </div>
    </MotionConfig>
  );
}
