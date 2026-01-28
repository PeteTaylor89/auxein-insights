'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart3,
  CloudSun,
  Shield,
  Smartphone,
  Database,
  Bell,
  Check,
  ArrowRight,
  Loader2,
  CheckCircle,
} from 'lucide-react';
import { Container } from '@/components/layout/Container';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

const features = [
  {
    icon: CloudSun,
    title: 'Climate Intelligence',
    description:
      'Real-time weather monitoring, disease pressure alerts, and frost risk predictions tailored to your blocks.',
  },
  {
    icon: BarChart3,
    title: 'Phenology Tracking',
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
      'Built for use in the field—log observations, record sprays, and check alerts from your phone.',
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
      'Get notified about frost risks, spray windows, and critical phenological stages.',
  },
];

const benefits = [
  'Reduce spray costs with precision timing',
  'Improve fruit quality through data-driven decisions',
  'Streamline compliance and certification',
  'Access historical data for continuous improvement',
  'Support sustainability goals with evidence',
];

export default function InsightsProPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setStatus('loading');

    try {
      const response = await fetch(
        process.env.NEXT_PUBLIC_API_URL || '/api/waitlist',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, source: 'insights-pro' }),
        }
      );

      if (!response.ok) throw new Error('Failed to join waitlist');
      setStatus('success');
      setEmail('');
    } catch {
      setStatus('error');
    }
  };

  return (
    <>
      {/* Hero */}
      <section className="pt-32 pb-24 bg-olive text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <defs>
              <pattern id="hero-pattern" width="10" height="10" patternUnits="userSpaceOnUse">
                <circle cx="5" cy="5" r="1" fill="currentColor" />
              </pattern>
            </defs>
            <rect width="100" height="100" fill="url(#hero-pattern)" />
          </svg>
        </div>

        <div className="absolute top-20 right-20 w-96 h-96 bg-white/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-20 w-80 h-80 bg-terracotta/20 rounded-full blur-3xl" />

        <Container className="relative z-10">
          <div className="max-w-4xl mx-auto text-center">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 text-olive-100 text-sm font-semibold mb-6 backdrop-blur-sm">
                <span className="w-2 h-2 rounded-full bg-terracotta animate-pulse" />
                Coming May 2026
              </span>
            </motion.div>

            <motion.h1
              className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              Auxein Insights Pro
            </motion.h1>

            <motion.p
              className="text-xl text-olive-100 max-w-2xl mx-auto mb-10 leading-relaxed"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              The complete vineyard management platform. Climate intelligence,
              phenology tracking, disease pressure modeling, and blockchain
              traceability—all in one mobile-first solution.
            </motion.p>

            {/* Waitlist Form */}
            <motion.div
              className="max-w-md mx-auto"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              {status === 'success' ? (
                <div className="flex items-center justify-center gap-3 p-4 bg-white/10 backdrop-blur-sm rounded-xl">
                  <CheckCircle className="w-5 h-5 text-olive-200" />
                  <span className="text-olive-100">You're on the list! We'll be in touch.</span>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="flex gap-3">
                  <div className="flex-1">
                    <Input
                      type="email"
                      placeholder="your@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="bg-white/10 border-white/20 text-white placeholder:text-olive-200/60 focus:border-white/40 focus:ring-white/20"
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={status === 'loading'}
                    className="bg-white text-olive hover:bg-sand shrink-0"
                  >
                    {status === 'loading' ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        Join Waitlist
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </>
                    )}
                  </Button>
                </form>
              )}
              {status === 'error' && (
                <p className="text-terracotta-300 text-sm mt-2">
                  Something went wrong. Please try again.
                </p>
              )}
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

      {/* Benefits */}
      <section className="py-24 bg-sand">
        <Container>
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <h2 className="text-3xl md:text-4xl font-bold text-charcoal mb-6">
                Make better decisions, faster
              </h2>
              <p className="text-charcoal-600 text-lg mb-8">
                Insights Pro transforms complex climate and vineyard data into
                actionable insights. Spend less time on paperwork and more time
                doing what you love.
              </p>
              <ul className="space-y-4">
                {benefits.map((benefit, i) => (
                  <motion.li
                    key={i}
                    className="flex items-start gap-3 text-charcoal"
                    initial={{ opacity: 0, x: -10 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.1 }}
                  >
                    <span className="w-5 h-5 rounded-full bg-olive/10 flex items-center justify-center shrink-0 mt-0.5">
                      <Check className="w-3 h-3 text-olive" />
                    </span>
                    {benefit}
                  </motion.li>
                ))}
              </ul>
            </motion.div>

            <motion.div
              className="relative"
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <div className="aspect-[4/3] rounded-xl bg-white flex items-center justify-center border border-olive/25">
                <div className="text-center p-8">
                  <BarChart3 className="w-16 h-16 text-olive/30 mx-auto mb-4" />
                  <p className="text-charcoal-400 text-sm">App screenshots coming soon</p>
                </div>
              </div>
            </motion.div>
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

            {status === 'success' ? (
              <div className="inline-flex items-center gap-3 p-4 bg-olive/10 border border-olive/25 rounded-xl">
                <CheckCircle className="w-5 h-5 text-olive" />
                <span className="text-olive">You're on the list! We'll be in touch.</span>
              </div>
            ) : (
              <form
                onSubmit={handleSubmit}
                className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto"
              >
                <div className="flex-1">
                  <Input
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" disabled={status === 'loading'}>
                  {status === 'loading' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      Join Waitlist
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </>
                  )}
                </Button>
              </form>
            )}
          </motion.div>
        </Container>
      </section>
    </>
  );
}