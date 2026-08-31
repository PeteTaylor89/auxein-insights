// src/pages/AccountSite.jsx — one account site, by id.
//
// `MySite` is built around the SUBSCRIBER's own point: it places, renames,
// moves and deletes, and it reads the slot quota. None of that applies to a
// client's monitored network — nobody moves those sites and there is no quota
// to spend — so this is a read-only view of the same dashboard, addressed by
// id, which is what the portfolio table links to.
//
// The access check is the SERVER's. `_owned` in `api/v1/insights_sites.py`
// accepts a site the caller owns or one belonging to an account they are a
// named member of, and 404s otherwise. Nothing here re-derives that: a client
// check would be a second opinion that can disagree with the first.
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, MapPin, Loader, AlertTriangle } from 'lucide-react';
import SiteHeader from '../components/SiteHeader';
import SiteFooter from '../components/SiteFooter';
import SiteDashboard from '../components/pro/SiteDashboard';
import { getSite } from '../services/proSiteService';
import useDocumentMeta from '../hooks/useDocumentMeta';
import './Portfolio.css';

function AccountSite() {
  const { id } = useParams();
  const [site, setSite] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useDocumentMeta({ title: `${site?.label || 'Site'} · Auxein Insights` });

  useEffect(() => {
    let live = true;
    setLoading(true);
    getSite(id)
      .then((s) => { if (live) { setSite(s); setError(null); } })
      .catch((e) => {
        if (live) {
          // A 404 here means "not yours", not "does not exist" — the server
          // deliberately does not distinguish them, and neither does this.
          setError(e?.response?.status === 404
            ? 'That site is not on an account you belong to.'
            : 'Could not load this site.');
        }
      })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [id]);

  return (
    <>
      <SiteHeader />
      <main className="portfolio">
        <p className="portfolio__scope">
          <Link to="/pro/portfolio">
            <ArrowLeft size={13} aria-hidden="true" /> Back to the portfolio
          </Link>
        </p>

        {loading && (
          <p className="portfolio__loading">
            <Loader size={16} className="spin" aria-hidden="true" /> Loading…
          </p>
        )}

        {error && (
          <p className="portfolio__error">
            <AlertTriangle size={15} aria-hidden="true" /> {error}
          </p>
        )}

        {site && !loading && (
          <>
            <header className="portfolio__head">
              <div>
                <h1><MapPin size={18} aria-hidden="true" /> {site.label}</h1>
                <p className="portfolio__scope">
                  {site.latitude.toFixed(4)}, {site.longitude.toFixed(4)}
                  {site.zone_name && <> · {site.zone_name}</>}
                </p>
              </div>
            </header>
            {/* The same dashboard a subscriber sees on their own point. Every
                panel below already fetches by site id and every one of those
                endpoints now accepts an account member. */}
            <SiteDashboard siteId={site.id} />
          </>
        )}
      </main>
      <SiteFooter />
    </>
  );
}

export default AccountSite;
