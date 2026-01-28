import { Metadata } from 'next';
import {
  GraduationCap,
  Award,
  Grape,
  TrendingUp,
  BookOpen,
  Target,
} from 'lucide-react';
import { Container } from '@/components/layout/Container';
import { Button } from '@/components/ui/Button';

export const metadata: Metadata = {
  title: 'About',
  description:
    'Learn about Auxein, our mission to support sustainable viticulture in New Zealand, and the expertise behind our climate intelligence solutions.',
};

const timeline = [
  {
    year: '2024',
    title: 'Research Foundation',
    description:
      'Completed Masters of Wine and Viticulture at Lincoln University, conducted research on high-resolution climate modeling and its impacts on Pinot Noir quality in New Zealand.',
  },
  {
    year: '2024',
    title: 'Auxein Founded',
    description:
      'Established Auxein Limited - To lead the global wine industry toward a sustainable and resilient future, creating a legacy for generations.',
  },
  {
    year: '2026',
    title: 'Auxein Insights Launch',
    description:
      'Released free regional intelligence climate and spatial platform for New Zealand wine regions.',
  },
  {
    year: '2025 - 2026',
    title: 'Auxein Insights Pro Development',
    description:
      'Development of comprehensive vineyard management platform with blockchain traceability.',
  },
  {
    year: '2026',
    title: 'Auxein Insights Pro Launch',
    description:
      'Planned release of Auxein Insights Pro - your complete vineyard management solution.',
  },
];

const values = [
  {
    icon: BookOpen,
    title: 'Solutions',
    description:
      'We craft science-driven tools and strategies that tackle climate challenges, empowering wine businesses to mitigate risks and drive sustainable growth.',
  },
  {
    icon: Target,
    title: 'Insights',
    description:
      'Our actionable data and deep expertise help the wine industry predict challenges and build resilience at every stage of operations.',
  },

  {
    icon: Grape,
    title: 'Collaboration',
    description:
      'Build partnerships across the wine value chain to drive collective action toward sustainability and resilience.',
  },
];

export default function AboutPage() {
  return (
    <>
      {/* Hero Section */}
      <section className="pt-32 pb-24 bg-sand relative overflow-hidden">
        <div className="texture-overlay" />
        <div className="absolute top-40 right-10 w-72 h-72 bg-olive/10 rounded-full blur-3xl" />

        <Container className="relative z-10">
          <div className="max-w-3xl">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-charcoal mb-6">
              Climate science meets wine expertise
            </h1>
            <p className="text-xl text-charcoal-600 leading-relaxed">
              Auxein was founded to lead the global wine industry toward a sustainable and
              resilient future, creating a legacy for generations.
            </p>
            <br/>
            <span className="text-olive font-semibold text-sm uppercase tracking-wider">
              Mission Statement
            </span>
            <p className="text-xl text-charcoal-600 leading-relaxed">
              We empower the global wine industry with cutting-edge
              tools, actionable insights, and transformative knowledge.
              We challenge boundaries and inspire sustainable
              practices, creating a resilient and thriving wine industry
              for generations.
            </p>
          </div>
        </Container>
      </section>

      {/* Founder Section */}
      <section className="py-24 bg-white">
        <Container>
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <span className="text-olive font-semibold text-sm uppercase tracking-wider">
                The Founder
              </span>
              <h2 className="text-3xl md:text-4xl font-bold text-charcoal mt-2 mb-6">
                Pete Taylor
              </h2>
              <div className="space-y-4 text-charcoal-600 leading-relaxed">
                <p>
                  Pete brings a unique combination of academic rigour and
                  hands-on experience to Auxein. With a Master of Wine &
                  Viticulture from Lincoln University, a Master of Water Resource Management from Canterbury University, 
                  and certification from the Court of Master Sommeliers, he understands wine from vine to glass.
                </p>
                <p>
                  His research on climate impacts on Pinot Noir wine quality
                  used high-resolution vineyard-specific climate modeling - the
                  same methodology that underpins Auxein&apos;s Insights
                  platform.
                </p>
                <p>
                  Before founding Auxein, Pete worked in climate risk modeling
                  for the finance sector, giving him deep expertise in
                  translating complex data into decision-useful insights. Today,
                  he runs Auxein, developing tools to help the broader industry 
                  and dabbles in vineyard operations in Canterbury&apos;s Waipara region.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-6">
                <div className="stat-card">
                  <GraduationCap className="w-8 h-8 text-olive mb-4" />
                  <h3 className="font-bold text-charcoal mb-1">
                    Master of Wine & Viticulture
                  </h3>
                  <p className="text-sm text-charcoal-500">Lincoln University</p>
                </div>
                <div className="stat-card">
                  <Award className="w-8 h-8 text-olive mb-4" />
                  <h3 className="font-bold text-charcoal mb-1">
                    CMS Certified Sommelier
                  </h3>
                  <p className="text-sm text-charcoal-500">
                    Court of Master Sommeliers
                  </p>
                </div>
              </div>
              <div className="space-y-6 mt-12">
                <div className="stat-card">
                  <Grape className="w-8 h-8 text-olive mb-4" />
                  <h3 className="font-bold text-charcoal mb-1">
                    Pending Published Research
                  </h3>
                  <p className="text-sm text-charcoal-500">
                    Climate impacts on wine quality
                  </p>
                </div>
                <div className="stat-card">
                  <TrendingUp className="w-8 h-8 text-olive mb-4" />
                  <h3 className="font-bold text-charcoal mb-1">
                    Climate Risk Background
                  </h3>
                  <p className="text-sm text-charcoal-500">
                    Financial sector modeling
                  </p>
                </div>
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* Values Section */}
      <section className="py-24 bg-sand">
        <Container>
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-charcoal mb-4">
              Our approach
            </h2>

          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {values.map((value) => {
              const Icon = value.icon;
              return (
                <div
                  key={value.title}
                  className="bg-white p-8 rounded-xl border border-olive/10 text-center"
                >
                  <div className="w-14 h-14 rounded-2xl bg-olive/10 flex items-center justify-center mx-auto mb-5">
                    <Icon className="w-7 h-7 text-olive" />
                  </div>
                  <h3 className="text-xl font-bold text-charcoal mb-3">
                    {value.title}
                  </h3>
                  <p className="text-charcoal-600 leading-relaxed">
                    {value.description}
                  </p>
                </div>
              );
            })}
          </div>
        </Container>
      </section>

      {/* Timeline Section */}
      <section className="py-24 bg-white">
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

      {/* CTA Section */}
      <section className="py-24 bg-sand">
        <Container>
          <div className="text-center max-w-2xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold text-charcoal mb-4">
              Let&apos;s work together
            </h2>
            <p className="text-charcoal-600 text-lg mb-8">
              Whether you&apos;re a vineyard owner, wine industry body, or
              agricultural technology company—I&apos;d love to discuss how Auxein
              can support your goals.
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