import { MotionConfig } from 'framer-motion'
import AboutUs from './components/AboutUs'
import AnimatedBackground from './components/AnimatedBackground'
import Benefits from './components/Benefits'
import Features from './components/Features'
import Footer from './components/Footer'
import GetAppButton from './components/GetAppButton'
import Hero from './components/Hero'
import HowItWorks from './components/HowItWorks'
import Navbar from './components/Navbar'
import Security from './components/Security'
import Testimonials from './components/Testimonials'

function App() {
  return (
    // reducedMotion="user": for visitors whose OS asks for reduced motion, framer-motion skips
    // transform animations (drifting background, slide-ins) and only fades.
    <MotionConfig reducedMotion="user">
      <a
        href="#main"
        className="fixed top-[calc(0.75rem_+_env(safe-area-inset-top))] left-4 z-60 -translate-y-[calc(100%_+_2rem)] rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-ink shadow-lg transition-transform focus:translate-y-0 motion-reduce:transition-none"
      >
        Skip to content
      </a>

      {/* overflow-x-clip, not -hidden: it clips stray horizontal overflow without making this
          wrapper a scroll container, which would stop the navbar's position: sticky from working. */}
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
    </MotionConfig>
  )
}

export default App
