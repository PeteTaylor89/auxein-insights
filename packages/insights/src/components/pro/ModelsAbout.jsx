// src/components/pro/ModelsAbout.jsx
//
// What is behind every number on the portfolio: the model, its equation, its
// parameters, its source, and what it cannot do.
//
// THE LIMITS ARE NOT A DISCLAIMER SECTION. Each model carries its own, next to
// its equation, because that is where they are actionable — "the Bacchus 1/I
// assembly is an inference" matters to someone reading a Bacchus number and to
// nobody else. A single block of caveats at the end is a block nobody reads.
//
// Every figure quoted here is sourced from the implementation it describes or
// from the paper named beside it. Nothing is rounded for tidiness and nothing
// is asserted that the code does not do.

import { useEffect, useRef, useState } from 'react';
import './ModelsAbout.css';

const MODELS = [
  {
    id: 'surfaces',
    group: 'Climate',
    name: 'Climate surfaces',
    question: 'What was the weather at this point, on a day with no station here?',
    body: [
      'Every temperature and rainfall figure on this page is interpolated to a 500 m grid, not measured at the site. The engine is a thin-plate smoothing spline fitted in kilometres with a ridge penalty, smoothing chosen by generalised cross-validation with a guarded fallback that re-selects at γ = 1.2 when the effective degrees of freedom exceed 80% of the station count.',
      'Elevation is handled by detrending before the fit and retrending after, not as a third spline dimension. That was measured, not assumed: a naive trivariate fit was worse on all 15 benchmark dates, 1.47 against 1.27 °C.',
    ],
    facts: [
      ['Grid', '500 m'],
      ['Median cross-validated RMSE', '1.106 °C'],
      ['Daily surfaces', 'fitted per day, re-fitted D-9 to D-3 weekly'],
    ],
    limits: 'A cross-validated RMSE of about 1 °C is the floor under every model below. Nothing downstream can be more precise than its input, which is why no figure in this product is published to more than two decimal places.',
  },
  {
    id: 'gdd',
    group: 'Climate',
    name: 'Growing degree days',
    question: 'How much heat has this season delivered?',
    body: [
      'Two different accumulations share the name, and they are not interchangeable. The GDD column on this table is base 10, which is the convention growers plan against. The phenology thresholds below are base 0, because that is the base they were calibrated on.',
      'Both accumulate from 1 September, the same gate the season columns use, so a portfolio total and a site page cannot disagree about which days counted.',
    ],
    facts: [
      ['Season column', 'base 10, from 1 September'],
      ['Phenology thresholds', 'base 0, from 1 September'],
      ['Harvest thresholds', 'base 0, from 1 October'],
    ],
    limits: 'A base-10 number and a base-0 number are never comparable. If you export both, the column names are the only thing telling them apart.',
  },
  {
    id: 'budburst',
    group: 'Phenology',
    name: 'Budburst',
    sub: 'chilling–forcing',
    question: 'When will the buds break?',
    body: [
      'A degree-day threshold cannot model budburst, because it has no way to know when dormancy broke. This model does it in four steps, and the order is the point.',
      'Endo-dormancy opens when daylength falls below the critical photoperiod. Chilling then accumulates as a decreasing sigmoid of hourly temperature until the requirement C* is met. Only then does forcing accumulate, as degree-days above a cultivar base, until F* is reached.',
    ],
    equations: [
      ['1 · trigger', 'daylength < 13.14 h  (geometric horizon)'],
      ['2 · chilling', 'Rc(T) = 1 / (1 + e^(−(T − Xo) / b))'],
      ['3 · release', 'Σ Rc ≥ C*'],
      ['4 · forcing', 'Rf(T) = max(0, T − Tb),   budburst at Σ Rf ≥ F*'],
    ],
    note: 'Both responses are evaluated hourly and averaged over the day, not applied to the daily mean — both are non-linear in temperature, so the two are not the same thing. Hourly temperature is interpolated from the daily minimum and maximum; it is not an input.',
    table: {
      head: ['Cultivar', 'C*', 'Xo', 'b', 'F*', 'Tb'],
      rows: [
        ['Sauvignon blanc', '52.60', '12.42', '−3.865', '1011.0', '0.008'],
        ['Chardonnay', '52.06', '10.98', '−25.56', '906.4', '0.277'],
        ['Pinot noir', '72.10', '7.95', '−45.31', '627.0', '0.244'],
        ['Pinot gris', '74.16', '12.53', '−66.51', '519.2', '1.935'],
        ['Merlot / Syrah', '88.74', '15.08', '−1.276', '767.6', '0.353'],
      ],
    },
    facts: [
      ['Validation RMSE, Sauvignon blanc', '4.9 days'],
      ['Validation RMSE, other four cultivars', '6.5 days'],
      ['Calibration', 'Marlborough 2004–2020, validated across five NZ regions'],
      ['Cultivars carried', 'Sauvignon blanc, Chardonnay, Pinot noir, Pinot gris, Merlot, Syrah'],
      ['Not carried', 'Cabernet franc, Cabernet Sauvignon, Grenache, Riesling'],
    ],
    refs: [
      'Chuine, I. (2000). A unified model for budburst of trees.',
      'Zhu, J., Parker, A., Gou, F., Agnew, R., et al. (2021). Developing perennial fruit crop models in APSIM Next Generation using grapevine as an example. in silico Plants 3(2), diab021.',
      'Leolini, L., et al. (2020). Phenological model intercomparison for estimating grapevine budbreak date in Europe. Applied Sciences 10(11), 3800.',
      'Parameters: APSIM Next Generation, Models/Resources/Grapevine.json.',
    ],
    limits: 'The date is an extrapolation, not a forecast — there is no forecast input, so a warm spell registers the day after it happens. The progress bar on each row is how far through the forcing requirement that site is: a date projected from 45% is a forty-day extrapolation on a fortnight’s rate, and a date projected from 90% is nearly arithmetic. The diurnal curve here is a plain sine; APSIM uses a photoperiod-adjusted one, and that difference is the model’s known residual.',
  },
  {
    id: 'stages',
    group: 'Phenology',
    name: 'Flowering, véraison and harvest',
    sub: 'GDD thresholds',
    question: 'When does the rest of the season arrive?',
    body: [
      'Each stage is a base-0 degree-day total per variety, loaded from a calibration table rather than computed here. Flowering and véraison accumulate from 1 September; the harvest thresholds accumulate from 1 October and are indexed by target sugar, from 170 to 220 g/L.',
      'A projected date is the remaining degree-days divided by the site’s own trailing 14-day rate — the same window the budburst projection uses, so the dates on one row are consistent with each other.',
    ],
    note: 'The two phenology models are calibrated on different variety sets, and neither covers all ten. Pinot gris is the one variety with a budburst calibration and no stage thresholds — a Pinot gris site can show a budburst date and will show nothing for flowering, véraison or harvest. Cabernet franc, Cabernet Sauvignon, Grenache and Riesling are the reverse. A blank is a variety this model was never fitted for, not a missing measurement.',
    table: {
      head: ['Variety', 'Flowering · véraison · harvest', 'Budburst'],
      rows: [
        ['Sauvignon blanc', 'yes', 'yes'],
        ['Chardonnay', 'yes', 'yes'],
        ['Pinot noir', 'yes', 'yes'],
        ['Merlot', 'yes', 'yes'],
        ['Syrah', 'yes', 'yes'],
        ['Pinot gris', '— not calibrated', 'yes'],
        ['Cabernet franc', 'yes', '— not calibrated'],
        ['Cabernet Sauvignon', 'yes', '— not calibrated'],
        ['Grenache', 'yes', '— not calibrated'],
        ['Riesling', 'yes', '— not calibrated'],
      ],
    },
    limits: 'A projection made before the season has accumulated anything is meaningless: dividing a full threshold by a summer rate returns a confident date eight months out. Dates are withheld until the accumulation is large enough to divide, and the row shows the stage and the accumulation instead.',
  },
  {
    id: 'powdery',
    group: 'Disease',
    name: 'Powdery mildew',
    sub: 'Gubler–Thomas / UC Davis',
    question: 'Is it warm enough, for long enough, for Erysiphe necator?',
    body: [
      'An hourly temperature index. Hours in the favourable band earn points, hours in the optimal band earn more, and hours above the lethal threshold subtract. The running index decays each day, so pressure built in one warm week does not persist indefinitely.',
    ],
    facts: [
      ['Favourable', '21–30 °C, 20/6 ≈ 3.3 points per hour'],
      ['Optimal', '24–27 °C, 20/4 = 5 points per hour'],
      ['Lethal', '≥ 35 °C, −10 points per hour'],
      ['Daily decay', '0.9'],
      ['Minimum data', '12 valid hours, or the day scores unknown'],
    ],
    refs: ['Gubler, W. D., et al. (1999). UC Davis powdery mildew risk index.'],
    limits: 'Temperature only. A day with the right temperatures and no inoculum scores the same as one with both.',
  },
  {
    id: 'botrytis-gd',
    group: 'Disease',
    name: 'Botrytis',
    sub: 'González-Domínguez',
    question: 'How favourable are conditions for Botrytis cinerea infection?',
    body: [
      'A temperature and wetness model scaled by how susceptible the crop is at its current growth stage. Susceptibility is not flat across the season: flowering and ripening are the exposed windows.',
    ],
    facts: [
      ['Cardinal temperatures', '5 / 15 / 25 / 30 °C'],
      ['Stage factor', 'dormant 0.0 · budburst 0.1 · pre-flowering 0.3 · flowering 0.8 · fruit set 0.5 · véraison 0.6 · ripening 1.0 · harvest 0.9'],
      ['Unrecognised stage', '0.5'],
    ],
    refs: ['González-Domínguez, E., et al. (2015). A mechanistic model of Botrytis cinerea on grapevines.'],
    limits: 'The severity band and the cumulative index are two different quantities and are reported under two different names. A band read against the wrong number is the failure this product has spent the most effort avoiding.',
  },
  {
    id: 'bacchus',
    group: 'Disease',
    name: 'Botrytis',
    sub: 'Bacchus',
    question: 'Has a wet period lasted long enough, at the right temperature, to infect?',
    body: [
      'A wet-period model rather than a daily one. I(T) is the number of wet hours required for infection at temperature T, so each wet hour contributes 1/I(T) and the period accumulates toward 1.0. Four consecutive dry hours reset it.',
      'The parabola bottoms out at 13.8 hours at 19.5 °C, rising to 30.5 hours at 10 °C and 34.3 hours at 30 °C.',
    ],
    equations: [
      ['index', 'I = 84.37 − 7.238·T + 0.1856·T²   (T = mean air temperature during a wet hour)'],
      ['accumulation', 'each wet hour adds 1/I;  infection at Σ ≥ 1.0;  reset after 4 dry hours'],
    ],
    refs: ['Balasubramaniam, R., & Edwards, J. Bacchus Botrytis cinerea risk index. Developed in New Zealand, evaluated by HortResearch, distributed in MetWatch (HortPlus).'],
    limits: 'The equation, the threshold and the reset are published by the source. That each wet hour contributes 1/I is our reading of it, not a statement the source makes — the shape and the magnitude both support it, and it is the only reading under which a threshold of exactly 1.0 means anything, but it is an inference. The parabola also has no real roots, so it returns a positive requirement at any temperature and imposes no lower bound; Botrytis is near-inactive at freezing and the model does not know that.',
  },
  {
    id: 'downy',
    group: 'Disease',
    name: 'Downy mildew',
    sub: '3-10 rule + Goidanich',
    question: 'Have primary infection conditions been met, and are secondary cycles running?',
    body: [
      'Two parts. The 3-10 rule gates primary infection on a 48-hour window; the Goidanich index then accumulates secondary cycles on temperature and humidity.',
    ],
    facts: [
      ['Primary, over 48 h', 'minimum temperature ≥ 10 °C, ≥ 10 mm rain, ≥ 10 wet hours'],
      ['Secondary cardinals', '13 / 18 / 23 / 28 °C'],
      ['Secondary humidity', 'RH ≥ 80%'],
    ],
    limits: 'Rainfall is the weakest input in the whole product. Convective rain is cellular — a gauge can record 40 mm while one 12 km away records nothing — so an interpolated rainfall figure at a point is less reliable than an interpolated temperature.',
  },
  {
    id: 'wetness',
    group: 'Inputs',
    name: 'Leaf wetness',
    question: 'Was the canopy wet, at a site with no wetness sensor?',
    body: [
      'No station in the network measures leaf wetness, so every disease model above runs on an estimate. It is the maximum of four probabilities: that it is raining, that rain has recently stopped and not yet dried, a relative-humidity ladder, and dewpoint depression.',
    ],
    limits: 'Humidity coverage is the binding constraint, not the algorithm. A score computed without humidity is a weaker claim than one computed with it, and the row says which — it is never presented as the same number.',
  },
  {
    id: 'withheld',
    group: 'Inputs',
    name: 'What is deliberately not here',
    question: 'Which numbers are we choosing not to publish?',
    body: [
      'Frost. Every frost metric — annual, spring, and the last-spring-frost date — is withheld. The count is thresholded off a lapse-retrended minimum-temperature field, and on frost nights the atmosphere inverts: cold air drains to the valley floor, so the lapse is wrong in sign for exactly the nights that make the count. Measured against stations in Marlborough it loaded frost onto the tops and erased it from the valley floors, which is where the vines are. No frost figure is published anywhere until the interpolator is fixed.',
      'Measured evapotranspiration. The platform holds none that is usable, so every ET figure is modelled — FAO-56 Penman-Monteith where the nearest stations can supply solar radiation, wind and humidity, and Hargreaves-Samani everywhere else. Which method ran is recorded per row so a chart never mixes them silently.',
    ],
  },
];

const GROUPS = ['Climate', 'Phenology', 'Disease', 'Inputs'];

function ModelsAbout({ isOpen, onClose }) {
  const [active, setActive] = useState(MODELS[0].id);
  const closeRef = useRef(null);
  const bodyRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    closeRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const jump = (id) => {
    setActive(id);
    bodyRef.current
      ?.querySelector(`#model-${id}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="models__overlay" onClick={onClose}>
      <div
        className="models"
        role="dialog"
        aria-modal="true"
        aria-labelledby="models-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="models__head">
          <div>
            <h2 id="models-title">The models behind this table</h2>
            <p>Every figure on the portfolio is modelled, not measured. This is
               what each one is, where it comes from, and what it cannot do.</p>
          </div>
          <button type="button" className="models__close" onClick={onClose}
                  ref={closeRef} aria-label="Close">×</button>
        </header>

        <div className="models__split">
          <nav className="models__nav" aria-label="Models">
            {GROUPS.map((g) => (
              <div key={g} className="models__navgroup">
                <span className="models__navlabel">{g}</span>
                {MODELS.filter((m) => m.group === g).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className={`models__navitem${active === m.id ? ' is-active' : ''}`}
                    onClick={() => jump(m.id)}
                  >
                    {m.name}
                    {m.sub ? <em>{m.sub}</em> : null}
                  </button>
                ))}
              </div>
            ))}
          </nav>

          <div className="models__body" ref={bodyRef}>
            {MODELS.map((m) => (
              <section key={m.id} id={`model-${m.id}`} className="models__section">
                <h3>
                  {m.name}
                  {m.sub ? <span className="models__sub">{m.sub}</span> : null}
                </h3>
                <p className="models__question">{m.question}</p>

                {m.body.map((para, i) => <p key={i}>{para}</p>)}

                {m.equations ? (
                  <dl className="models__eqs">
                    {m.equations.map(([label, eq]) => (
                      <div key={label}>
                        <dt>{label}</dt>
                        <dd><code>{eq}</code></dd>
                      </div>
                    ))}
                  </dl>
                ) : null}

                {m.note ? <p className="models__note">{m.note}</p> : null}

                {m.table ? (
                  <div className="models__scroller">
                    <table className="models__table">
                      <thead>
                        <tr>{m.table.head.map((h, i) => (
                          <th key={h} className={i ? 'n' : undefined}>{h}</th>
                        ))}</tr>
                      </thead>
                      <tbody>
                        {m.table.rows.map((r) => (
                          <tr key={r[0]}>{r.map((c, i) => (
                            <td key={i} className={i ? 'n' : undefined}>{c}</td>
                          ))}</tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}

                {m.facts ? (
                  <dl className="models__facts">
                    {m.facts.map(([k, v]) => (
                      <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
                    ))}
                  </dl>
                ) : null}

                {m.refs ? (
                  <ul className="models__refs">
                    {m.refs.map((r) => <li key={r}>{r}</li>)}
                  </ul>
                ) : null}

                {m.limits ? (
                  <p className="models__limits">
                    <span>Limits</span>{m.limits}
                  </p>
                ) : null}
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ModelsAbout;
