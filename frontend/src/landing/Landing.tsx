import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AnimatedMedicalBackground, AuthKeyframes } from '@shared/auth';
import './landing.css';

/**
 * The portal selector, previously Landing/index.html served as a separate
 * static file. Converted to a real route so it lives in the same app as the
 * portals it links to — the markup, classes and copy are carried over
 * verbatim so it renders exactly as it did before; only the two <a href> to
 * localhost ports became in-app <Link>s.
 *
 * Its styles stay in a plain scoped stylesheet rather than being rewritten
 * into Tailwind: this page never used Tailwind, and re-expressing it would
 * risk visual drift for no benefit in a restructuring task.
 *
 * The animated background is the same <AnimatedMedicalBackground> the login
 * screens show — imported, not copied. It is mounted exactly the way
 * <AuthShell> mounts it (same 0.7s opacity fade, same keyframe injection),
 * because that wrapper is part of how the effect looks, not incidental.
 */
export default function Landing() {
  return (
    <div className="hn-landing">
      <AuthKeyframes />

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.7 }}>
        <AnimatedMedicalBackground />
      </motion.div>

      <div className="page">
        <div className="brand">
          <div className="brand-badge">
            <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.42 4.58a5.4 5.4 0 0 0-7.65 0l-.77.78-.77-.78a5.4 5.4 0 0 0-7.65 0C1.46 6.7 1.33 10.28 4 13l8 8 8-8c2.67-2.72 2.54-6.3.42-8.42z"/></svg>
          </div>
          <span className="brand-name">HealthNow</span>
        </div>
        <p className="subtitle">Choose how you're signing in.</p>

        <div className="cards">
          <Link className="card patient" to="/patient">
            <div className="icon-wrap">
              <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            </div>
            <p className="card-title">I'm a Patient</p>
            <p className="card-desc">Manage your health records, medicines, insurance, and family profiles.</p>
            <div className="card-cta">
              Continue to User Portal
              <svg viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </div>
          </Link>

          <Link className="card doctor" to="/doctor">
            <div className="icon-wrap">
              <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 2v6a3 3 0 0 0 6 0V4"/><path d="M8 2v6a3 3 0 0 1-6 0V4"/><path d="M2 10a10 10 0 0 0 20 0"/><circle cx="20" cy="10" r="2"/></svg>
            </div>
            <p className="card-title">I'm a Doctor</p>
            <p className="card-desc">Request patient access, review approved records, and add consultation notes.</p>
            <div className="card-cta">
              Continue to Doctor Portal
              <svg viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </div>
          </Link>
        </div>

        <p className="footnote">
          Each app checks who's allowed in after you sign in — picking a card here doesn't grant access by itself.
        </p>
      </div>
    </div>
  );
}
