// pages/Pro.jsx — the page Pro never had.
//
// Built 2026-08-20. Until now every route to Pro was a dead end: the
// AccessGate's "See Pro" button had nowhere to go, the /my-site gate opened a
// blank mail client, and the only on-site description of the product was a
// sentence inside a gate. Pro has never had a paying customer, which is not
// surprising given there was nothing to read.
//
// WHAT THIS PAGE IS NOT
// It is not a checkout. Decided 2026-08-20: access is arranged by enquiry and
// invoiced through Xero, matching how Grow is billed — no Stripe, no card
// form, no self-serve purchase. The page says so plainly in the "How access
// works" section rather than implying instant signup and then handing over a
// mailto, which would be worse than saying nothing.
//
// It also carries NO PRICE. None exists for Insights Pro anywhere in the
// product, and a number invented to fill a layout is a number on a public page
// that nobody agreed to honour. When there is one, it goes in proContent.js
// and gets a block here.
//
// Every feature claim comes from what ships — see the note at the top of
// proContent.js.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  MapPin,
  History,
  Snowflake,
  BarChart3,
  TrendingUp,
  Radio,
  Check,
  Minus,
  Sparkles,
  Mail,
  ArrowRight,
} from 'lucide-react';
import SiteHeader from '../components/SiteHeader';
import SiteFooter from '../components/SiteFooter';
import AuthModal from '../components/auth/AuthModal';
import useDocumentMeta from '../hooks/useDocumentMeta';
import { usePublicAuth } from '../contexts/PublicAuthContext';
import {
  PRO_FEATURES,
  PRO_COMPARISON,
  PRO_ACCESS,
  GROW_INCLUDED_NOTE,
} from '../data/proContent';
import PricingCalculator from '../components/pro/PricingCalculator';
import ProEnquiryForm from '../components/pro/ProEnquiryForm';
import './Pro.css';

const ICONS = { MapPin, History, Snowflake, BarChart3, TrendingUp, Radio };

function Pro() {
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const { user, isAuthenticated } = usePublicAuth();

  // `is_pro` is server-computed and covers BOTH ways of holding Pro. Never
  // test `subscription_tier === 'pro'` here: Grow users carry tier 'grow' and
  // are fully entitled, so that comparison would show an existing customer a
  // page telling them to buy what they already have.
  const alreadyPro = isAuthenticated && user?.is_pro;

  useDocumentMeta({
    title: 'Insights Pro — your vineyard’s own climate record',
    description:
      'Auxein Insights Pro resolves New Zealand’s climate surface to a point you choose: your site’s own record back to 1986, its frost dates, and how it sits against the vineyards around it.',
    path: '/pro',
  });

  return (
    <div className="pro-page">
      <SiteHeader onSignInClick={() => setAuthModalOpen(true)} />

      <main className="pro-main">
        <header className="pro-hero">
          <p className="pro-hero__eyebrow">
            <Sparkles size={14} aria-hidden="true" />
            Insights Pro
          </p>
          <h1>Your vineyard has its own climate. Measure it.</h1>
          <p className="pro-hero__lede">
            Regional data tells you what Marlborough did. Pro tells you what
            <em> your block </em> did - one point you choose, resolved from the
            national climate surface, with its whole record and its own normal.
          </p>

          {alreadyPro ? (
            // An existing Pro user landing here has arrived by accident or
            // curiosity. Sending them to an enquiry form would be absurd.
            <div className="pro-hero__actions">
              <Link to="/my-site" className="pro-cta">
                Go to My Site
                <ArrowRight size={15} aria-hidden="true" />
              </Link>
              <span className="pro-hero__note">You already have Pro.</span>
            </div>
          ) : (
            <div className="pro-hero__actions">
              <a href="#enquire" className="pro-cta">
                <Mail size={15} aria-hidden="true" />
                Enquire about Pro
              </a>
              <Link to="/regions" className="pro-cta pro-cta--ghost">
                See the free regional data
              </Link>
            </div>
          )}
        </header>

        {/* ---- What you get ---- */}
        <section className="pro-section" aria-labelledby="pro-features">
          <h2 id="pro-features">What Pro adds</h2>
          <div className="pro-features">
            {PRO_FEATURES.map((f) => {
              const Icon = ICONS[f.icon] ?? MapPin;
              return (
                <article key={f.key} className="pro-feature">
                  <span className="pro-feature__icon">
                    <Icon size={20} aria-hidden="true" />
                  </span>
                  <h3>{f.title}</h3>
                  <p>{f.body}</p>
                </article>
              );
            })}
          </div>
        </section>

        {/* ---- Free vs Pro ---- */}
        <section className="pro-section" aria-labelledby="pro-compare">
          <h2 id="pro-compare">What is free, and what is not</h2>
          <p className="pro-section__lede">
            The regional product stays free and is not a trial. Pro is the same
            climate record resolved to a point instead of a region, with some additional features.
          </p>
          <div className="pro-table-wrap">
            <table className="pro-table">
              <thead>
                <tr>
                  <th scope="col">
                    <span className="sr-only">Feature</span>
                  </th>
                  <th scope="col">Free</th>
                  <th scope="col">Pro</th>
                </tr>
              </thead>
              <tbody>
                {PRO_COMPARISON.map((row) => (
                  <tr key={row.feature}>
                    <th scope="row">
                      {row.feature}
                      {/* A tick in a comparison table reads as a promise. Where
                          a row is only true in some regions it has to say so on
                          the row itself — a caveat further down the page is not
                          read by someone scanning the ticks. */}
                      {row.note && (
                        <span className="pro-table__note">{row.note}</span>
                      )}
                    </th>
                    <td>
                      {row.free ? (
                        <>
                          <Check size={17} aria-hidden="true" className="pro-yes" />
                          <span className="sr-only">Included</span>
                        </>
                      ) : (
                        <>
                          <Minus size={17} aria-hidden="true" className="pro-no" />
                          <span className="sr-only">Not included</span>
                        </>
                      )}
                    </td>
                    <td>
                      <Check size={17} aria-hidden="true" className="pro-yes" />
                      <span className="sr-only">Included</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ---- Pricing + the Grow comparison ----
            Sits before the Grow block on purpose: the calculator is what makes
            "Insights Pro is included with Grow" land, because a grower can see
            for themselves what each costs at their own size. Rates are fetched
            from the server; nothing here hardcodes a price. */}
        <PricingCalculator />

        {/* ---- Grow ---- */}
        <section className="pro-grow" aria-labelledby="pro-grow-heading">
          <h2 id="pro-grow-heading">Already using Auxein Grow?</h2>
          <p>{GROW_INCLUDED_NOTE}</p>
          <a
            href="https://auxein.co.nz/grow/"
            target="_blank"
            rel="noopener noreferrer"
            className="pro-cta pro-cta--ghost"
          >
            About Auxein Grow
          </a>
        </section>

        {/* ---- How access works ---- */}
        <section className="pro-section" aria-labelledby="pro-access">
          <h2 id="pro-access">How access works</h2>
          <p className="pro-section__lede">
            There is no checkout. Insights Pro is arranged directly and invoiced
            like every other Auxein subscription.
          </p>
          <ol className="pro-steps">
            {PRO_ACCESS.map((s) => (
              <li key={s.step} className="pro-step">
                <span className="pro-step__num" aria-hidden="true">{s.step}</span>
                <div>
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* ---- Sign up ----
            A real form now rather than a mailto. The mailto survives as the
            fallback in the form's own error state, so a failure still leaves a
            way through instead of a dead end.

            SHOWN TO EXISTING PRO CUSTOMERS TOO, with different copy. Site
            quota is a SEPARATE purchase that stacks (`pro_site_quota`, default
            0), so a subscriber wanting a second site has to ask for it — and
            hiding the only way to ask from the people most likely to buy would
            be an odd way to run a funnel. */}
        <section className="pro-signup" id="enquire" aria-labelledby="pro-signup-heading">
          <h2 id="pro-signup-heading">
            {alreadyPro ? 'Add another site' : 'Ask about Insights Pro'}
          </h2>
          <p className="pro-signup__lede">
            {alreadyPro ? (
              <>
                Sites are bought individually and stack, so tell us how many
                more you want and we will sort the rest.
              </>
            ) : (
              <>
                Tell us where you are and how many sites you would want to
                monitor, and we will come back to you with what it looks like.
              </>
            )}
            {isAuthenticated
              ? ' Your details are filled in from your account — change them if the enquiry is for somebody else.'
              : ''}
          </p>
          <ProEnquiryForm />
          <p className="pro-signup__alt">
            Curious how any of it is calculated first?{' '}
            <Link to="/about">Read the method</Link>.
          </p>
        </section>
      </main>

      <SiteFooter />
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        context="pro"
      />
    </div>
  );
}

export default Pro;
