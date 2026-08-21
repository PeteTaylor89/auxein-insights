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
import { Info } from 'lucide-react';
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

function RegionalModelsPanel({ models }) {
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
        title="Phenology"
        note={vintageNote}
        available={phenology.available}
        reason={phenology.reason}
      >
        <PhenologyPanel phenology={phenology} />
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
