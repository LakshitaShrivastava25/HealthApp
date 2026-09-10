import AboutUs from './components/AboutUs'
import AnimatedBackground from './components/AnimatedBackground'
import Benefits from './components/Benefits'
import Features from './components/Features'
import Footer from './components/Footer'
import Hero from './components/Hero'
import HowItWorks from './components/HowItWorks'
import Navbar from './components/Navbar'
import Security from './components/Security'
import Testimonials from './components/Testimonials'

function App() {
  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <AnimatedBackground />

      <Navbar />

      <main>
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
  )
}

export default App
