// pages/RegionDetail.jsx — one region, all five views, one navigator.
//
// The destination of "Select your wine region", and the home of the five
// explorers that used to live in the landing page's tab strip.
// `PublicClimateContainer` is already that navigator, so this page is wiring
// rather than a rebuild — which also means the explorers keep working unchanged
// while the data underneath them is still the zone-aggregation path
// (2026-08-13 D-B: freeze, then migrate per widget type).
//
// ENTITLEMENT: regional stats require an account (§5a). The gate wraps the
// DATA, not the PAGE. These are the strongest organic-search assets the site
// has — a crawler or a visitor arriving from a search for "<region> climate"
// must land on real content, not a login wall, or the page is worth nothing and
// there is no reason to register. So the heading, the description and the
// industry coverage all render for everyone; only the numbers are gated.
import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import SiteHeader from '../components/SiteHeader';
import SiteFooter from '../components/SiteFooter';
import AuthModal from '../components/auth/AuthModal';
import AccessGate from '../components/auth/AccessGate';
import IndustryChips from '../components/home/IndustryChips';
import { PublicClimateContainer } from '../components/climate';
import { usePublicAuth } from '../contexts/PublicAuthContext';
import { isRegistered } from '../utils/entitlements';
import useDocumentMeta from '../hooks/useDocumentMeta';
import './RegionDetail.css';

// Maps ?view= to PublicClimateContainer's internal view ids. Kept identical to
// the vocabulary the old landing-page deep links used, so existing
// `/?view=phenology&zone=x` links keep meaning the same thing.
const VIEW_ALIASES = {
  currentseason: 'currentseason',
  phenology: 'phenology',
  disease: 'disease',
  climatehistory: 'seasons',
  seasons: 'seasons',
  climateprojections: 'projections',
  projections: 'projections',
};

const GATE_PREVIEW = [
  'Current season tracking against the long-run normal',
  'Phenology and disease pressure',
  'Climate history back to 1986',
  'Downscaled climate projections',
];

function titleCase(slug = '') {
  return slug.split('-').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

function RegionDetail() {
  const { slug } = useParams();
  const { user, isAuthenticated } = usePublicAuth();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authContext, setAuthContext] = useState('');

  const params = new URLSearchParams(window.location.search);
  const initialView = VIEW_ALIASES[params.get('view')] || 'currentseason';
  const name = titleCase(slug);

  // `user` is the source of truth; `isAuthenticated` is kept in sync with it by
  // the context and is used only as a fallback while the profile is loading.
  const registered = isRegistered(user) || isAuthenticated;

  useDocumentMeta({
    title: `${name} climate`,
    description:
      `Current season, phenology, disease pressure, climate history and projections for ${name}, New Zealand.`,
    path: `/regions/${slug}`,
  });

  const openAuth = (context) => { setAuthContext(context); setAuthModalOpen(true); };

  return (
    <div className="region-detail-page">
      <SiteHeader
        onSignInClick={() => openAuth('region')}
      />

      <main className="region-detail-main">
        <Link to="/regions" className="region-detail__back">
          <ChevronLeft size={17} aria-hidden="true" />
          All regions
        </Link>

        {/* Outside the gate on purpose — this is the indexable content. */}
        <header className="region-detail__intro">
          <h1>{name} climate</h1>
          <p>
            Current season, phenology, disease pressure, climate history back to
            1986 and downscaled projections for {name}, built from New Zealand&rsquo;s
            regional weather station network.
          </p>
        </header>

        <AccessGate
          require="registration"
          allowed={registered}
          onAction={() => openAuth('region_data')}
          title={`See the ${name} climate record`}
          preview={GATE_PREVIEW}
        >
          <PublicClimateContainer
            initialView={initialView}
            initialZoneSlug={slug}
            demoMode={false}
            onAuthRequired={() => openAuth('demo_upgrade')}
          />
        </AccessGate>

        <div className="region-detail__industries">
          <IndustryChips
            variant="labelled"
            showNote={false}
            heading={`Industries covered in ${name}`}
          />
        </div>
      </main>

      <SiteFooter />
      <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} context={authContext} />
    </div>
  );
}

export default RegionDetail;
