// pages/MySite.jsx — the Pro product: your point, read against its region.
//
// Four states, and the honesty of the middle two is most of the work:
//
//   not entitled   show what it is and what it costs. No teasing chart.
//   empty slot     place a point, with the quota stated BEFORE it is spent.
//   populating     say what is happening and roughly how long. Never a bare
//                  spinner — the extraction takes minutes and a spinner that
//                  long reads as broken.
//   ready          the charts.
//
// The quota line is deliberately visible in every state, not only on refusal.
// "One point per subscription" discovered at the moment of refusal reads as a
// bait-and-switch; stated up front it reads as the pricing model it is.
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MapPin, Loader, AlertTriangle, Sparkles, Trash2 } from 'lucide-react';
import SiteHeader from '../components/SiteHeader';
import SiteFooter from '../components/SiteFooter';
import AuthModal from '../components/auth/AuthModal';
import AccessGate from '../components/auth/AccessGate';
import SitePlacementMap from '../components/pro/SitePlacementMap';
import SiteDashboard from '../components/pro/SiteDashboard';
import SiteSeasonChart from '../components/pro/SiteSeasonChart';
import SiteMonthlyChart from '../components/pro/SiteMonthlyChart';
import useProSites from '../hooks/useProSites';
import { usePublicAuth } from '../contexts/PublicAuthContext';
import { isPro } from '../utils/entitlements';
import useDocumentMeta from '../hooks/useDocumentMeta';
import {
  placeSite, deleteSite, getSiteSeason, getSiteMonthly, refusalOf,
  SITE_METRICS,
} from '../services/proSiteService';
import './MySite.css';
import { useCountryIndustry } from '../contexts/CountryIndustryContext';

const PRO_PREVIEW = [
  'Your own point, sampled from the 500 m climate surface',
  'This season tracked day by day against your site’s own record',
  'Every season back to 1986, against your site’s own normal',
  'Your site measured against the spread of vineyards around it',
  'Month-by-month anomalies you can act on',
];

function MySite() {
  // Region links carry the current (country, industry) scope. Outside a
  // scoped route this falls back to the visitor's last scope, then to
  // New Zealand wine — so no link has to bounce through the /regions redirect.
  const { path } = useCountryIndustry();

  const navigate = useNavigate();
  const { user, isAuthenticated } = usePublicAuth();
  const pro = isPro(user);

  const [authOpen, setAuthOpen] = useState(false);
  const [picked, setPicked] = useState(null);
  const [label, setLabel] = useState('');
  const [refusal, setRefusal] = useState(null);
  const [placing, setPlacing] = useState(false);

  const { sites, quota, loading, populating, stalled, canPlace, refresh } =
    useProSites({ enabled: pro });

  const site = sites[0] || null;
  const [season, setSeason] = useState(null);
  const [monthly, setMonthly] = useState(null);
  const [metric, setMetric] = useState('gdd10');
  const [variable, setVariable] = useState('temp_mean');

  useDocumentMeta({
    title: 'Your site',
    description: 'Your vineyard site, measured against its region.',
    path: '/my-site',
    // Every subscriber's page is the same URL with different private data
    // behind it. There is nothing here for a crawler and indexing it would put
    // an empty shell in the results.
    robots: 'noindex',
  });

  const ready = site?.status === 'ready';

  useEffect(() => {
    if (!ready) { setSeason(null); setMonthly(null); return; }
    let live = true;
    getSiteSeason(site.id).then((d) => live && setSeason(d)).catch(() => {});
    return () => { live = false; };
  }, [ready, site?.id]);

  useEffect(() => {
    if (!ready) return undefined;
    let live = true;
    const statistic = variable === 'rainfall' ? 'sum' : 'mean';
    getSiteMonthly(site.id, { variable, statistic })
      .then((d) => live && setMonthly(d)).catch(() => {});
    return () => { live = false; };
  }, [ready, site?.id, variable]);

  const submit = useCallback(async () => {
    if (!picked) return;
    setPlacing(true);
    setRefusal(null);
    try {
      await placeSite({ ...picked, label: label.trim() || null });
      await refresh();
      setPicked(null);
      setLabel('');
    } catch (err) {
      setRefusal(refusalOf(err));
    } finally {
      setPlacing(false);
    }
  }, [picked, label, refresh]);

  const useNearestLand = useCallback(() => {
    const near = refusal?.nearestLand;
    if (!near) return;
    setPicked({ latitude: near.lat, longitude: near.lon });
    setRefusal(null);
  }, [refusal]);

  const remove = useCallback(async () => {
    if (!site) return;
    await deleteSite(site.id);
    await refresh();
  }, [site, refresh]);

  const seriesFor = (key) => season?.series?.find((s) => s.metric === key) || null;

  return (
    <div className="my-site-page">
      <SiteHeader onSignInClick={() => setAuthOpen(true)} />

      <main className="my-site-main">
        <header className="my-site__intro">
          <h1>Your site</h1>
          <p>
            One point, sampled from the same 500 m climate surface the Atlas
            draws, and read against the vineyards around it.
          </p>
        </header>

        <AccessGate
          require="pro"
          allowed={pro}
          cta={isAuthenticated ? 'See what Pro adds' : 'Sign in or register free'}
          // A signed-in free user used to get a button that did NOTHING, then
          // for a day got a raw mailto. Neither was a good answer to "what am
          // I being asked to buy?" — /pro exists now, so the button explains
          // the product first and the enquiry sits at the end of that page.
          // There is still no self-serve purchase; access is arranged and
          // invoiced through Xero.
          onAction={() => {
            if (!isAuthenticated) { setAuthOpen(true); return; }
            navigate('/pro');
          }}
          title="Put your own site on the map"
          preview={PRO_PREVIEW}
        >
          {loading ? (
            <p className="my-site__loading"><Loader size={16} className="spin" /> Loading…</p>
          ) : !site ? (
            <section className="my-site__place">
              {quota && (
                <p className="my-site__quota">
                  Your subscription covers <strong>{quota.entitled}</strong>{' '}
                  site{quota.entitled === 1 ? '' : 's'}
                  {quota.used > 0 && <> · {quota.used} in use</>}.
                  {' '}{quota.note}
                </p>
              )}

              <SitePlacementMap initial={picked} onPick={setPicked} />

              <div className="my-site__form">
                <label className="my-site__field">
                  <span>Name this site</span>
                  <input
                    type="text"
                    maxLength={80}
                    value={label}
                    placeholder="Home block"
                    onChange={(e) => setLabel(e.target.value)}
                  />
                </label>
                <p className="my-site__coords">
                  {picked
                    ? <><MapPin size={14} aria-hidden="true" /> {picked.latitude.toFixed(4)}, {picked.longitude.toFixed(4)}</>
                    : 'No point chosen yet.'}
                </p>
                <button
                  type="button"
                  className="my-site__cta"
                  disabled={!picked || placing || !canPlace}
                  onClick={submit}
                >
                  {placing ? 'Setting up…' : 'Use this point'}
                </button>
              </div>

              {refusal && (
                <div className="my-site__refusal" role="alert">
                  <AlertTriangle size={16} aria-hidden="true" />
                  <div>
                    <p>{refusal.message}</p>
                    {/* The commercially important case: a coastal block whose
                        cell centre is water. Offering the nearest land cell
                        turns a dead end into one tap. */}
                    {refusal.nearestLand && (
                      <button type="button" className="my-site__link"
                              onClick={useNearestLand}>
                        Use the nearest land cell instead
                        ({refusal.nearestLand.cells_away === 1
                          ? '500 m away'
                          : `${refusal.nearestLand.cells_away * 500} m away`})
                      </button>
                    )}
                  </div>
                </div>
              )}
            </section>
          ) : site.status === 'failed' ? (
            <div className="my-site__refusal" role="alert">
              <AlertTriangle size={16} aria-hidden="true" />
              <div>
                <p>We could not build the record for this site.</p>
                <p className="my-site__detail">{site.status_detail}</p>
                <button type="button" className="my-site__link" onClick={remove}>
                  Remove it and try another point
                </button>
              </div>
            </div>
          ) : site.status === 'populating' ? (
            <section className="my-site__waiting">
              <Loader size={22} className="spin" aria-hidden="true" />
              <h2>Building the climate history for {site.label || 'your site'}</h2>
              <p>
                We&rsquo;re reading every month from 1986 to 2023 at your point
                and working out its own normals. It usually takes a few minutes
                — you can leave this page and come back.
              </p>
              {stalled && (
                // Never let a dead job read as "nearly done".
                <p className="my-site__stalled">
                  This is taking longer than it should. It is still queued, but
                  if it has not finished within the hour please let us know.
                </p>
              )}
            </section>
          ) : (
            <section className="my-site__ready">
              <div className="my-site__summary">
                <h2>
                  <MapPin size={18} aria-hidden="true" />
                  {site.label || 'Your site'}
                </h2>
                <p>
                  {site.latitude.toFixed(4)}, {site.longitude.toFixed(4)}
                  {site.zone_slug && (
                    <> · compared against{' '}
                      <Link to={path(site.zone_slug)}>{site.zone_name}</Link>
                    </>
                  )}
                </p>
                <button type="button" className="my-site__remove" onClick={remove}>
                  <Trash2 size={14} aria-hidden="true" /> Remove
                </button>
              </div>

              {/* The summary first: what this site usually does, and what
                  this season has done. The charts below are for reading the
                  detail once a number on a tile has raised a question. */}
              <SiteDashboard siteId={site.id} />

              <div className="my-site__panel">
                <h3>Season by season</h3>
                <div className="my-site__chips" role="group" aria-label="Metric">
                  {SITE_METRICS.filter((m) => seriesFor(m.key)).map((m) => (
                    <button
                      key={m.key}
                      type="button"
                      className={`my-site__chip${m.key === metric ? ' is-active' : ''}`}
                      onClick={() => setMetric(m.key)}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
                {season ? (
                  <SiteSeasonChart
                    series={seriesFor(metric)}
                    siteLabel={site.label || 'Your site'}
                    zoneName={site.zone_name}
                  />
                ) : (
                  <p className="my-site__loading"><Loader size={16} className="spin" /> Loading…</p>
                )}
              </div>

              <div className="my-site__panel">
                <h3>Month by month</h3>
                <div className="my-site__chips" role="group" aria-label="Variable">
                  {[['temp_mean', 'Temperature'], ['rainfall', 'Rainfall']].map(([v, l]) => (
                    <button
                      key={v}
                      type="button"
                      className={`my-site__chip${v === variable ? ' is-active' : ''}`}
                      onClick={() => setVariable(v)}
                    >
                      {l}
                    </button>
                  ))}
                </div>
                {monthly ? <SiteMonthlyChart payload={monthly} /> : (
                  <p className="my-site__loading"><Loader size={16} className="spin" /> Loading…</p>
                )}
              </div>

              {season?.meta?.omitted?.length > 0 && (
                // Say what is NOT here. A silently missing metric looks like
                // the data is thin; a stated omission with a reason does not.
                <p className="my-site__omitted">
                  Not shown for a single site yet: {season.meta.omitted.join(', ')}.
                  {' '}{season.meta.omitted_reason}
                </p>
              )}
            </section>
          )}
        </AccessGate>
      </main>

      <SiteFooter />
      <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} context="pro_site" />
    </div>
  );
}

export default MySite;
