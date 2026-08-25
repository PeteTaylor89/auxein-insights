// pages/About.jsx — how Insights is built, and whose observations it rests on.
//
// REWRITTEN 2026-08-20, then extended the same day to absorb ALL FIVE views of
// the in-app methodology modal (components/climate/ClimateAbout.jsx): current
// season, historical record, phenology, disease pressure and projections. The
// "About" badges that opened that modal from the region pages were retired in
// the same change, so this page is now the only home for the methodology —
// which is why nothing could be left behind.
//
// The old page was generic marketing copy with a bespoke header and footer on
// the retired wide wordmark, and it credited no regional council at all —
// the part that actually matters, since Auxein owns none of the raw
// observations behind this product.
//
// THREE CORRECTIONS MADE IN THE MOVE. The modal was not self-consistent and
// two of its numbers did not match the database:
//
//   1. GDD accumulation was described as starting "October 1" while the same
//      view stated a September-April season. `adjust_gdd_to_sep1` in
//      realtime_climate.py settles it: 1 SEPTEMBER. The modal was corrected to
//      match rather than left to disagree with this page.
//   2. The historical record was given as "1986 - 2024". The database says
//      1986-2023 monthly and vintages 1987-2023. See HISTORICAL_FACTS.
//
// Content data lives in src/data/aboutContent.js — thresholds and citations
// are tabular and belong in a table, not in markup.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Database,
  Sun,
  Thermometer,
  Radio,
  Gauge,
  Grape,
  ShieldAlert,
  Droplets,
  TrendingUp,
  AlertCircle,
  BookOpen,
  ExternalLink,
  ArrowRight,
  Scale,
} from 'lucide-react';
import SiteHeader from '../components/SiteHeader';
import SiteFooter from '../components/SiteFooter';
import AuthModal from '../components/auth/AuthModal';
import useDocumentMeta from '../hooks/useDocumentMeta';
import { OBSERVING_AGENCIES, OBSERVING_PROGRAMMES } from '../data/observingAgencies';
import {
  ABOUT_SECTIONS,
  SEASON_STATES,
  HISTORICAL_FACTS,
  HISTORICAL_VARIABLES,
  PHENOLOGY_NOTES,
  PHENOLOGY_CITATIONS,
  DISEASE_MODELS,
  LEAF_WETNESS_RULES,
  DISEASE_LIMITS,
  DISEASE_CITATIONS,
  SSP_SCENARIOS,
  PROJECTION_PERIODS,
  PROJECTION_NOTES,
  PROJECTION_CITATIONS,
  USE_TERMS,
} from '../data/aboutContent';
import './About.css';

/** A lead-in-bold caveat list. Used for every "how to read this" block. */
function NoteList({ items }) {
  return (
    <ul className="about-terms">
      {items.map((n) => (
        <li key={n.lead}>
          <strong>{n.lead}</strong> {n.body}
        </li>
      ))}
    </ul>
  );
}

/** Papers behind a model. Not every one has a stable public URL. */
function Citations({ items, heading = 'References' }) {
  return (
    <>
      <h3 className="about-subhead">{heading}</h3>
      <ul className="about-citations">
        {items.map((c) => (
          <li key={c.title}>
            <span className="about-citations__authors">{c.authors}</span>
            <span className="about-citations__title">
              {c.url ? (
                <a href={c.url} target="_blank" rel="noopener noreferrer">
                  {c.title}
                  <ExternalLink size={13} aria-hidden="true" />
                </a>
              ) : (
                c.title
              )}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

function AgencyLink({ name, url }) {
  if (!url) return <li>{name}</li>;
  return (
    <li>
      <span>{name}</span>
      <a href={url} target="_blank" rel="noopener noreferrer" aria-label={`${name} website`}>
        <ExternalLink size={14} aria-hidden="true" />
      </a>
    </li>
  );
}

function About() {
  const [authModalOpen, setAuthModalOpen] = useState(false);

  useDocumentMeta({
    title: 'About the data',
    description:
      'How Auxein Insights calculates growing degree days, phenology, disease pressure and climate projections, where the observations come from, and the regional councils and station operators whose monitoring makes it possible.',
    path: '/about',
  });

  return (
    <div className="about-page">
      <SiteHeader onSignInClick={() => setAuthModalOpen(true)} />

      <main className="about-main">
        <header className="about-hero">
          <p className="about-hero__eyebrow">About the data</p>
          <h1>How Insights is built, and whose data it rests on</h1>
          <p className="about-hero__lede">
            Auxein Insights turns raw weather observations into regional climate
            intelligence for New Zealand growers. This page sets out where those
            observations come from, how every number on the site is calculated,
            and what we are and are not responsible for.
          </p>
          <nav className="about-toc" aria-label="On this page">
            {ABOUT_SECTIONS.map((s) => (
              <a key={s.id} href={`#${s.id}`}>{s.label}</a>
            ))}
          </nav>
        </header>

        {/* ================= CURRENT SEASON ================= */}
        <h2 className="about-part" id="current-season">Current season</h2>

        <section className="about-block" aria-labelledby="about-monitoring">
          <div className="about-block__icon about-block__icon--sun">
            <Sun size={22} aria-hidden="true" />
          </div>
          <div className="about-block__body">
            <h3 id="about-monitoring">Live climate monitoring</h3>
            <p>
              The Current Season view reports conditions measured by weather
              stations inside New Zealand&rsquo;s wine regions, for the vintage
              now under way. Raw observations are collected continuously through
              the day; the regional daily statistics built from them are
              published each afternoon.
            </p>
            <dl className="about-facts">
              <div>
                <dt>Raw observations</dt>
                <dd>Ingested hourly from the contributing networks</dd>
              </div>
              <div>
                <dt>Regional daily statistics</dt>
                <dd>Computed daily, before 6pm NZST</dd>
              </div>
              <div>
                <dt>Growing season</dt>
                <dd>1 September to 30 April (Southern Hemisphere)</dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="about-block" aria-labelledby="about-gdd">
          <div className="about-block__icon about-block__icon--warm">
            <Thermometer size={22} aria-hidden="true" />
          </div>
          <div className="about-block__body">
            <h3 id="about-gdd">Growing degree days</h3>
            <p>
              Growing degree days measure the accumulated heat available for vine
              growth and ripening — the thermal energy a season has delivered so
              far, rather than the temperature on any one day. Current Season
              presents <strong>both bases</strong>, and you can switch between
              them.
            </p>
            <div className="about-bases">
              <div className="about-base">
                <h4>Base 10 °C <span className="about-base__tag">default</span></h4>
                <p className="about-formula"><code>GDD₁₀ = Σ max(0, T̅mean − 10)</code></p>
                <p>
                  The conventional viticultural measure, and the one the
                  historical record uses — so it is the base to read when
                  comparing this season against past ones.
                </p>
              </div>
              <div className="about-base">
                <h4>Base 0 °C</h4>
                <p className="about-formula"><code>GDD₀ = Σ max(0, T̅mean)</code></p>
                <p>
                  Stays meaningful across New Zealand&rsquo;s cooler regions,
                  where a 10 °C base discards most of the early season before it
                  has begun.
                </p>
              </div>
            </div>
            <p className="about-note">
              Both accumulate from 1 September, the start of the growing season.
              &ldquo;Versus baseline&rdquo; compares that running total against
              the 1986-2005 average accumulation <em>for the same date</em>, so a
              season is judged against where it should be by now rather than
              against a whole-season figure. That comparison — and the season
              position below — is computed on base 0.
            </p>
            <p className="about-callout-inline">
              <strong>Check which base you are reading.</strong> A base-10 total
              and a base-0 total for the same season are different measures of
              different things, and the two numbers are not comparable with each
              other.
            </p>

          </div>
        </section>

        <section className="about-block" aria-labelledby="about-status">
          <div className="about-block__icon about-block__icon--gauge">
            <Gauge size={22} aria-hidden="true" />
          </div>
          <div className="about-block__body">
            <h3 id="about-status">Reading the season position</h3>
            <p>
              Every region carries one of three states, set by how its
              accumulation compares with the same date in the baseline period.
            </p>
            <div className="about-cards">
              {SEASON_STATES.map((s) => (
                <div key={s.key} className={`about-card about-card--${s.key}`}>
                  <h4>{s.title}</h4>
                  <p>{s.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ================= HISTORICAL ================= */}
        <h2 className="about-part" id="historical">Historical climate record</h2>

        <section className="about-block" aria-labelledby="about-history-source">
          <div className="about-block__icon about-block__icon--data">
            <Database size={22} aria-hidden="true" />
          </div>
          <div className="about-block__body">
            <h3 id="about-history-source">Where the record comes from</h3>
            <p>
              The historical series is built from a network of weather stations
              and data. Those observations are put through an Auxein-developed interpolation model to estimate daily
              climate producing a gridded virtual climate record rather than a set of point readings. Auxein's interpolation model was validated against NZ Climate Databases and normals. 
            </p>
            <dl className="about-facts">
              {HISTORICAL_FACTS.map((f) => (
                <div key={f.term}>
                  <dt>{f.term}</dt>
                  <dd>{f.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="about-block" aria-labelledby="about-baseline">
          <div className="about-block__icon about-block__icon--gauge">
            <Gauge size={22} aria-hidden="true" />
          </div>
          <div className="about-block__body">
            <h3 id="about-baseline">The 1986-2005 baseline</h3>
            <p>
              Every comparison on the site references the 1986-2005 baseline: a
              twenty-year average chosen because it aligns with the reference
              period used by international climate models, which is what makes
              the projections further down comparable with the history above.
              It also sits within the period of reliable instrumental record.
            </p>
            <p>
              Where you see &ldquo;versus baseline&rdquo;, a positive value means
              conditions warmer or wetter than that 1986-2005 average.
            </p>
          </div>
        </section>



        {/* ================= PHENOLOGY ================= */}
        <h2 className="about-part" id="phenology">Phenology</h2>

        <section className="about-block" aria-labelledby="about-pheno-model">
          <div className="about-block__icon about-block__icon--grow">
            <Grape size={22} aria-hidden="true" />
          </div>
          <div className="about-block__body">
            <h3 id="about-pheno-model">Prediction models</h3>
            <p>
              Phenology estimates predict key grapevine development stages from
              accumulated growing degree days, to support harvest planning, spray
              timing and resource allocation.
            </p>
            <p>
              The models come from two studies of international wine regions that
              derive phenological timing from GDD thresholds. This release
              presents <strong>flowering and harvest</strong> estimates only -
              véraison carries materially higher estimation error and is held
              back rather than published at a confidence we do not have.
            </p>
            <h3 id="about-pheno-model">Scientific Basis</h3>
            <Citations items={PHENOLOGY_CITATIONS} heading="" />
          </div>
        </section>

        <section className="about-block" aria-labelledby="about-pheno-notes">
          <div className="about-block__icon about-block__icon--warn">
            <AlertCircle size={22} aria-hidden="true" />
          </div>
          <div className="about-block__body">
            <h3 id="about-pheno-notes">How to read a phenology estimate</h3>
            <NoteList items={PHENOLOGY_NOTES} />
          </div>
        </section>

        {/* ================= DISEASE ================= */}
        <h2 className="about-part" id="disease">Disease pressure</h2>

        <section className="about-block" aria-labelledby="about-disease-intro">
          <div className="about-block__icon about-block__icon--alert">
            <ShieldAlert size={22} aria-hidden="true" />
          </div>
          <div className="about-block__body">
            <h3 id="about-disease-intro">What is being modelled</h3>
            <p>
              Disease pressure indicators are calculated daily using
              peer-reviewed epidemiological models. They assess whether
              environmental conditions favour disease development and infection -
              not whether disease is present.
            </p>
            <dl className="about-facts">
              <div>
                <dt>Diseases monitored</dt>
                <dd>Powdery mildew, downy mildew, botrytis</dd>
              </div>
              <div>
                <dt>Update frequency</dt>
                <dd>Daily</dd>
              </div>
              <div>
                <dt>Data inputs</dt>
                <dd>Temperature, humidity, rainfall, leaf wetness (estimated)</dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="about-block" aria-labelledby="about-disease-models">
          <div className="about-block__icon about-block__icon--data">
            <BookOpen size={22} aria-hidden="true" />
          </div>
          <div className="about-block__body">
            <h3 id="about-disease-models">The three models</h3>
            <div className="about-models">
              {DISEASE_MODELS.map((m) => (
                <article key={m.key} className="about-model">
                  <h4>{m.name}</h4>
                  <p className="about-model__source">{m.model}</p>
                  <p>{m.body}</p>
                  <ul className="about-bands" aria-label={`${m.name} risk bands`}>
                    {m.bands.map((b) => (
                      <li key={b.label} className={`about-band about-band--${b.label.toLowerCase()}`}>
                        <span className="about-band__label">{b.label}</span>
                        <span className="about-band__range">{b.range}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="about-block" aria-labelledby="about-wetness">
          <div className="about-block__icon about-block__icon--wet">
            <Droplets size={22} aria-hidden="true" />
          </div>
          <div className="about-block__body">
            <h3 id="about-wetness">Estimating leaf wetness</h3>
            <p>
              Few stations carry a leaf wetness sensor. Where one is not
              available we estimate wetness probability using the Magnus-Tetens
              dewpoint formula together with humidity thresholds:
            </p>
            <ul className="about-rules">
              {LEAF_WETNESS_RULES.map((r) => <li key={r}>{r}</li>)}
            </ul>
          </div>
        </section>

        <section className="about-block" aria-labelledby="about-disease-limits">
          <div className="about-block__icon about-block__icon--warn">
            <AlertCircle size={22} aria-hidden="true" />
          </div>
          <div className="about-block__body">
            <h3 id="about-disease-limits">Limitations that matter</h3>
            <NoteList items={DISEASE_LIMITS} />
            <h3 id="about-disease-limits">References</h3>
            <Citations items={DISEASE_CITATIONS} heading=""/>
          </div>
        </section>

        {/* ================= PROJECTIONS ================= */}
        <h2 className="about-part" id="projections">Climate projections</h2>

        <section className="about-block" aria-labelledby="about-ssp">
          <div className="about-block__icon about-block__icon--trend">
            <TrendingUp size={22} aria-hidden="true" />
          </div>
          <div className="about-block__body">
            <h3 id="about-ssp">Emissions scenarios</h3>
            <p>
              Projections are based on the Shared Socioeconomic Pathways from the
              IPCC&rsquo;s Sixth Assessment Report and the CMIP6 climate model
              ensemble. Three pathways are carried, spanning strong mitigation to
              limited mitigation.
            </p>
            <div className="about-ssps">
              {SSP_SCENARIOS.map((s) => (
                <div key={s.key} className={`about-ssp about-ssp--${s.key}`}>
                  <span className="about-ssp__badge">{s.badge}</span>
                  <span className="about-ssp__text">
                    <strong>{s.name}</strong> - {s.body}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="about-block" aria-labelledby="about-periods">
          <div className="about-block__icon about-block__icon--gauge">
            <Gauge size={22} aria-hidden="true" />
          </div>
          <div className="about-block__body">
            <h3 id="about-periods">Time periods</h3>
            <div className="about-cards">
              {PROJECTION_PERIODS.map((p) => (
                <div key={p.key} className="about-card about-card--period">
                  <h4>{p.label}</h4>
                  <p className="about-card__years">{p.years}</p>
                  <p>{p.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="about-block" aria-labelledby="about-proj-notes">
          <div className="about-block__icon about-block__icon--warn">
            <AlertCircle size={22} aria-hidden="true" />
          </div>
          <div className="about-block__body">
            <h3 id="about-proj-notes">How to read a projection</h3>
            <NoteList items={PROJECTION_NOTES} />
            <h3 id="about-proj-notes">Sources</h3>
            <Citations items={PROJECTION_CITATIONS} heading="" />
          </div>
        </section>

        {/* ================= ACKNOWLEDGEMENT ================= */}
        <h2 className="about-part" id="acknowledgement">Acknowledgements</h2>

        <section className="about-block about-block--callout" aria-labelledby="about-contribute">
          <div className="about-block__icon about-block__icon--grow">
            <Radio size={22} aria-hidden="true" />
          </div>
          <div className="about-block__body">
            <h3 id="about-contribute">Help us fill the gaps</h3>
            <p>
              Some climate zones need more data to improve our projections,
              Phenology, and Disease Pressure.
            </p>
            <p>
              <strong>If you host a weather station and would consider
              contributing its data, we would like to hear from you.</strong>
            </p>
            <a
              href="https://auxein.co.nz/contact"
              target="_blank"
              rel="noopener noreferrer"
              className="about-cta about-cta--ghost"
            >
              Contact Auxein
              <ExternalLink size={15} aria-hidden="true" />
            </a>
          </div>
        </section>

        <section className="about-block" aria-labelledby="about-credit">
          <div className="about-block__icon about-block__icon--data">
            <Database size={22} aria-hidden="true" />
          </div>
          <div className="about-block__body">
            <h3 id="about-credit">Data acknowledgement</h3>
            <p>
              Auxein does not own the raw observations behind these insights.
              They are collected and published by New Zealand&rsquo;s regional
              councils and unitary authorities, by growers who host their own
              weather stations, and by international observing programmes. We
              gratefully acknowledge the organisations below, whose ongoing
              investment in environmental monitoring makes this work possible.
            </p>

            <h3 className="about-credit">Regional councils and unitary authorities</h3>
            <ul className="about-agencies">
              {OBSERVING_AGENCIES.map((a) => (
                <AgencyLink key={a.name} name={a.name} url={a.url} />
              ))}
            </ul>

            <h3 className="about-credit">Station operators and international programmes</h3>
            <ul className="about-agencies">
              {OBSERVING_PROGRAMMES.map((a) => (
                <AgencyLink key={a.name} name={a.name} url={a.url} />
              ))}
            </ul>
          </div>
        </section>

        <section className="about-block" aria-labelledby="about-terms">
          <div className="about-block__icon about-block__icon--scale">
            <Scale size={22} aria-hidden="true" />
          </div>
          <div className="about-block__body">
            <h3 id="about-terms">Use, licensing and responsibility</h3>
            <NoteList items={USE_TERMS} />
          </div>
        </section>

        <section className="about-pro" aria-labelledby="about-pro-heading">
          <h2 id="about-pro-heading">Auxein Insights Pro</h2>
          <p>
            Everything above is regional. Pro resolves the same climate record to
            a single point you choose - your own site, with its own history and
            its own position against the region around it. Additional market and environmental Insights are coming to Pro this season. 
          </p>
          <div className="about-pro__actions">
            <Link to="/pro" className="about-cta">
              Explore Insights Pro
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
            <Link to="/map" className="about-cta about-cta--ghost">
              Open the Atlas
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        context="about"
      />
    </div>
  );
}

export default About;
