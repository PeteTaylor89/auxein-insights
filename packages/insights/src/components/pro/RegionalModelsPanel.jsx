// components/pro/RegionalModelsPanel.jsx — phenology and disease, at the region.
//
// Both models are REAL and already running per zone: phenology for the coming
// vintage across nine varieties, and three disease models (UC Davis powdery,
// González-Domínguez botrytis, 3-10 plus Goidanich downy). Neither is
// downscaled to a cell, so both are badged regional and neither is presented as
// a site-level product.
//
// THE REGION PAGES' EXPLORERS ARE NOT REUSED HERE. `PhenologyExplorer` and
// `DiseasePressureExplorer` are browsing tools — expandable varieties, a
// timeline, a 14-day chart, six harvest targets — and on a site dashboard that
// is a wall of detail in a visual idiom that is not this page's. `PhenologyPanel`
// and `DiseasePanel` render the same models compactly and in the Pro style. The
// region pages keep their explorers unchanged.
//
// Everything both panels draw arrives in the dashboard payload, already
// resolved: coverage per model, and — critically — which phenology dates are fit
// to show. See `insights_dashboard._phenology_varieties`.
import { useEffect, useState } from 'react';
import { Info } from 'lucide-react';
import { getSitePhenology } from '../../services/proSiteService';
import PhenologyPanel from './PhenologyPanel';
import DiseasePanel from './DiseasePanel';
import './RegionalModelsPanel.css';

function Block({ title, note, available, reason, children }) {
  return (
    <section className="regional-models__block">
      <header className="regional-models__block-head">
        <h4>{title}</h4>
        {note && <p className="regional-models__note">{note}</p>}
      </header>
      {available ? children : (
        <p className="regional-models__absent">
          <Info size={15} aria-hidden="true" /> {reason}
        </p>
      )}
    </section>
  );
}

function RegionalModelsPanel({ models, siteId }) {
  // PHENOLOGY IS NOW COMPUTED AT THE POINT, and this fetches it.
  //
  // `models.phenology` is the ZONE's estimates, read through `site.zone_id`.
  // The panel rendered them under a site heading, so a subscriber's own point
  // showed their region's flowering and harvest dates while looking
  // site-specific. `insights_site_phenology` runs the same model on the site's
  // own accumulation against its own 1986-2005 baseline.
  //
  // The regional payload is kept as the FALLBACK rather than deleted: a site
  // with no daily record yet — placed today, or before 1 September — has no
  // point estimate, and a region's dates clearly labelled as a region's are
  // better than an empty block. Which one is showing is stated in the note.
  const [sitePhen, setSitePhen] = useState(null);

  useEffect(() => {
    if (!siteId) return undefined;
    let live = true;
    getSitePhenology(siteId)
      .then((d) => { if (live) setSitePhen(d?.available ? d : null); })
      // A failure here falls back to the regional block rather than blanking
      // it. This is a comparison, not the page's reason for existing.
      .catch(() => { if (live) setSitePhen(null); });
    return () => { live = false; };
  }, [siteId]);

  if (!models) return null;

  const { phenology = {}, disease = {} } = models;

  // Nothing to show and nothing to explain beyond one sentence — a site outside
  // every mapped region gets a single line rather than two empty blocks.
  if (!models.zone_id) {
    return (
      <section className="regional-models" aria-labelledby="models-heading">
        <h3 id="models-heading">Vineyard models</h3>
        <p className="regional-models__absent">
          <Info size={15} aria-hidden="true" /> {phenology.reason}
        </p>
      </section>
    );
  }

  // True in May and June, when the phenology model's July-June vintage and this
  // page's Sep-Apr season name different years. Saying which season the model
  // is describing beats letting it inherit the heading at the top of the page.
  const vintageNote = phenology.vintage_differs_from_page
    ? `Reporting the ${phenology.vintage_year} season, which has finished.`
    : null;

  return (
    <section className="regional-models" aria-labelledby="models-heading">
      <header className="regional-models__head">
        <h3 id="models-heading">Vineyard models</h3>
        <p className="regional-models__scope">
          {models.zone_name} · {models.disclaimer}
        </p>
      </header>

      <Block
        title={sitePhen ? 'Phenology at this site' : 'Phenology'}
        note={sitePhen
          ? ['Modelled at this site, against its own 1986-2005 baseline. '
             + 'The smaller date under each is the surrounding region.',
             vintageNote].filter(Boolean).join(' ')
          : vintageNote}
        available={sitePhen ? true : phenology.available}
        reason={phenology.reason}
      >
        <PhenologyPanel phenology={sitePhen || phenology} />
      </Block>

      <Block
        title="Disease pressure"
        available={disease.available}
        reason={disease.reason}
      >
        <DiseasePanel disease={disease} zoneSlug={models.zone_slug} />
      </Block>
    </section>
  );
}

export default RegionalModelsPanel;
