'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart3,
  CloudSun,
  Shield,
  Smartphone,
  Database,
  Bell,
  Check,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Container } from '@/components/layout/Container';
import { Button } from '@/components/ui/Button';

const features = [
  {
    icon: CloudSun,
    title: 'Climate Intelligence',
    description:
      'Real-time weather monitoring, disease pressure alerts, and frost risk predictions tailored to your blocks.',
  },
  {
    icon: BarChart3,
    title: 'Vine Tracking',
    description:
      'Log observations using the EL scale, track vine development, and compare across seasons and blocks.',
  },
  {
    icon: Shield,
    title: 'Disease Pressure Models',
    description:
      'Peer-reviewed models for downy mildew, powdery mildew, and botrytis risk based on your local conditions.',
  },
  {
    icon: Smartphone,
    title: 'Mobile-First Design',
    description:
      'Built for use in the field - log observations, complete tasks, record sprays, and check alerts from your phone.',
  },
  {
    icon: Database,
    title: 'Complete Traceability',
    description:
      'Blockchain-powered record keeping for spray diaries, inputs, and harvest data.',
  },
  {
    icon: Bell,
    title: 'Smart Alerts',
    description:
      'Get notified about frost risks, spray windows, and critical growth stages.',
  },
];

const benefits = [
  'Reduce spray costs with precision timing',
  'Improve fruit quality through data-driven decisions',
  'Streamline compliance and certification',
  'Access historical data for continuous improvement',
  'Support sustainability goals with evidence',
];

// Mobile app screenshots - add more as needed
const mobileScreenshots = [
  {
    src: '/images/Pro/Field-observation.JPG',
    alt: 'Field observation with GPS and photo capture',
    title: 'Field Observations',
  },
  {
    src: '/images/Pro/Spray-task.JPG',
    alt: 'GPS tracked spray task',
    title: 'Spray Tracking',
  },
  {
    src: '/images/Pro/Incident-report.JPG',
    alt: 'Health and safety incident report',
    title: 'H&S Reporting',
  },
];

// Desktop app screenshots
const desktopScreenshots = [
  {
    src: '/images/insights-dashboard.JPG',
    alt: 'Insights dashboard with climate data and alerts',
    title: 'Climate Dashboard',
  },
  {
    src: '/images/home-page.JPG',
    alt: 'Home page overview',
    title: 'Home Overview',
  },
  {
    src: '/images/Observation-plans.JPG',
    alt: 'Observation planning and scheduling',
    title: 'Observation Plans',
  },
  {
    src: '/images/Risk-management.JPG',
    alt: 'Risk management and disease pressure',
    title: 'Risk Management',
  },
  {
    src: '/images/asset-management.JPG',
    alt: 'Asset and equipment management',
    title: 'Asset Management',
  },
  {
    src: '/images/administration.JPG',
    alt: 'Administration and settings',
    title: 'Administration',
  },
];

// Desktop Screenshot Carousel Component
function DesktopScreenshotCarousel() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const nextSlide = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % desktopScreenshots.length);
  }, []);

  const prevSlide = () => {
    setCurrentIndex((prev) => (prev - 1 + desktopScreenshots.length) % desktopScreenshots.length);
  };

  // Auto-rotate every 4 seconds
  useEffect(() => {
    if (isPaused) return;
    const interval = setInterval(nextSlide, 4000);
    return () => clearInterval(interval);
  }, [isPaused, nextSlide]);

  return (
    <div
      className="relative max-w-4xl mx-auto"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Main screenshot display */}
      <div className="relative aspect-[16/10] rounded-xl overflow-hidden shadow-2xl border border-olive/20 bg-white">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentIndex}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0"
          >
            <Image
              src={desktopScreenshots[currentIndex].src}
              alt={desktopScreenshots[currentIndex].alt}
              fill
              className="object-contain"
            />
          </motion.div>
        </AnimatePresence>

        {/* Navigation arrows */}
        <button
          onClick={prevSlide}
          className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 shadow-lg flex items-center justify-center text-charcoal hover:bg-white transition-colors"
          aria-label="Previous screenshot"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <button
          onClick={nextSlide}
          className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 shadow-lg flex items-center justify-center text-charcoal hover:bg-white transition-colors"
          aria-label="Next screenshot"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Title */}
      <motion.p
        key={`title-${currentIndex}`}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-4 text-center text-lg font-medium text-charcoal"
      >
        {desktopScreenshots[currentIndex].title}
      </motion.p>

      {/* Dot indicators */}
      <div className="flex justify-center gap-2 mt-4">
        {desktopScreenshots.map((_, i) => (
          <button
            key={i}
            onClick={() => setCurrentIndex(i)}
            className={`w-2 h-2 rounded-full transition-all duration-300 ${
              i === currentIndex
                ? 'bg-olive w-6'
                : 'bg-olive/30 hover:bg-olive/50'
            }`}
            aria-label={`Go to screenshot ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}

export default function InsightsProPage() {
  return (
    <>
      {/* Hero */}
      <section className="pt-32 pb-24 bg-sand text-charcoal relative overflow-hidden">
        {/* Subtle decorative elements */}
        <div className="absolute top-20 right-20 w-96 h-96 bg-olive/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-20 w-80 h-80 bg-terracotta/5 rounded-full blur-3xl" />

        <Container className="relative z-10">
          <div className="max-w-4xl mx-auto text-center">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-olive/10 text-olive text-sm font-semibold mb-6">
                <span className="w-2 h-2 rounded-full bg-terracotta animate-pulse" />
                Coming May 2026
              </span>
            </motion.div>

            <motion.h1
              className="text-4xl md:text-5xl lg:text-6xl font-bold text-charcoal mb-6"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              Auxein Insights Pro
            </motion.h1>

            <motion.p
              className="text-xl text-charcoal-600 max-w-2xl mx-auto mb-10 leading-relaxed"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              The complete vineyard management platform. Climate intelligence,
              phenology tracking, disease pressure modeling, and blockchain
              traceability - all in one mobile-first solution.
            </motion.p>

            {/* CTA Button */}
            <motion.div
              className="max-w-md mx-auto"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <Button
                href="/contact/?inquiry=insights-pro"
                className="bg-olive text-white hover:bg-olive-600"
              >
                Join the Waitlist
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </motion.div>
          </div>
        </Container>
      </section>

      {/* Features */}
      <section className="py-24 bg-white">
        <Container>
          <motion.div
            className="text-center max-w-3xl mx-auto mb-16"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl md:text-4xl font-bold text-charcoal mb-4">
              Everything you need to manage your vineyard
            </h2>
            <p className="text-charcoal-600 text-lg">
              Built by a viticulturist for viticulturists. Insights Pro brings
              together the tools and data you need in one intuitive platform.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, i) => {
              const Icon = feature.icon;
              return (
                <motion.div
                  key={feature.title}
                  className="p-6 rounded-xl border border-olive/10 hover:border-olive/25 hover:shadow-lg transition-all duration-300"
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                >
                  <div className="w-12 h-12 rounded-xl bg-olive/10 flex items-center justify-center mb-4">
                    <Icon className="w-6 h-6 text-olive" />
                  </div>
                  <h3 className="text-lg font-bold text-charcoal mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-charcoal-600 text-sm leading-relaxed">
                    {feature.description}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </Container>
      </section>

      {/* Mobile Screenshots Section */}
      <section className="py-24 bg-charcoal text-white">
        <Container>
          <motion.div
            className="text-center max-w-3xl mx-auto mb-16"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Built for the field
            </h2>
            <p className="text-charcoal-300 text-lg">
              A mobile-first experience designed for real vineyard work—capture
              observations, track sprays, and manage compliance from anywhere.
            </p>
          </motion.div>

          <div className="flex flex-wrap justify-center gap-8 lg:gap-12">
            {mobileScreenshots.map((screenshot, i) => (
              <motion.div
                key={screenshot.title}
                className="flex flex-col items-center"
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15 }}
              >
                <div className="relative w-[200px] sm:w-[220px] aspect-[9/19] rounded-[2.5rem] overflow-hidden shadow-2xl border-4 border-charcoal-700 bg-charcoal-800">
                  <Image
                    src={screenshot.src}
                    alt={screenshot.alt}
                    fill
                    className="object-cover"
                  />
                </div>
                <p className="mt-4 text-sm font-medium text-charcoal-300">
                  {screenshot.title}
                </p>
              </motion.div>
            ))}
          </div>
        </Container>
      </section>

      {/* Desktop Screenshots Carousel */}
      <section className="py-24 bg-sand">
        <Container>
          <motion.div
            className="text-center max-w-3xl mx-auto mb-12"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl md:text-4xl font-bold text-charcoal mb-4">
              Powerful desktop experience
            </h2>
            <p className="text-charcoal-600 text-lg">
              Full-featured web application for deeper analysis, planning, and
              administration when you&apos;re back at the office.
            </p>
          </motion.div>

          <DesktopScreenshotCarousel />
        </Container>
      </section>

      {/* Benefits */}
      <section className="py-24 bg-white">
        <Container>
          <div className="max-w-3xl mx-auto">
            <motion.div
              className="text-center mb-12"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <h2 className="text-3xl md:text-4xl font-bold text-charcoal mb-4">
                Make better decisions, faster
              </h2>
              <p className="text-charcoal-600 text-lg">
                Insights Pro transforms complex climate and vineyard data into
                actionable insights. Spend less time on paperwork and more time
                doing what you love.
              </p>
            </motion.div>

            <div className="grid sm:grid-cols-2 gap-4">
              {benefits.map((benefit, i) => (
                <motion.div
                  key={i}
                  className="flex items-start gap-3 p-4 rounded-lg bg-sand"
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                >
                  <span className="w-5 h-5 rounded-full bg-olive/20 flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-3 h-3 text-olive" />
                  </span>
                  <span className="text-charcoal">{benefit}</span>
                </motion.div>
              ))}
            </div>
          </div>
        </Container>
      </section>

      {/* Bottom CTA */}
      <section className="py-24 bg-white">
        <Container>
          <motion.div
            className="max-w-2xl mx-auto text-center"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl md:text-4xl font-bold text-charcoal mb-4">
              Be the first to know
            </h2>
            <p className="text-charcoal-600 text-lg mb-8">
              Join the waitlist for early access, beta testing opportunities,
              and exclusive launch pricing.
            </p>

                        <Button
              href="/contact/?inquiry=insights-pro"
              className="bg-olive text-white hover:bg-olive-600"
            >
              Join the Waitlist
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </motion.div>
        </Container>
      </section>
    </>
  );
}