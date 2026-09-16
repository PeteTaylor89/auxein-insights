'use client';

import { useState } from 'react';
import Image from 'next/image';
import {
  ArrowRight,
  BarChart3,
  CalendarClock,
  Check,
  ClipboardCheck,
  ExternalLink,
  HardHat,
  Layers,
  Maximize2,
  Minus,
  Plus,
  ShieldCheck,
  Smartphone,
  Users,
  WifiOff,
} from 'lucide-react';
import { Container } from '@/components/layout/Container';
import { Button } from '@/components/ui/Button';
import { AppStoreBadges } from '@/components/ui/AppStoreBadges';
import { PhoneShowcase, type PhoneShot } from '@/components/ui/PhoneShowcase';
import { LightboxShell, useLightbox } from '@/components/ui/Lightbox';
import { GROW_LOGIN_URL, INSIGHTS_URL } from '@/lib/links';
import { GROW_PRICE } from '@/lib/pricing';
import { useRegion } from '@/lib/useRegion';
import { REGION_COPY } from '@/lib/regionCopy';

const ENQUIRE = '/contact/?inquiry=auxein-grow';

const loop = [
  {
    icon: CalendarClock,
    step: 'Plan',
    title: 'Schedule the work',
    body: 'Build a task from a template, drop it on blocks or land-management areas, attach the equipment and the consumables, and assign the crew. Roll-ups group the same job across a whole property.',
  },
  {
    icon: Smartphone,
    step: 'Do',
    title: 'Work in the field',
    body: 'The crew works the task on their phone, row by row, raising issues as they find them. Observations are captured spot by spot with GPS, photos and the row they came from.',
  },
  {
    icon: ShieldCheck,
    step: 'Prove',
    title: 'Keep the record',
    body: 'Every spray, observation, incident, visitor and hour is timestamped against its block and property as a by-product of doing the job. Nothing is written twice.',
  },
  {
    icon: BarChart3,
    step: 'Learn',
    title: 'See what it cost',
    body: 'Hours per hectare, cost per hectare, disease pressure against your own conditions, and forty years of climate behind every property you farm.',
  },
];

const tour = [
  {
    id: 'tasks',
    eyebrow: 'Tasks',
    title: 'A job of work, down to the row',
    body: 'Tasks carry a category, a schedule, a location, assignees, equipment and consumables. Blocks with rows can be worked row by row - each row keeps its own status, notes, issues found and quality rating. Completing a task is what writes the hours, the consumable usage and the machine hours into the record.',
    points: [
      'Quick create, a full wizard, or straight from the phone',
      'Roll-ups group one job across many blocks',
      'Raise an issue into a follow-up task without leaving the row',
    ],
    image: '/images/home-page.JPG',
    width: 1250,
    height: 827,
    alt: 'Task list with category, location, schedule, assignee and status per task',
  },
  {
    id: 'observations',
    eyebrow: 'Observations',
    title: 'Structured field records, not notes in a phone',
    body: 'A template defines what gets recorded; a run is one visit to one block; a spot is one reading inside it, with GPS, a timestamp, photos and optionally the row. Phenology, bud and shoot counts, disease scouting and lab sampling all run on the same machinery.',
    points: [
      'Build your own templates, or start from the system set',
      'Save and next carries the context between spots',
      'Counts roll up to a weighted block figure automatically',
    ],
    image: '/images/Observation-plans.JPG',
    width: 1235,
    height: 614,
    alt: 'Observation planning and scheduling screen',
  },
  {
    id: 'safety',
    eyebrow: 'Health & safety',
    title: 'Three registers that actually connect',
    body: 'Risks are rated before and after controls. Actions are the controls that reduce them. Incidents record what happened, carry their WorkSafe notifiability, and hold the investigation. Everyone on site can report; manager and above investigate and close.',
    points: [
      'Inherent and residual risk matrices',
      'WorkSafe notifiability flagged at the point of reporting',
      'Staff sign-on, visitors and contractors in one on-site list',
    ],
    image: '/images/Risk-management.JPG',
    width: 1215,
    height: 810,
    alt: 'Risk register and health and safety dashboard',
  },
  {
    id: 'assets',
    eyebrow: 'Assets & consumables',
    title: 'What you own, and what you are using up',
    body: 'Equipment carries hours, calibration specs, maintenance intervals and compliance dates. Consumables carry stock levels, application rates, withholding periods, ACVM registration and certification ticks - so the spray you reach for is the one your certification allows.',
    points: [
      'Sprayer calibration recorded as a pass or a fail, with the numbers',
      'Stock drops as tasks are completed, and warns below minimum',
      'Withholding periods travel with the product',
    ],
    image: '/images/asset-management.JPG',
    width: 1218,
    height: 817,
    alt: 'Asset and equipment register',
  },
  {
    id: 'insights',
    eyebrow: 'Insights & reports',
    title: 'The season, measured',
    body: 'Twelve reports covering work done, block census, compliance and cost, with a property selector that moves between the whole company and a single site. Costs and pay rates are visible to admins only - a manager can approve hours without ever seeing a rate.',
    points: [
      'Hours per hectare and cost per hectare by block',
      'Vineyard census with the certification breakdown',
      'Export to PDF or spreadsheet for the auditor',
    ],
    image: '/images/insights-dashboard.JPG',
    width: 981,
    height: 713,
    alt: 'Insights dashboard with climate data and reporting panels',
  },
  {
    id: 'setup',
    eyebrow: 'Setup',
    title: 'Get your whole operation in without retyping it',
    body: 'Blocks, rows, equipment and consumables all share one import and export dialog. Export the register, edit it in a spreadsheet, upload it back - and see a diff of exactly what will change before anything is applied.',
    points: [
      'Draw blocks on the satellite map, or import from our database',
      'Bulk-create rows, then paint variety and spacing across a range',
      'Scope each person to the properties they should see',
    ],
    image: '/images/administration.JPG',
    width: 1554,
    height: 1012,
    alt: 'Company administration and setup screens',
  },
];

const roles = [
  {
    name: 'Admin',
    where: 'Web + mobile',
    body: 'Owns the setup: people, properties, blocks, contractors, pay rates. The only tier that sees costs.',
  },
  {
    name: 'Manager',
    where: 'Web + mobile',
    body: 'Runs the work. Creates and assigns tasks, approves timesheets, closes incidents, reads every report.',
  },
  {
    name: 'Crew',
    where: 'Mobile only',
    body: 'Does the assigned work, captures observations, logs time. Sees what they are assigned, and nothing else.',
  },
  {
    name: 'Contractor',
    where: 'Mobile only',
    body: 'An outside business with its own account. Sees only the companies it holds a live relationship with.',
  },
  {
    name: 'Health & safety',
    where: 'Mobile only',
    body: 'Signs on and off, reports a hazard or an incident, signs a visitor in. Nothing commercial, by design.',
  },
];

const mobileShots: PhoneShot[] = [
  {
    src: '/images/Pro/mobile-home.jpg',
    alt: 'Auxein Grow mobile home screen showing the block map, conditions and what is due',
    title: 'The day, before you start it',
  },
  {
    src: '/images/Pro/mobile-observation.jpg',
    alt: 'Field observation capture with GPS, row and shoot count',
    title: 'Observations, spot by spot',
  },
  {
    src: '/images/Pro/mobile-incident.jpg',
    alt: 'Health and safety incident report on mobile',
    title: 'Incidents, from anyone on site',
  },
];

const faqs = [

  {
    q: 'What happens when there is no signal in the block?',
    a: 'The mobile app queues writes locally and syncs when the connection returns. A banner tells you what is still queued and confirms when everything has landed, so nobody has to guess whether a record made it.',
  },
  {
    q: 'Can I get my existing block data in?',
    a: 'Blocks, rows, equipment and consumables all import from a spreadsheet, and the upload shows you a diff before anything is applied. Blocks can be drawn straight onto the satellite map, or assigned from our database if you have no file to start from.',
  },
  {
    q: 'Do my contractors need to buy a licence?',
    a: 'No. A contractor is a separate business with its own free account. You add a relationship with them, and from that point you can assign them work. They see only the companies they hold a live relationship with.',
  },
    {
    q: 'Does this replace my spray diary?',
    a: 'No. Spray diaries are required to be managed through GrapeLink for SWNZ complaince. We are actively exploring having a read view of Grapelink to allow spray jobs in Grow to be auto scheduled off of Grapelink jobs.',
  },
  {
    q: 'Who owns the data?',
    a: 'You do. Every record belongs to your company, and the reports and spreadsheet exports are there so you can take it with you at any time.',
  },
  {
    q: 'Where does the climate data come from?',
    a: 'Auxein runs its own virtual climate network - interpolated surfaces built from council, Met stations, and research station records going back to 1986, published at property resolution. The same engine powers the free Auxein Insights service.',
  },
];

function ChromeBar() {
  return (
    <div className="flex items-center gap-1.5 px-4 py-2.5 bg-sand border-b border-olive/10">
      <span className="w-2.5 h-2.5 rounded-full bg-olive/25" />
      <span className="w-2.5 h-2.5 rounded-full bg-olive/25" />
      <span className="w-2.5 h-2.5 rounded-full bg-olive/25" />
    </div>
  );
}

/* Product screenshots vary in aspect (1.38 to 2.01), so they sit inside a fixed
   window and are contained rather than cropped. The chrome bar makes the
   letterboxing read as a browser rather than as a mistake. Click to maximise. */
function Shot({
  src,
  alt,
  onOpen,
}: {
  src: string;
  alt: string;
  onOpen?: () => void;
}) {
  const frame = (
    <div className="rounded-xl overflow-hidden border border-olive/15 shadow-xl bg-white">
      <ChromeBar />
      <div className="relative aspect-[16/10] bg-white">
        <Image
          src={src}
          alt={alt}
          fill
          sizes="(max-width: 1024px) 100vw, 50vw"
          className="object-contain"
        />
      </div>
    </div>
  );

  if (!onOpen) return frame;

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`View ${alt} full size`}
      className="group relative block w-full rounded-xl text-left transition-transform duration-200 hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-olive focus-visible:ring-offset-2"
    >
      {frame}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-charcoal-950/30 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100"
      >
        <Maximize2 className="h-8 w-8 text-white drop-shadow" />
      </span>
    </button>
  );
}

/* Maximised view: natural aspect, never upscaled past the source resolution -
   these captures are only 981 to 1554px wide. */
function ShotLarge({
  src,
  alt,
  width,
  height,
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
}) {
  return (
    <div className="pointer-events-auto w-fit overflow-hidden rounded-xl border border-olive/15 bg-white shadow-2xl">
      <ChromeBar />
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        className="block h-auto w-auto max-h-[78vh]"
        style={{ maxWidth: `min(${width}px, 92vw)` }}
      />
    </div>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-olive/15">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="w-full flex items-start justify-between gap-4 py-5 text-left group"
      >
        <span className="font-semibold text-charcoal group-hover:text-olive transition-colors">
          {q}
        </span>
        <span className="shrink-0 mt-0.5 text-olive">
          {open ? <Minus className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
        </span>
      </button>
      {open && (
        <p className="pb-5 -mt-1 text-charcoal-600 leading-relaxed max-w-3xl">{a}</p>
      )}
    </div>
  );
}

export default function GrowContent() {
  const tourLightbox = useLightbox(tour.length);
  const region = useRegion();
  const price = GROW_PRICE[region];
  const copy = REGION_COPY[region];
  const regionTour = tour.map((item) => ({ ...item, ...copy.tour[item.id] }));
  const openShot = tourLightbox.index === null ? null : tour[tourLightbox.index];
  const climateShotIndex = tour.findIndex((t) => t.id === 'insights');

  return (
    <>
      {/* ---------------------------------------------------------------- Hero */}
      <section className="pt-24 pb-12 md:pt-32 md:pb-20 bg-sand relative overflow-hidden">
        <div className="texture-overlay" />
        <div className="absolute top-20 right-0 w-96 h-96 bg-olive/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-terracotta/10 rounded-full blur-3xl" />

        <Container className="relative z-10">
          <div className="max-w-3xl">
            <div
              className="mb-6 reveal reveal-on-scroll"
            >
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-olive/10 text-olive text-sm font-semibold">
                <span className="w-2 h-2 rounded-full bg-olive animate-pulse" />
                Out now on iOS, Android and web
              </span>
            </div>

            <h1
              className="text-4xl md:text-5xl lg:text-6xl font-bold text-charcoal mb-6 text-balance reveal"
              style={{ animationDelay: "0.1s" }}
            >
              Plan the work. Do it in the field.{' '}
              <span className="text-olive">Prove it happened.</span>
            </h1>

            <p
              className="text-lg md:text-xl text-charcoal-600 mb-8 leading-relaxed reveal"
              style={{ animationDelay: "0.2s" }}
            >
              Auxein Grow runs the vineyard day to day - tasks row by row, observations
              spot by spot, hazards, hours and stock - on forty years of property-level
              climate data and peer-reviewed disease models. Your audit
              pack writes itself as you work.
            </p>

            <div
              className="flex flex-wrap gap-4 mb-10 reveal"
              style={{ animationDelay: "0.3s" }}
            >
              <Button href={ENQUIRE} size="lg">
                Book a walkthrough
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
              <Button href={GROW_LOGIN_URL} external variant="secondary" size="lg">
                Log in
                <ExternalLink className="w-5 h-5 ml-2" />
              </Button>
            </div>

            <div className="reveal reveal-on-scroll"
              style={{ animationDelay: "0.4s" }}
            >
              <p className="text-sm font-semibold text-charcoal-500 mb-4">
                Get the field app
              </p>
              <AppStoreBadges />
            </div>
          </div>
        </Container>
      </section>

      {/* --------------------------------------------------------- The loop */}
      <section className="py-16 md:py-24 bg-sand">
        <Container>
          <div className="max-w-3xl mb-10 md:mb-14">
            <span className="text-olive font-semibold text-sm uppercase tracking-wider">
              How it works
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-charcoal mt-2 mb-4">
              One loop, four moves
            </h2>
            <p className="text-charcoal-600 text-lg leading-relaxed">
              Most vineyard software asks you to do the job, then record the job. Grow
              records it because you did it - the compliance trail is a by-product, not a
              second shift.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {loop.map((item, i) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.step}
                  className="bg-white rounded-xl border border-olive/10 p-6 flex flex-col reveal"
              style={{ animationDelay: `${i * 0.1}s` }}
            >
                  <div className="flex items-center gap-3 mb-4">
                    <span className="w-10 h-10 rounded-xl bg-olive/10 flex items-center justify-center shrink-0">
                      <Icon className="w-5 h-5 text-olive" />
                    </span>
                    <span className="font-mono text-xs uppercase tracking-widest text-charcoal-400">
                      {item.step}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-charcoal mb-2">{item.title}</h3>
                  <p className="text-charcoal-600 text-sm leading-relaxed">{item.body}</p>
                </div>
              );
            })}
          </div>
        </Container>
      </section>

      {/* ------------------------------------------------------- Product tour */}
      <section className="py-16 md:py-24 bg-white" id="tour">
        <Container>
          <div className="max-w-3xl mb-10 md:mb-16">
            <span className="text-olive font-semibold text-sm uppercase tracking-wider">
              The product
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-charcoal mt-2 mb-4">
              What you get on day one
            </h2>
            <p className="text-charcoal-600 text-lg leading-relaxed">
              Everything below is shipped and in use. Nothing on this page is a roadmap
              item.
            </p>
          </div>

          <div className="space-y-16 md:space-y-24">
            {regionTour.map((item, i) => (
              <div
                key={item.id}
                id={item.id}
                className="grid lg:grid-cols-2 gap-8 lg:gap-14 items-center reveal reveal-on-scroll"
              >
                <div className={i % 2 === 1 ? 'lg:order-2' : ''}>
                  <span className="text-terracotta font-semibold text-sm uppercase tracking-wider">
                    {item.eyebrow}
                  </span>
                  <h3 className="text-2xl md:text-3xl font-bold text-charcoal mt-2 mb-4">
                    {item.title}
                  </h3>
                  <p className="text-charcoal-600 leading-relaxed mb-6">{item.body}</p>
                  <ul className="space-y-3">
                    {item.points.map((point) => (
                      <li key={point} className="flex items-start gap-3">
                        <span className="w-5 h-5 rounded-full bg-olive/15 flex items-center justify-center shrink-0 mt-0.5">
                          <Check className="w-3 h-3 text-olive" />
                        </span>
                        <span className="text-charcoal">{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className={i % 2 === 1 ? 'lg:order-1' : ''}>
                  <Shot
                    src={item.image}
                    alt={item.alt}
                    onOpen={() => tourLightbox.open(i)}
                  />
                </div>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* ------------------------------------------------------------- Roles */}
      <section className="py-16 md:py-24 bg-sand">
        <Container>
          <div className="max-w-3xl mb-10 md:mb-14">
            <span className="text-olive font-semibold text-sm uppercase tracking-wider">
              Who it is for
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-charcoal mt-2 mb-4">
              Everyone on the property, and only what they need
            </h2>
            <p className="text-charcoal-600 text-lg leading-relaxed">
              Five account types, enforced on the server rather than hidden in the
              interface. Your crew cannot see pay rates because the API will not send
              them.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {roles.map((role, i) => (
              <div
                key={role.name}
                className="bg-white rounded-xl border border-olive/10 p-6 reveal"
              style={{ animationDelay: `${i * 0.07}s` }}
            >
                <div className="flex items-center justify-between gap-3 mb-3">
                  <h3 className="text-lg font-bold text-charcoal">{role.name}</h3>
                  <span className="text-xs font-semibold text-charcoal-500 bg-sand px-2.5 py-1 rounded-full whitespace-nowrap">
                    {role.where}
                  </span>
                </div>
                <p className="text-charcoal-600 text-sm leading-relaxed">{role.body}</p>
              </div>
            ))}

            <div
              className="rounded-xl border-2 border-dashed border-olive/25 p-6 flex flex-col justify-center reveal"
              style={{ animationDelay: "0.35s" }}
            >
              <Users className="w-6 h-6 text-olive mb-3" />
              <p className="text-charcoal-600 text-sm leading-relaxed">
                Scope each person to the properties they should see. A manager on one
                site never sees another.
              </p>
            </div>
          </div>
        </Container>
      </section>

      {/* -------------------------------------------------------- Compliance */}
      <section className="py-16 md:py-24 bg-charcoal text-white">
        <Container>
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-start">
            <div className="reveal reveal-on-scroll"
            >
              <span className="text-olive-300 font-semibold text-sm uppercase tracking-wider">
                Compliance
              </span>
              <h2 className="text-3xl md:text-4xl font-bold mt-2 mb-5">
                The audit pack is already written
              </h2>
              <p className="text-charcoal-300 text-lg leading-relaxed mb-6">
                {copy.complianceIntro}
              </p>
              <Button href={ENQUIRE} size="lg">
                Talk it through
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </div>

            <ul
              className="space-y-4 reveal"
              style={{ animationDelay: "0.15s" }}
            >
              {copy.compliance.map((line) => (
                <li key={line} className="flex items-start gap-3">
                  <span className="w-5 h-5 rounded-full bg-olive/25 flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-3 h-3 text-olive-300" />
                  </span>
                  <span className="text-charcoal-200 leading-relaxed">{line}</span>
                </li>
              ))}
              {copy.complianceNote && (
                <li className="pt-2 text-sm leading-relaxed text-charcoal-400">
                  {copy.complianceNote}
                </li>
              )}
            </ul>
          </div>
        </Container>
      </section>

      {/* ----------------------------------------------------------- Climate */}
      <section className="py-16 md:py-24 bg-white">
        <Container>
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            <div className="reveal reveal-on-scroll"
            >
              <span className="text-olive font-semibold text-sm uppercase tracking-wider">
                Climate intelligence
              </span>
              <h2 className="text-3xl md:text-4xl font-bold text-charcoal mt-2 mb-5">
                The part nobody else has
              </h2>
              <p className="text-charcoal-600 text-lg leading-relaxed mb-6">
                Grow sits on Auxein&apos;s own virtual climate network: interpolated
                surfaces built from council, Met station, and research station records
                going back to 1986, resolved to the property rather than the nearest town.
                That history drives the disease models, the growing degree day tracking
                and the phenology comparison.
              </p>
              <ul className="space-y-3 mb-8">
                {[
                  'Downy mildew, powdery mildew and botrytis pressure from your own conditions',
                  'Growing degree days and season tracking against forty years of your block',
                  'Modelled budburst and phenology beside what you actually observed',
                ].map((line) => (
                  <li key={line} className="flex items-start gap-3">
                    <span className="w-5 h-5 rounded-full bg-olive/15 flex items-center justify-center shrink-0 mt-0.5">
                      <Check className="w-3 h-3 text-olive" />
                    </span>
                    <span className="text-charcoal">{line}</span>
                  </li>
                ))}
              </ul>
              <Button href={INSIGHTS_URL} external variant="secondary">
                Check out Auxein Insights
                <ExternalLink className="w-4 h-4 ml-2" />
              </Button>
            </div>

            <div className="reveal reveal-on-scroll"
            >
              <Shot
                src="/images/insights-dashboard.JPG"
                alt="Climate and disease pressure dashboard"
                onOpen={() => tourLightbox.open(climateShotIndex)}
              />
            </div>
          </div>
        </Container>
      </section>

      {/* ------------------------------------------------------------ Mobile */}
      <section className="py-16 md:py-24 bg-charcoal text-white">
        <Container>
          <div className="max-w-3xl mx-auto text-center mb-10 md:mb-16">
            <span className="text-olive-300 font-semibold text-sm uppercase tracking-wider">
              In the field
            </span>
            <h2 className="text-3xl md:text-4xl font-bold mt-2 mb-4">
              Built for a phone in a wet pocket
            </h2>
            <p className="text-charcoal-300 text-lg leading-relaxed">
              The field app is not a shrunken dashboard. It is the three or four things
              someone needs while standing in the row, and it keeps working when the
              signal does not.
            </p>
          </div>

          <PhoneShowcase shots={mobileShots} />

          <div
            className="max-w-3xl mx-auto grid sm:grid-cols-3 gap-6 reveal reveal-on-scroll"
          >
            {[
              { icon: WifiOff, label: 'Works offline', sub: 'Writes queue and sync when signal returns' },
              { icon: Layers, label: 'Row by row', sub: 'Status, notes and issues per row' },
              { icon: HardHat, label: 'Sign on to site', sub: 'One tap, and the headcount is live' },
            ].map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.label} className="text-center">
                  <Icon className="w-6 h-6 text-olive-300 mx-auto mb-3" />
                  <p className="font-semibold mb-1">{f.label}</p>
                  <p className="text-charcoal-400 text-sm leading-snug">{f.sub}</p>
                </div>
              );
            })}
          </div>

          <div className="flex justify-center mt-12">
            <AppStoreBadges />
          </div>
        </Container>
      </section>

      {/* ----------------------------------------------------------- Pricing */}
      <section className="py-16 md:py-24 bg-sand" id="pricing">
        <Container>
          <div className="max-w-3xl mx-auto text-center mb-10">
            <span className="text-olive font-semibold text-sm uppercase tracking-wider">
              Pricing
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-charcoal mt-2 mb-4">
              One price, by the hectare
            </h2>
            <p className="text-charcoal-600 text-lg leading-relaxed">
              No per-seat charge, no tier that hides the compliance features behind an
              upgrade. Your crew, your contractors and your health-and-safety accounts
              are all included.
            </p>
          </div>

          <div
            className="max-w-xl mx-auto bg-white rounded-2xl border border-olive/15 shadow-lg p-8 md:p-10 text-center reveal reveal-on-scroll"
          >
            <p className="text-5xl font-bold text-charcoal mb-2">
              {price.amount}
              <span className="text-xl font-semibold text-charcoal-500">
                {price.unit}
              </span>
            </p>
            <p className="text-charcoal-500 mb-8">{price.note}</p>

            <ul className="space-y-3 text-left mb-8">
              {[
                'Unlimited users, contractors and H&S accounts',
                'Web and mobile apps, on iOS and Android',
                'Climate history, disease models and all reports',
                'Data import, onboarding and support included',
                'If you want a new feature - we will build it',
              ].map((line) => (
                <li key={line} className="flex items-start gap-3">
                  <span className="w-5 h-5 rounded-full bg-olive/15 flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-3 h-3 text-olive" />
                  </span>
                  <span className="text-charcoal">{line}</span>
                </li>
              ))}
            </ul>

            <Button href={ENQUIRE} size="lg" className="w-full">
              Book a walkthrough
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </div>
        </Container>
      </section>

      {/* --------------------------------------------------------------- FAQ */}
      <section className="py-16 md:py-24 bg-white">
        <Container>
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold text-charcoal mb-8 md:mb-10">
              Questions we get asked
            </h2>
            <div className="border-t border-olive/15">
              {faqs.map((f) => (
                <Faq key={f.q} q={f.q} a={f.a} />
              ))}
            </div>
          </div>
        </Container>
      </section>

      {/* --------------------------------------------------------- Final CTA */}
      <section className="py-16 md:py-24 bg-sand">
        <Container>
          <div
            className="max-w-3xl mx-auto text-center reveal reveal-on-scroll"
          >
            <ClipboardCheck className="w-10 h-10 text-olive mx-auto mb-5" />
            <h2 className="text-3xl md:text-4xl font-bold text-charcoal mb-4">
              See it against your own blocks
            </h2>
            <p className="text-charcoal-600 text-lg leading-relaxed mb-8">
              Send us a property and we will set it up with your blocks, your varieties
              and your climate history before the call - so you are looking at your
              vineyard, not a demo one.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Button href={ENQUIRE} size="lg">
                Book a walkthrough
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
              <Button href={GROW_LOGIN_URL} external variant="secondary" size="lg">
                Log in
                <ExternalLink className="w-5 h-5 ml-2" />
              </Button>
            </div>
          </div>
        </Container>
      </section>

      <LightboxShell
        state={tourLightbox}
        count={tour.length}
        label={openShot?.alt ?? 'Screenshot'}
        caption={openShot?.eyebrow}
      >
        {openShot && (
          <ShotLarge
            src={openShot.image}
            alt={openShot.alt}
            width={openShot.width}
            height={openShot.height}
          />
        )}
      </LightboxShell>
    </>
  );
}
