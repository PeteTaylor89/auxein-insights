// components/home/ProTeaser.jsx — the Pro entry point in the home hero.
//
// Sits under the compact NationalPulse in the hero's middle column, so the row reads as a
// pair of doors: the free regional product on the left, the paid per-site one
// on the right, against the national map. Before this, /pro was reachable only
// from the nav and from a gate someone had to hit first — the home page never
// said Pro existed.
//
// The card is deliberately the same shape as the region map card (same border,
// radius and padding) and differs only in accent. They are alternatives, not a
// primary and a secondary.
//
// ENTITLEMENT: `user.is_pro` is server-computed and covers BOTH ways of
// holding Pro. Never test `subscription_tier === 'pro'` here — Grow users
// carry tier 'grow' and are fully entitled, so that comparison would show an
// existing customer an advert for what they already have. Same rule as
// Pro.jsx and backend/core/entitlements.py.
//
// No price appears here for the same reason it does not appear on /pro: the
// server owns pricing and nothing is committed on a public page.
import { Link } from 'react-router-dom';
import { Sparkles, ArrowRight, MapPin } from 'lucide-react';
import { usePublicAuth } from '../../contexts/PublicAuthContext';
import './ProTeaser.css';

function ProTeaser() {
  const { user, isAuthenticated } = usePublicAuth();
  const alreadyPro = isAuthenticated && user?.is_pro;

  return (
    <section className="pro-teaser" aria-labelledby="pro-teaser-heading">
      <p className="pro-teaser__eyebrow">
        <Sparkles size={13} aria-hidden="true" />
        Insights Pro
      </p>

      <h2 id="pro-teaser-heading" className="pro-teaser__heading">
        Your site, not your region
      </h2>

      <p className="pro-teaser__blurb">
        Place one point on your vineyard and Pro resolves the climate surface to
        that cell — its own record back to 1986, its own normal, and how it sits
        against the vineyards around it.
      </p>

      {alreadyPro ? (
        // An existing subscriber on the home page should be sent to their
        // site, not to a sales page.
        <Link to="/my-site" className="pro-teaser__cta">
          <MapPin size={17} aria-hidden="true" />
          <span>Go to My Site</span>
          <ArrowRight size={16} aria-hidden="true" className="pro-teaser__cta-arrow" />
        </Link>
      ) : (
        <Link to="/pro" className="pro-teaser__cta">
          <Sparkles size={17} aria-hidden="true" />
          <span>See what Pro adds</span>
          <ArrowRight size={16} aria-hidden="true" className="pro-teaser__cta-arrow" />
        </Link>
      )}
    </section>
  );
}

export default ProTeaser;
