// components/pro/PricingCalculator.jsx — the price, and the Grow comparison.
//
// Two jobs in one block, because they are one question. "$600 per site" only
// means something next to "and Grow is $85 a hectare and includes it", and a
// grower cannot answer which is better for them without doing arithmetic we
// can do for them.
//
// WHERE THE NUMBERS COME FROM
// Nowhere in this file. Rates are fetched from `GET /public/insights-pro/
// pricing` and every figure on screen is derived from them, so the page cannot
// display a price the server does not hold. The same rates are applied again
// server-side when the calculation is recorded, which is why the number shown
// and the number stored cannot disagree.
//
// WHY IT RECORDS
// Pete asked for calculator usage to land in the database so the commercial
// question — does anyone price this up, and at what scale of vineyard — has an
// answer. It posts DEBOUNCED and DE-DUPLICATED: a live calculator that wrote a
// row per keystroke would fill the table with the digits of somebody's typing
// rather than with what they meant.
//
// The comparison is deliberately not framed as "Grow is cheaper, buy Grow".
// Grow is a whole vineyard management platform and Insights Pro is one point on
// a map; a grower for whom Grow costs less is being told a useful fact, not
// sold the same thing twice.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Calculator, Check, Info } from 'lucide-react';
import {
  getPricing,
  recordPricingQuote,
  calculatorSessionKey,
  formatNZD,
} from '../../services/proService';
import './PricingCalculator.css';

// Long enough that a person finishing a number is one row, short enough that
// the record lands before they scroll away.
const RECORD_DEBOUNCE_MS = 1400;

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function PricingCalculator() {
  const [pricing, setPricing] = useState(null);
  const [failed, setFailed] = useState(false);

  const [hectares, setHectares] = useState('');
  const [sites, setSites] = useState('1');

  // What was last written, so an unchanged input never records twice.
  const lastRecorded = useRef(null);
  const sessionKey = useRef(null);

  useEffect(() => {
    let cancelled = false;
    getPricing()
      .then((data) => { if (!cancelled) setPricing(data); })
      .catch(() => { if (!cancelled) setFailed(true); });
    sessionKey.current = calculatorSessionKey();
    return () => { cancelled = true; };
  }, []);

  const ha = toNumber(hectares, 0);
  const siteCount = toNumber(sites, 0);
  const hasInput = hectares !== '' && ha > 0;

  // Derived from the fetched rates, never from a constant in this file.
  const result = useMemo(() => {
    if (!pricing) return null;
    const proRate = Number(pricing.pro.ex_gst);
    const growRate = Number(pricing.grow.ex_gst);
    const gst = Number(pricing.gst_rate);

    const growSetup = Number(pricing.grow.setup_ex_gst || 0);

    const proEx = proRate * siteCount;
    const growEx = growRate * ha;                 // recurring, setup excluded
    const growFirstEx = growEx + growSetup;       // year one
    const withGst = (v) => v * (1 + gst);

    const verdict = (pro, grow) => {
      if (pro === grow) return 'equal';
      return grow < pro ? 'grow' : 'pro';
    };

    return {
      proEx,
      proInc: withGst(proEx),
      growEx,
      growInc: withGst(growEx),
      growSetup,
      growFirstEx,
      // Two verdicts, because between 4.12 and 7.06 ha they disagree: Pro is
      // cheaper in year one while Grow is cheaper every year after. Showing
      // one of them across that band would be picking a side.
      cheaper: verdict(proEx, growEx),
      differenceEx: Math.abs(proEx - growEx),
      cheaperFirst: verdict(proEx, growFirstEx),
      differenceFirstEx: Math.abs(proEx - growFirstEx),
      verdictsAgree: verdict(proEx, growEx) === verdict(proEx, growFirstEx),
    };
  }, [pricing, ha, siteCount]);

  // --- Record, debounced and de-duplicated --------------------------------
  const record = useCallback(() => {
    const signature = `${ha}|${siteCount}`;
    if (!hasInput || lastRecorded.current === signature) return;
    lastRecorded.current = signature;
    // Fire and forget. A visitor asked for a number; whether our analytics
    // write succeeded is our problem, and surfacing it would be noise.
    recordPricingQuote({ hectares: ha, sites: siteCount, sessionKey: sessionKey.current })
      .catch(() => { lastRecorded.current = null; });
  }, [ha, siteCount, hasInput]);

  useEffect(() => {
    if (!hasInput || !pricing) return undefined;
    const timer = setTimeout(record, RECORD_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [record, hasInput, pricing]);

  if (failed) {
    // No invented fallback price. If the rates cannot be fetched the honest
    // thing is to say so and point at a human, not to guess.
    return (
      <section className="pricing" aria-labelledby="pricing-heading">
        <h2 id="pricing-heading">Pricing</h2>
        <p className="pricing__failed">
          Pricing is not loading just now. Please get in touch and we will send
          it through.
        </p>
      </section>
    );
  }

  return (
    <section className="pricing" aria-labelledby="pricing-heading">
      <h2 id="pricing-heading">Pricing</h2>

      <div className="pricing__cards">
        <div className="pricing__card pricing__card--pro">
          <h3>Insights Pro</h3>
          <p className="pricing__amount">
            {pricing ? formatNZD(pricing.pro.ex_gst) : '—'}
            <span className="pricing__unit">+ GST per site, per year</span>
          </p>
          <p className="pricing__inc">
            {pricing ? `${formatNZD(pricing.pro.inc_gst, { decimals: 2 })} including GST` : ' '}
          </p>
          <ul className="pricing__points">
            <li><Check size={15} aria-hidden="true" /> One monitored site, its whole record</li>
            <li><Check size={15} aria-hidden="true" /> Everything in the free regional tier</li>
            <li><Check size={15} aria-hidden="true" /> Add further sites at the same rate</li>
            <li><Check size={15} aria-hidden="true" /> No setup fee</li>
          </ul>
        </div>

        <div className="pricing__card pricing__card--grow">
          <h3>Auxein Grow</h3>
          <p className="pricing__amount">
            {pricing ? formatNZD(pricing.grow.ex_gst) : '—'}
            <span className="pricing__unit">+ GST per hectare, per year</span>
          </p>
          <p className="pricing__inc">
            {pricing ? `${formatNZD(pricing.grow.inc_gst, { decimals: 2 })} including GST` : ' '}
          </p>
          {pricing?.grow?.setup_ex_gst != null && (
            <p className="pricing__setup">
              plus {formatNZD(pricing.grow.setup_ex_gst)} + GST one-off setup,
              first year only
            </p>
          )}
          <p className="pricing__note">
            The 12-month committed rate. Grow is the full vineyard management
            platform — and <strong>Insights Pro is included with it</strong>.
          </p>
        </div>
      </div>

      {/* ---- Calculator ---- */}
      <div className="pricing__calc">
        <h3 className="pricing__calc-title">
          <Calculator size={18} aria-hidden="true" />
          Work out which suits you
        </h3>
        <p className="pricing__calc-lede">
          Enter your planted area and how many sites you would want to monitor.
        </p>

        <div className="pricing__inputs">
          <label className="pricing__field">
            <span>Planted area</span>
            <div className="pricing__input-wrap">
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.1"
                value={hectares}
                onChange={(e) => setHectares(e.target.value)}
                placeholder="0"
                aria-describedby="pricing-ha-unit"
              />
              <span className="pricing__suffix" id="pricing-ha-unit">ha</span>
            </div>
          </label>

          <label className="pricing__field">
            <span>Sites to monitor</span>
            <div className="pricing__input-wrap">
              <input
                type="number"
                inputMode="numeric"
                min="0"
                step="1"
                value={sites}
                onChange={(e) => setSites(e.target.value)}
                placeholder="1"
              />
            </div>
          </label>
        </div>

        {hasInput && result && (
          <div className="pricing__result" role="status">
            <div className="pricing__result-row">
              <span className="pricing__result-label">
                Insights Pro, {siteCount} site{siteCount === 1 ? '' : 's'}
              </span>
              <span className="pricing__result-value">
                {formatNZD(result.proEx)} <small>+ GST</small>
              </span>
            </div>
            <div className="pricing__result-row">
              <span className="pricing__result-label">
                Auxein Grow, {ha.toLocaleString('en-NZ')} ha
                <small>first year, including setup</small>
              </span>
              <span className="pricing__result-value">
                {formatNZD(result.growFirstEx)} <small>+ GST</small>
              </span>
            </div>
            <div className="pricing__result-row">
              <span className="pricing__result-label">
                Auxein Grow
                <small>each year after</small>
              </span>
              <span className="pricing__result-value">
                {formatNZD(result.growEx)} <small>+ GST</small>
              </span>
            </div>

            {/* When both comparisons agree, one sentence says it. When they
                disagree — anywhere between about 4 and 7 hectares — saying
                only one of them would be picking a side, so both are shown. */}
            <p className={`pricing__verdict pricing__verdict--${result.cheaper}`}>
              {result.verdictsAgree ? (
                <>
                  {result.cheaper === 'grow' && (
                    <>
                      At this size <strong>Grow costs {formatNZD(result.differenceEx)} less
                      a year</strong> than Insights Pro alone — and Insights Pro comes with it.
                    </>
                  )}
                  {result.cheaper === 'pro' && (
                    <>
                      At this size <strong>Insights Pro is {formatNZD(result.differenceEx)} less
                      a year</strong>. Grow costs more because it does considerably more than
                      climate data.
                    </>
                  )}
                  {result.cheaper === 'equal' && (
                    <>The two come to the same figure at this size.</>
                  )}
                </>
              ) : (
                <>
                  At this size it depends on the horizon.{' '}
                  <strong>
                    {result.cheaperFirst === 'pro'
                      ? `Insights Pro is ${formatNZD(result.differenceFirstEx)} less in the first year`
                      : `Grow is ${formatNZD(result.differenceFirstEx)} less in the first year`}
                  </strong>{' '}
                  once Grow&rsquo;s setup fee is counted, but{' '}
                  <strong>
                    {result.cheaper === 'grow'
                      ? `Grow is ${formatNZD(result.differenceEx)} less every year after it`
                      : `Insights Pro is ${formatNZD(result.differenceEx)} less every year after it`}
                  </strong>.
                </>
              )}
            </p>
          </div>
        )}

        <p className="pricing__disclaimer">
          <Info size={14} aria-hidden="true" />
          <span>
            An indication, not a quote. Figures exclude GST unless stated, Grow
            is shown at its 12-month committed rate, and its setup fee is
            charged once in the first year. Insights Pro has no setup fee.
          </span>
        </p>
      </div>
    </section>
  );
}

export default PricingCalculator;
