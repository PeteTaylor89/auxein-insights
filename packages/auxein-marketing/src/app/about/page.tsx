import { Metadata } from 'next';
import {
  GraduationCap,
  Award,
  Grape,
  TrendingUp,
} from 'lucide-react';
import { Container } from '@/components/layout/Container';
import { Button } from '@/components/ui/Button';
import { FadeIn } from '@/components/ui/FadeIn';

export const metadata: Metadata = {
  title: 'About',
  description:
    'Pete Taylor — CMS-Certified Sommelier, Master of Wine & Viticulture. Building climate intelligence tools for the wine industry.',
  alternates: {
    canonical: 'https://auxein.co.nz/about',
  },
};

const timeline = [
  {
    year: '2009–2023',
    title: 'Industry Foundation',
    description:
      'Fourteen years across the wine industry - vineyard management, harvest work across New Zealand, sommelier roles, and sales and marketing. The hands-on foundation that shapes how Auxein thinks about what viticulturists actually need.',
  },
  {
    year: '2023–2024',
    title: 'The Research',
    description:
      'Masters of Wine & Viticulture at Lincoln University - research focused on high-resolution climate modelling and its measurable impact on Pinot Noir quality at single-vineyard resolution across New Zealand.',
  },
  {
    year: '2024',
    title: 'Auxein Founded',
    description:
      'Established Auxein Limited in Christchurch, New Zealand. Mission: To lead the global wine industry toward a sustainable and resilient future, creating a legacy for generations.',
  },
  {
    year: '2024–2026',
    title: 'Platform Development',
    description:
      'Built a proprietary virtual climate network covering 8,750+ vineyard polygons with over 1 billion data points from 1986 to present - the foundation for block-level climate intelligence across all 21 New Zealand wine regions.',
  },
  {
    year: 'January 2026',
    title: 'Auxein Insights Launched',
    description:
      'Released free regional climate intelligence to New Zealand winegrowers - live current-season tracking, historical analysis, disease pressure, and projections to 2100, publicly available at insights.auxein.co.nz.',
  },
  {
    year: 'September 2026',
    title: 'Auxein Grow Launched',
    description:
      'Full commercial release of Auxein Grow - a complete vineyard management platform combining climate intelligence, peer-reviewed disease models, compliance traceability, and mobile-first field tools.',
  },
];

const credentials = [
  {
    icon: GraduationCap,
    title: 'Master of Wine & Viticulture',
    sub: 'Lincoln University',
  },
  {
    icon: Award,
    title: 'CMS Certified Sommelier',
    sub: 'Court of Master Sommeliers',
  },
  {
    icon: TrendingUp,
    title: 'Climate Risk Modelling',
    sub: 'Finance sector background',
  },
  {
    icon: Grape,
    title: 'Waipara Winegrowing connections',
    sub: 'North Canterbury',
  },
];

export default function AboutPage() {
  return (
    <>
      {/* Hero */}
      <section className="pt-24 pb-16 md:pt-32 md:pb-24 bg-sand relative overflow-hidden">
        <div className="texture-overlay" />
        <div className="absolute top-40 right-10 w-72 h-72 bg-olive/10 rounded-full blur-3xl" />

        <Container className="relative z-10">
          <div className="max-w-3xl">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-charcoal mb-6">
              The Resilient Vineyard
            </h1>
            <p className="text-lg md:text-xl text-charcoal-600 leading-relaxed mb-6">
              The wine industry is facing its most significant challenge in centuries.
              Shifting climates, tightening export requirements, increasing
              operational complexity, and changing consumer behaviours demand better tools - tools built on science,
              not spreadsheets.
            </p>
            <p className="text-lg md:text-xl text-charcoal-600 leading-relaxed">
              Auxein was founded to provide exactly that: climate intelligence and
              vineyard management tools that turn complexity into competitive advantage,
              and data into decisions that last generations.
            </p>
          </div>
        </Container>
      </section>

      {/* Founder */}
      <section className="py-16 md:py-24 bg-white">
        <Container>
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-start">
            <div>
              <span className="text-olive font-semibold text-sm uppercase tracking-wider">
                The Founder
              </span>
              <h2 className="text-3xl md:text-4xl font-bold text-charcoal mt-2 mb-6">
                Pete Taylor
              </h2>
              <div className="space-y-4 text-charcoal-600 leading-relaxed">
                <p>
                  Pete brings a rare combination of academic rigour and practical
                  experience to Auxein. His Masters research at Lincoln University
                  used thin-plate spline interpolation and multiple regression to
                  model ecoclimatic indices and Pinot Noir wine quality at
                  single-vineyard resolution - the same methodology that underpins
                  Auxein&apos;s climate network.
                </p>
                <p>
                  While founding Auxein, Pete worked in climate risk modelling for
                  the banking sector, translating complex environmental data into
                  decision-useful outputs. That background
                  shapes how Auxein builds: rigorous inputs, clear outputs, and
                  always grounded in what actually changes decisions.
                </p>
                <p>
                  Today he runs Auxein from Christchurch and helps vineyard operations
                  in Waipara - meaning Auxein is built by someone who is still in the
                  field, still accountable to the same conditions its users face.
                </p>
              </div>
            </div>

            {/* Credential cards — uniform 2×2 grid, no offset */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {credentials.map((cred) => {
                const Icon = cred.icon;
                return (
                  <div key={cred.title} className="stat-card flex flex-col">
                    <Icon className="w-8 h-8 text-olive mb-4 shrink-0" />
                    <h3 className="font-bold text-charcoal text-sm leading-snug mb-1">
                      {cred.title}
                    </h3>
                    <p className="text-sm text-charcoal-500">{cred.sub}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </Container>
      </section>

      {/* Our Name Section */}
      <section className="py-10 md:py-14 bg-sand">
        <Container>
          <FadeIn className="max-w-3xl mx-auto text-center">
            <span className="text-olive font-semibold text-sm uppercase tracking-wider">
              Why Auxein?
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-charcoal mt-2 mb-6">
              A name rooted in growth
            </h2>
            <div className="space-y-4 text-charcoal-600 text-lg leading-relaxed">
              <p>
                Our name comes from the Greek <em>auxein</em> (αὔξειν) - simply meaning 
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
          </FadeIn>
        </Container>
      </section>

      {/* Timeline */}
      <section className="py-16 md:py-24 bg-white">
        <Container>
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold text-charcoal mb-12 text-center">
              Our journey
            </h2>

            <div className="relative">
              <div className="absolute left-0 md:left-1/2 top-0 bottom-0 w-px bg-olive/20 -translate-x-1/2 hidden md:block" />

              <div className="space-y-12">
                {timeline.map((item, i) => (
                  <div
                    key={item.year}
                    className={`relative flex flex-col md:flex-row gap-8 ${
                      i % 2 === 0 ? 'md:flex-row-reverse' : ''
                    }`}
                  >
                    <div className="absolute left-0 md:left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-olive border-4 border-white shadow hidden md:block" />

                    <div className="md:w-1/2 md:px-8">
                      <div className={i % 2 === 0 ? 'md:text-left' : 'md:text-right'}>
                        <span className="text-terracotta font-bold">
                          {item.year}
                        </span>
                        <h3 className="text-xl font-bold text-charcoal mt-1 mb-2">
                          {item.title}
                        </h3>
                        <p className="text-charcoal-600">{item.description}</p>
                      </div>
                    </div>

                    <div className="hidden md:block md:w-1/2" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* CTA */}
      <section className="py-16 md:py-24 bg-sand">
        <Container>
          <div className="text-center max-w-2xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold text-charcoal mb-4">
              Let&apos;s work together
            </h2>
            <p className="text-charcoal-600 text-lg mb-8">
              Whether you&apos;re a vineyard owner, wine industry body, or
              research institution - get in touch to discuss how Auxein can
              support your goals.
            </p>
            <Button href="/contact" size="lg">
              Get in Touch
            </Button>
          </div>
        </Container>
      </section>
    </>
  );
}