'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  BarChart3,
  Shield,
  Leaf,
  GraduationCap,
  Award,
  Grape,
  MapPin,
} from 'lucide-react';
import { Container } from '@/components/layout/Container';
import { Button } from '@/components/ui/Button';
import { SolutionCard } from '@/components/solutions/SolutionCard';
import { SolutionModal } from '@/components/solutions/SolutionModal';
import { solutions, type Solution } from '@/components/solutions/solutionsData';

const credentials = [
  {
    icon: GraduationCap,
    title: 'Master of Wine & Viticulture',
    subtitle: 'Lincoln University',
  },
  {
    icon: Award,
    title: 'Certified Sommelier',
    subtitle: 'Court of Master Sommeliers',
  },
  {
    icon: Grape,
    title: 'Pending Publications',
    subtitle: 'Climate impacts on Pinot Noir quality',
  },
  {
    icon: MapPin,
    title: 'Waipara Valley',
    subtitle: 'Active vineyard operations',
  },
];

const features = [
  {
    icon: BarChart3,
    title: 'Climate Intelligence',
    description:
      'High-resolution climate data and projections tailored for viticulture decision-making.',
  },
  {
    icon: Leaf,
    title: 'Sustainable Practices',
    description:
      'Tools and consulting to support regenerative viticulture and sustainability certification.',
  },
  {
    icon: Shield,
    title: 'Risk Management',
    description:
      'Comprehensive risk management for vineyards and agricultural investments.',
  },
];

export default function HomePage() {
  const [selectedSolution, setSelectedSolution] = useState<Solution | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleSolutionClick = (solution: Solution) => {
    setSelectedSolution(solution);
    setIsModalOpen(true);
  };

  const featuredSolutions = solutions.slice(0, 4);

  return (
    <>
      {/* Hero Section */}
      <section className="relative min-h-[90vh] flex items-center bg-sand overflow-hidden">
        <div className="texture-overlay" />
        <div className="absolute top-20 right-0 w-96 h-96 bg-olive/10 rounded-full blur-3xl" />
        <div className="absolute bottom-20 left-0 w-80 h-80 bg-terracotta/10 rounded-full blur-3xl" />

        <Container className="relative z-10 py-32">
          <div className="max-w-4xl">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-olive/10 text-olive text-sm font-semibold mb-6">
                <Leaf className="w-4 h-4" />
                Viti-tech for the Global Wine Industry
              </span>
            </motion.div>

            <motion.h1
              className="text-5xl md:text-6xl lg:text-7xl font-bold text-charcoal mb-6 text-balance"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
            >
              Data-driven insights for{' '}
              <span className="text-olive">resilient</span> viticulture
            </motion.h1>

            <motion.p
              className="text-xl text-charcoal-600 max-w-2xl mb-8 leading-relaxed"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              Auxein combines climate intelligence, precision agriculture, and
              deep wine industry expertise to help winegrowers thrive
              in a changing world.
            </motion.p>

            

            <motion.div
              className="flex flex-wrap gap-4"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
            >
              <Button href="/solutions" size="lg">
                Explore Solutions
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
              <Button href="/contact" variant="secondary" size="lg">
                Get in Touch
              </Button>
                <Button href="https://insights.auxein.co.nz" size="lg">
                Try Regional Insights
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </motion.div>
          </div>
        </Container>
      </section>

      {/* Features Section */}
      <section className="py-24 bg-white">
        <Container>
          <motion.div
            className="text-center max-w-3xl mx-auto mb-16"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl md:text-4xl font-bold text-charcoal mb-4">
              at the crossroads of technology and wine
            </h2>
            <p className="text-charcoal-600 text-lg">
              Built by a viticulturist with a background in climate risk
              modeling, Auxein brings together the tools and knowledge to help
              your vineyard adapt and thrive.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8">
            {features.map((feature, i) => {
              const Icon = feature.icon;
              return (
                <motion.div
                  key={feature.title}
                  className="text-center p-8"
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                >
                  <div className="w-14 h-14 rounded-2xl bg-olive/10 flex items-center justify-center mx-auto mb-5">
                    <Icon className="w-7 h-7 text-olive" />
                  </div>
                  <h3 className="text-xl font-bold text-charcoal mb-3">
                    {feature.title}
                  </h3>
                  <p className="text-charcoal-600 leading-relaxed">
                    {feature.description}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </Container>
      </section>

      {/* Solutions Preview */}
      <section className="py-14 bg-sand">
        <Container>
          <motion.div
            className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-12"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-charcoal mb-3">
                Solutions for every scale
              </h2>
              <p className="text-charcoal-600 text-lg max-w-xl">
                From free regional insights to comprehensive vineyard management
                platforms, we have the right tools for your operation.
              </p>
            </div>
            <Button href="/solutions" variant="secondary">
              View All Solutions
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {featuredSolutions.map((solution, i) => (
              <SolutionCard
                key={solution.id}
                solution={solution}
                onClick={() => handleSolutionClick(solution)}
                index={i}
              />
            ))}
          </div>
        </Container>
      </section>

      {/* Our Name Section */}
      <section className="py-14 bg-sand">
        <Container>
          <motion.div
            className="max-w-3xl mx-auto text-center"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <span className="text-olive font-semibold text-sm uppercase tracking-wider">
              Why Auxein?
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-charcoal mt-2 mb-6">
              A name rooted in growth
            </h2>
            <div className="space-y-4 text-charcoal-600 text-lg leading-relaxed">
              <p>
                Our name comes from the Greek <em>auxein</em> (αὔξειν)—simply meaning 
                &quot;to grow.&quot; It&apos;s the root of <em>auxin</em>, the plant hormone that 
                drives root formation, bud development, and the instinct to reach 
                toward light.
              </p>
              <p>
                We chose it because resilience isn&apos;t about standing still. It&apos;s about 
                adapting, evolving, and growing stronger - whatever conditions you face.
              </p>
              <p className="text-charcoal font-medium">
                <strong>That&apos;s the future we&apos;re building for the wine industry.</strong>
              </p>
            </div>
          </motion.div>
        </Container>
      </section>


      <SolutionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        solution={selectedSolution}
      />
    </>
  );
}