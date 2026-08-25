// pages/RegionDetail.jsx — one region: the dashboard, or the full explorers.
//
// Phase 4 of docs/plans/COUNTRY_INDUSTRY_REGIONS_2026-08-24.md. The page used
// to be nothing but `PublicClimateContainer` — five heavyweight explorers
// behind a gate. It now leads with the regional dashboard, and the explorers
// are one click away.
//
// `?view=` STILL RENDERS THE EXPLORERS, and that is not a nicety. Those deep
// links are live in `ClimateZonePanel`, in article widgets and in email that
// has already been sent; Phase 2 carried them through the /regions redirect
// specifically so they would keep working. A link that used to open the
// phenology explorer must still open the phenology explorer.
//
// ENTITLEMENT: regional stats require an account (§5a). The gate wraps the
// DATA, not the PAGE. These are the strongest organic-search assets the site
// has — a visitor arriving from a search for "<region> climate" must land on
// real content, not a login wall, or the page is worth nothing and there is no
// reason to register. So the heading, the description and the region selector
// all render for everyone; only the numbers are gated.
import { useEffect, useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { ChevronLeft, Layers, LayoutDashboard } from 'lucide-react';
import SiteHeader from '../components/SiteHeader';
import SiteFooter from '../components/SiteFooter';
import AuthModal from '../components/auth/AuthModal';
import AccessGate from '../components/auth/AccessGate';
import IndustryPills from '../components/explore/IndustryPills';
import RegionSelect from '../components/explore/RegionSelect';
import RegionDashboard from '../components/explore/RegionDashboard';
import { PublicClimateContainer } from '../components/climate';
import { usePublicAuth } from '../contexts/PublicAuthContext';
import { useCountryIndustry } from '../contexts/CountryIndustryContext';
import { isRegistered } from '../utils/entitlements';
import useDocumentMeta from '../hooks/useDocumentMeta';
import { getZones } from '../services/publicClimateService';
import { getZonesWithData } from '../services/realtimeClimateService';
import '../components/explore/explore.css';
import './RegionDetail.css';

// Maps ?view= to PublicClimateContainer's internal view ids.
//
// The explorer lost current-season, phenology and disease on 2026-08-24 — they
// are on the overview now. Those three keys are DELIBERATELY still listed, and
// deliberately map to nothing: links carrying them are live in sent email, in
// `ClimateZonePanel` and in article widgets, and the right answer for
// `?view=phenology` is the overview page that contains phenology, not a 404 and
// not an empty explorer.
//
// Listing them explicitly rather than letting them fall through the default is
// the point: it records that they were real, and stops someone re-adding
// `phenology: 'phenology'` to a container that no longer has that view.
const RETIRED_VIEWS = new Set(['currentseason', 'phenology', 'disease']);

const VIEW_ALIASES = {
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
  const [searchParams] = useSearchParams();
  const { user, isAuthenticated } = usePublicAuth();
  const { country, industry, countryName, active, path } = useCountryIndustry();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authContext, setAuthContext] = useState('');
  const [zones, setZones] = useState([]);
  const [covered, setCovered] = useState(new Set());
  const [zonesLoading, setZonesLoading] = useState(true);

  // A `?view=` deep link opens the explorers; everything else gets the
  // dashboard. Read from `useSearchParams` rather than `window.location` so a
  // client-side navigation between the two actually re-renders.
  const requestedView = searchParams.get('view');
  // A retired view resolves to `undefined` here, which falls through to the
  // overview — where the thing it asked for now lives.
  const explorerView = RETIRED_VIEWS.has(requestedView)
    ? undefined
    : VIEW_ALIASES[requestedView];
  const showExplorers = Boolean(explorerView);

  // The zone's real name arrives with the dashboard payload; until then the
  // slug is title-cased so the heading and the document title are never empty.
  // This is also what a crawler sees if the data request fails.
  const zoneFromList = zones.find((z) => z.slug === slug);
  const name = zoneFromList?.name || titleCase(slug);

  useDocumentMeta({
    title: `${name} climate`,
    description:
      'Current season, phenology, disease pressure, climate history and ' +
      `projections for ${name}, ${countryName}.`,
    path: path(slug),
    noindex: !active,
  });

  useEffect(() => {
    let cancelled = false;
    setZonesLoading(true);
    // Scoped, like everything else on the page. An unscoped fetch would fill
    // the selector with New Zealand wine regions regardless of which scope the
    // URL is actually showing.
    Promise.all([
      getZones({ country, industry }),
      getZonesWithData({ country, industry }).catch(() => ({ zones: [] })),
    ])
      .then(([all, live]) => {
        if (cancelled) return;
        setZones(all?.zones || []);
        setCovered(new Set((live?.zones || []).map((z) => z.slug)));
      })
      .catch(() => { /* the selector degrades to a disabled control */ })
      .finally(() => { if (!cancelled) setZonesLoading(false); });
    return () => { cancelled = true; };
  }, [country, industry]);

  const openAuth = (context) => { setAuthContext(context); setAuthModalOpen(true); };

  // `user` is the source of truth; `isAuthenticated` is kept in sync with it by
  // the context and is used only as a fallback while the profile is loading.
  const registered = isRegistered(user) || isAuthenticated;

  return (
    <div className="region-detail-page">
      <SiteHeader onSignInClick={() => openAuth('region')} />

      <main className="explore-main">
        <Link to={path()} className="explore-back">
          <ChevronLeft size={17} aria-hidden="true" />
          All regions
        </Link>

        {/* Outside the gate on purpose — this is the indexable content. */}
        <header className="explore-head">
          <h1>{name} climate</h1>
          <p>
            Current season, phenology, disease pressure, climate history back to
            1986 and downscaled projections for {name}, built from {countryName}
            &rsquo;s regional weather station network.
          </p>
        </header>

        <div className="explore-controls">
          <IndustryPills />
          <RegionSelect
            zones={zones}
            covered={covered}
            currentSlug={slug}
            loading={zonesLoading}
          />
        </div>

        <AccessGate
          require="registration"
          allowed={registered}
          onAction={() => openAuth('region_data')}
          title={`See the ${name} climate record`}
          preview={GATE_PREVIEW}
        >
          {showExplorers ? (
            <>
              <Link to={path(slug)} className="explore-full">
                <LayoutDashboard size={16} aria-hidden="true" />
                Back to the {name} overview
              </Link>
              <PublicClimateContainer
                initialView={explorerView}
                initialZoneSlug={slug}
                demoMode={false}
                onAuthRequired={() => openAuth('demo_upgrade')}
              />
            </>
          ) : (
            <>
              <RegionDashboard
                slug={slug}
                onSignInRequired={() => openAuth('region')}
              />
              {/* The explorers are not retired — they are the browsing tool
                  behind the overview, and every existing ?view= link still
                  lands in them directly. */}
              <p className="block__note">
                <Link to={`${path(slug)}?view=seasons`} className="explore-full">
                  <Layers size={16} aria-hidden="true" />
                  Open the full climate explorers
                </Link>
              </p>
            </>
          )}
        </AccessGate>
      </main>

      <SiteFooter />
      <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} context={authContext} />
    </div>
  );
}

export default RegionDetail;
