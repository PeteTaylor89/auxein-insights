'use client';

import { useState } from 'react';
import {
  ArrowRight,
  Leaf,
  Smartphone,
  ExternalLink,
} from 'lucide-react';
import { Container } from '@/components/layout/Container';
import { Button } from '@/components/ui/Button';
import { AppStoreBadges } from '@/components/ui/AppStoreBadges';
import { GROW_LOGIN_URL, INSIGHTS_URL } from '@/lib/links';
import { SolutionCard } from '@/components/solutions/SolutionCard';
import { SolutionModal } from '@/components/solutions/SolutionModal';
import { solutions, type Solution } from '@/components/solutions/solutionsData';

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

        <Container className="relative z-10 pt-24 pb-12 md:pt-28 md:pb-14 lg:pt-32 lg:pb-16">
          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:gap-x-8 lg:gap-y-0 lg:grid-rows-[auto_auto_auto_auto_auto] items-stretch">
            {/* Left: positioning */}
            <div className="bg-white rounded-2xl border border-olive/10 shadow-lg p-6 sm:p-8 lg:p-10 flex flex-col lg:grid lg:row-span-5 lg:grid-rows-subgrid lg:gap-0">
              <div
                className="mb-6 reveal reveal-on-scroll"
              >
                <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-olive/10 text-olive text-sm font-semibold">
                  <Leaf className="w-4 h-4" />
                  Viti-tech for the Global Wine Industry
                </span>
              </div>

              <h1
                className="text-4xl md:text-5xl lg:text-6xl font-bold text-charcoal mb-6 text-balance reveal"
              style={{ animationDelay: "0.1s" }}
            >
                Data-driven insights for{' '}
                <span className="text-olive">resilient</span> viticulture
              </h1>

              <p
                className="text-lg md:text-xl text-charcoal-600 max-w-xl mb-8 leading-relaxed reveal"
              style={{ animationDelay: "0.2s" }}
            >
                Auxein combines climate intelligence, precision agriculture, and
                deep wine industry expertise to help winegrowers thrive
                in a changing world.
              </p>

              <div
                className="flex flex-wrap gap-4 reveal"
              style={{ animationDelay: "0.3s" }}
            >
                <Button href="/solutions" size="lg">
                  Solutions
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
                <Button href="/contact" variant="secondary" size="lg">
                  Get in Touch
                </Button>
                <Button href={INSIGHTS_URL} external variant="secondary" size="lg">
                  Auxein Insights
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </div>

              <div aria-hidden="true" className="hidden lg:block" />
            </div>

            {/* Right: Grow release */}
            <div className="bg-white rounded-2xl border border-olive/10 shadow-lg p-6 sm:p-8 lg:p-10 flex flex-col lg:grid lg:row-span-5 lg:grid-rows-subgrid lg:gap-0">
              <div
                className="mb-6 reveal reveal-on-scroll"
              >
                <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-olive/10 text-olive text-sm font-semibold">
                  <span className="w-2 h-2 rounded-full bg-olive animate-pulse" />
                  Out Now!
                </span>
              </div>

              <h2
                className="text-4xl md:text-5xl lg:text-6xl font-bold text-charcoal mb-6 text-balance lg:self-start reveal"
              style={{ animationDelay: "0.1s" }}
            >
                Auxein Grow
              </h2>

              <p
                className="text-lg md:text-xl text-charcoal-600 mb-8 leading-relaxed reveal"
              style={{ animationDelay: "0.2s" }}
            >
                The complete vineyard management platform - climate intelligence,
                disease pressure models, phenology tracking and compliance
                traceability, on desktop and in the field.
              </p>

              <div
                className="flex flex-wrap gap-4 reveal"
              style={{ animationDelay: "0.3s" }}
            >
                <Button href="/grow" size="lg">
                  Explore features
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
                <Button href={GROW_LOGIN_URL} external variant="secondary" size="lg">
                  Log in
                  <ExternalLink className="w-5 h-5 ml-2" />
                </Button>
              </div>

              <div
                className="mt-auto lg:mt-0 pt-6 border-t border-olive/10 reveal"
              style={{ animationDelay: "0.4s" }}
            >
                <p className="flex items-center gap-2 text-sm font-semibold text-charcoal-500 mb-4">
                  <Smartphone className="w-4 h-4 text-olive" />
                  Get the mobile app
                </p>
                <AppStoreBadges />
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* Solutions Preview */}
      <section className="pt-4 pb-12 md:pt-6 md:pb-16 bg-sand">
        <Container>
          <div
            className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-8 md:mb-10 reveal reveal-on-scroll"
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
          </div>

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

      


      <SolutionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        solution={selectedSolution}
      />
    </>
  );
}