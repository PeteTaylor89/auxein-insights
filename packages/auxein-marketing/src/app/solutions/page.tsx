'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Container } from '@/components/layout/Container';
import { SolutionCard } from '@/components/solutions/SolutionCard';
import { SolutionModal } from '@/components/solutions/SolutionModal';
import { solutions, type Solution } from '@/components/solutions/solutionsData';

export default function SolutionsPage() {
  const [selectedSolution, setSelectedSolution] = useState<Solution | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleSolutionClick = (solution: Solution) => {
    setSelectedSolution(solution);
    setIsModalOpen(true);
  };

  const platforms = solutions.filter((s) =>
    ['insights-pro', 'regional-insights'].includes(s.id)
  );
  const datasets = solutions.filter((s) =>
    ['vineyard-dataset', 'climate-dataset', 'coastal-risk'].includes(s.id)
  );
  const consulting = solutions.filter((s) =>
    ['swnz-consulting', 'carbon-accounting', 'climate-risk'].includes(s.id)
  );

  return (
    <>
      {/* Hero */}
      <section className="pt-32 pb-16 bg-sand relative overflow-hidden">
        <div className="texture-overlay" />
        <div className="absolute top-40 right-10 w-72 h-72 bg-olive/10 rounded-full blur-3xl" />

        <Container className="relative z-10">
          <div className="max-w-3xl">
            <motion.h1
              className="text-4xl md:text-5xl lg:text-6xl font-bold text-charcoal mb-6"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              Solutions
            </motion.h1>
            <motion.p
              className="text-xl text-charcoal-600 leading-relaxed"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              From free regional intelligence to comprehensive vineyard
              management platforms, Auxein has the tools and expertise to support
              every aspect of your viticulture operation.
            </motion.p>
          </div>
        </Container>
      </section>

      {/* Platforms */}
      <section className="py-24 bg-white" id="platforms">
        <Container>
          <motion.div
            className="mb-12"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-2xl md:text-3xl font-bold text-charcoal mb-3">
              Platforms
            </h2>
            <p className="text-charcoal-600 max-w-2xl">
              Digital tools for climate intelligence and vineyard management.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-6">
            {platforms.map((solution, i) => (
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

      {/* Datasets */}
      <section className="py-24 bg-sand" id="datasets">
        <Container>
          <motion.div
            className="mb-12"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-2xl md:text-3xl font-bold text-charcoal mb-3">
              Data Products
            </h2>
            <p className="text-charcoal-600 max-w-2xl">
              Licensable datasets for research, industry bodies, and agtech companies.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6">
            {datasets.map((solution, i) => (
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

      {/* Consulting */}
      <section className="py-24 bg-white" id="consulting">
        <Container>
          <motion.div
            className="mb-12"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-2xl md:text-3xl font-bold text-charcoal mb-3">
              Consulting Services
            </h2>
            <p className="text-charcoal-600 max-w-2xl">
              Expert guidance on sustainability, carbon accounting, and climate risk.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6">
            {consulting.map((solution, i) => (
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