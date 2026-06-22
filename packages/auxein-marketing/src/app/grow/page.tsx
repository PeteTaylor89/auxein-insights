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
  Map,
  Check,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Container } from '@/components/layout/Container';
import { GrowFeaturesLink } from '@/components/solutions/Growfeaturesmodal';
import { Button } from '@/components/ui/Button';

const features = [
  {
    icon: CloudSun,
    title: 'Climate Intelligence',
    description:
      'Property-level climate history from 1986 and CMIP6 projections to 2100, combined with live weather station data for real-time disease pressure and frost risk.',
  },
  {
    icon: Shield,
    title: 'Disease Pressure Models',
    description:
      'Peer-reviewed downy mildew, powdery mildew, and botrytis models driven by your local conditions - with rule-based spray suggestions when thresholds are breached.',
  },
  {
    icon: BarChart3,
    title: 'Phenology & Yield Tracking',
    description:
      'Record EL-scale phenology observations per block, compare modelled vs. observed development, and generate rolling crop load and harvest timing estimates.',
  },
  {
    icon: Database,
    title: 'Blockchain Traceability',
    description:
      'Every spray, observation, and harvest record is written to a tamper-evident block-level chain - giving you verified provenance for audits, certificates and export.',
  },
  {
    icon: Map,
    title: 'Operational Mapping',
    description:
      'Interactive block maps with toggleable layers for disease pressure, spray efficiency heatmaps, live weather station readings, phenology stage, and frost risk.',
  },
  {
    icon: Smartphone,
    title: 'Mobile-First Field Tools',
    description:
      'Log GPS-tagged observations, complete spray tasks with run tracking, report incidents, and check disease alerts - all from your phone, built for vineyard conditions.',
  },
];

const benefits = [
  'Cut spray costs with model-driven timing: treat when conditions demand it, not on a calendar',
  'Build a blockchain verified audit trail that satisfies auditor and export market scrutiny',
  'Turn 40 years of property-level climate history into smarter variety, rootstock, and canopy decisions',
  'Catch disease pressure before it becomes crop loss - peer-reviewed models, your local data',
  'Replace paperwork with a compliance engine that writes your spray diary as a by-product of doing your job',
  'Know your harvest window weeks out - phenology tracking and yield estimates that sharpen as the season progresses',
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
            <motion.div
              className="flex flex-wrap items-center justify-center gap-3 mb-6"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Button
                href="/contact/?inquiry=auxein-grow"
                size="sm"
                className="rounded-full bg-olive text-white hover:bg-olive-600"
              >
                <span className="w-2 h-2 rounded-full bg-white animate-pulse mr-2" />
                Grow is Live — Enquire
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
              <Button
                href="https://insights.auxein.co.nz"
                external
                size="sm"
                variant="secondary"
                className="rounded-full"
              >
                <BarChart3 className="w-4 h-4 mr-2" />
                Free Regional Insights
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </motion.div>

            <motion.h1
              className="text-4xl md:text-5xl lg:text-6xl font-bold text-charcoal mb-6"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              Auxein Grow
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
                href="/contact/?inquiry=auxein-grow"
                className="bg-olive text-white hover:bg-olive-600"
              >
                Enquire
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
          </motion.div>
          <div className="text-center mt-12">
            <GrowFeaturesLink className="btn-secondary gap-2 px-10 py-4 text-base" />
          </div>
          <br />
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
{/*
      
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
*/}
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
                Auxein Grow transforms complex climate and vineyard data into
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
      <section className="py-14 bg-white">
        <Container>
          <motion.div
            className="max-w-2xl mx-auto text-center"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <Button
              href="/contact/?inquiry=auxein-grow"
              className="bg-olive text-white hover:bg-olive-600"
            >
              Enquire
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </motion.div>
        </Container>
      </section>
    </>
  );
}