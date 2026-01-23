// packages/insights/src/components/climate/ClimateAbout.jsx
/**
 * ClimateAbout Component
 * 
 * Context-aware modal displaying information about the climate data sources,
 * methodology, and interpretation guidelines based on the active view.
 */

import React from 'react';
import { 
  X, 
  Database, 
  Calendar, 
  TrendingUp, 
  AlertCircle, 
  ExternalLink,
  Sun,
  Grape,
  ShieldAlert,
  Thermometer,
  Droplets,
  Clock
} from 'lucide-react';

const ClimateAbout = ({ onClose, activeView = 'seasons' }) => {
  
  // ==========================================================================
  // CURRENT SEASON CONTENT
  // ==========================================================================
  const CurrentSeasonContent = () => (
    <>
      <section className="about-section">
        <div className="section-icon">
          <Sun size={24} />
        </div>
        <div className="section-content">
          <h3>Live Climate Monitoring</h3>
          <p>
            Current Season displays real-time climate data collected from weather stations 
            within New Zealand wine regions. Data is ingested daily and processed to provide 
            up-to-date growing conditions for the current vintage.
          </p>
          <p>
            <strong>Update frequency:</strong> Daily (always before 6pm NZST)<br />
            <strong>Data sources:</strong> Regional weather station network<br />
            <strong>Season:</strong> October 1 to April 30 (Southern Hemisphere growing season)
          </p>
        </div>
      </section>

      <section className="about-section">
        <div className="section-content">
          <h3>Contribute Data</h3>
          <p>
            Some climate zones in wine growing regions are not yet added to the "Current Season",
            "Phenology", or "Disease Pressures" insights as we do not have enough weather stations
            contributing to our insights.
          </p>
          <p>
            <strong>We need your help:</strong> Do you have a weather station, and would like to contribute?<br />
            
            <a href="https://auxein.co.nz/contact" target="_blank" rel="noopener noreferrer">
              <strong>Contact Auxein</strong>
            </a>
            <br />
            
          </p>
        </div>
      </section>

      <section className="about-section">
        <div className="section-icon">
          <Thermometer size={24} />
        </div>
        <div className="section-content">
          <h3>Growing Degree Days (GDD)</h3>
          <p>
            GDD measures accumulated heat units above a base temperature, indicating 
            the thermal energy available for vine growth and grape ripening. We calculate and present
            GDD using base 0°C for broader applicability across cool-climate regions.
          </p>
          <code>GDD₀ = Σ max(0, Tmean)</code>
          <p className="formula-note">
            Accumulated from October 1 each season. Baseline comparison uses the 
            1986-2005 average GDD accumulation for the same date.
          </p>
        </div>
      </section>

      <section className="about-section">
        <h3>Status Indicators</h3>
        <div className="variables-grid">
          <div className="variable-card">
            <h4>Ahead of Baseline</h4>
            <p>
              Current GDD accumulation is higher than the 1986-2005 average for this 
              point in the season. May indicate earlier phenology and harvest dates.
            </p>
          </div>
          <div className="variable-card">
            <h4>Behind Baseline</h4>
            <p>
              Current GDD accumulation is lower than average. May indicate later 
              phenological development and extended hang time.
            </p>
          </div>
          <div className="variable-card">
            <h4>Normal</h4>
            <p>
              Within ±5% of baseline accumulation. Season is tracking close to 
              historical averages.
            </p>
          </div>
        </div>
      </section>
    </>
  );

  // ==========================================================================
  // PHENOLOGY CONTENT
  // ==========================================================================
  const PhenologyContent = () => (
    <>
      <section className="about-section">
        <div className="section-icon">
          <Grape size={24} />
        </div>
        <div className="section-content">
          <h3>Phenology Prediction Models</h3>
          <p>
            Phenology estimates predict key grapevine developmental stages based on 
            accumulated Growing Degree Days. These predictions help with harvest planning, 
            spray timing, and resource allocation.
          </p>
          <p>
            Our models are built using two studies on international wine growing regions that use GDD threshold to derive 
            phenological timing. Presented in our first release are flowering and harvest estimates as veraison estimates 
            contain higher estimation error.
          </p>
        </div>
      </section>

      <section className="about-section">
        <div className="section-icon">
          <Database size={24} />
        </div>
        <div className="section-content">
          <h3>Scientific Basis</h3>
          <div className="citations-list">
            <div className="citation-item">
              <strong>Parker et al. (2011)</strong>
              <p>
                "General phenological model to characterise the timing of flowering and veraison of Vitis vinifera L."
              </p>
            </div>
            <div className="citation-item">
              <strong>Parker et al. (2020)</strong>
              <p>
                "Temperature-based grapevine sugar ripeness modelling for a wide range of Vitis vinifera L. cultivars.""
              </p>
            </div>
          </div>
        </div>
      </section>
{/*
      <section className="about-section">
        <h3>Phenological Stages</h3>
        <div className="stages-grid">
          <div className="stage-item">
            <span className="stage-name">Budburst</span>
            <span className="stage-desc">First visible green tissue emerging from buds</span>
          </div>
          <div className="stage-item">
            <span className="stage-name">Flowering</span>
            <span className="stage-desc">Cap fall and pollination; critical for fruit set</span>
          </div>
          <div className="stage-item">
            <span className="stage-name">Véraison</span>
            <span className="stage-desc">Onset of ripening; colour change in berries</span>
          </div>
          <div className="stage-item">
            <span className="stage-name">Harvest</span>
            <span className="stage-desc">Optimal maturity windows by target sugar level</span>
          </div>
        </div>
      </section>
*/}

      <section className="about-section">
        <div className="section-icon warning">
          <AlertCircle size={24} />
        </div>
        <div className="section-content">
          <h3>Interpretation Notes</h3>
          <ul className="guidelines-list">
            <li>
              <strong>Predictions are estimates.</strong> Actual dates depend on 
              site-specific conditions, vine age, crop load, and management practices.
            </li>
            <li>
              <strong>Véraison predictions have higher uncertainty.</strong> We are 
              currently not reporting véraison results while we refine our véraison model with local calibration data.
            </li>
            <li>
              <strong>Harvest windows assume typical ripening.</strong> Actual harvest 
              timing depends on winemaking style and weather conditions.
            </li>
          </ul>
        </div>
      </section>
    </>
  );

  // ==========================================================================
  // DISEASE PRESSURE CONTENT
  // ==========================================================================
  const DiseasePressureContent = () => (
    <>
      <section className="about-section">
        <div className="section-icon">
          <ShieldAlert size={24} />
        </div>
        <div className="section-content">
          <h3>Disease Pressure Monitoring</h3>
          <p>
            Disease pressure indicators are calculated daily using peer-reviewed 
            epidemiological models. These models assess environmental conditions 
            favorable for disease development and infection risk.
          </p>
          <p>
            <strong>Diseases monitored:</strong> Powdery Mildew, Downy Mildew, Botrytis<br />
            <strong>Update frequency:</strong> Daily<br />
            <strong>Data inputs:</strong> Temperature, humidity, rainfall, leaf wetness (estimated)
          </p>
        </div>
      </section>

      <section className="about-section">
        <h3>Disease Models</h3>
        <div className="variables-grid">
          <div className="variable-card">
            <h4>Powdery Mildew</h4>
            <p>
              <strong>UC Davis Risk Index</strong> (Gubler et al., 1999)<br />
              Accumulates risk based on hours in the favorable temperature range 
              (21-30°C), with decay during unfavorable conditions and reset after 
              lethal heat events (≥35°C for 6+ hours).
            </p>
            <div className="model-thresholds">
              <span>Low: &lt;30</span>
              <span>Moderate: 30-50</span>
              <span>High: 50-60</span>
              <span>Extreme: &gt;60</span>
            </div>
          </div>
          <div className="variable-card">
            <h4>Botrytis (Grey Mould)</h4>
            <p>
              <strong>González-Domínguez Model</strong> (2015)<br />
              Calculates infection severity based on wetness duration, temperature, 
              and sporulation conditions. 
            </p>
            <div className="model-thresholds">
              <span>Low: &lt;25</span>
              <span>Moderate: 25-50</span>
              <span>High: 50-75</span>
              <span>Extreme: &gt;75</span>
            </div>
          </div>
          <div className="variable-card">
            <h4>Downy Mildew</h4>
            <p>
              <strong>3-10 Rule + Goidanich Index</strong><br />
              Primary infection requires: shoots ≥10mm, 24hr rainfall ≥10mm, 
              temperature ≥10°C. Secondary spread tracked via the Goidanich 
              sporulation index based on humidity and temperature.
            </p>
            <div className="model-thresholds">
              <span>Low: &lt;25</span>
              <span>Moderate: 25-50</span>
              <span>High: 50-75</span>
              <span>Extreme: &gt;75</span>
            </div>
          </div>
        </div>
      </section>

      <section className="about-section">
        <div className="section-icon">
          <Droplets size={24} />
        </div>
        <div className="section-content">
          <h3>Leaf Wetness Estimation</h3>
          <p>
            Where direct leaf wetness sensors are not available, we estimate wetness 
            probability using the Magnus-Tetens dewpoint formula and humidity thresholds:
          </p>
          <ul className="guidelines-list">
            <li>Rainfall occurring → 100% wet probability</li>
            <li>Relative humidity ≥95% → 95% wet probability</li>
            <li>Dewpoint depression ≤1°C → 90% wet probability</li>
            <li>Post-rain period (≤6 hours) → Declining probability</li>
          </ul>
        </div>
      </section>

      <section className="about-section">
        <div className="section-icon warning">
          <AlertCircle size={24} />
        </div>
        <div className="section-content">
          <h3>Important Limitations</h3>
          <ul className="guidelines-list">
            <li>
              <strong>Models indicate environmental risk, not actual infection. </strong> 
              Field scouting remains essential for confirming disease presence.
            </li>
            <li>
              <strong>Zone-level data may not reflect microclimate. </strong> Conditions 
              at your specific site may differ from the regional average.
            </li>
            <li>
              <strong>Spray decisions require professional judgment. </strong> These 
              indicators support but do not replace viticulturist judgement.
            </li>
            <li>
              <strong>Historical fungicide applications not considered. </strong> Actual 
              risk depends on your spray program and product efficacy.
            </li>
          </ul>
        </div>
      </section>

      <section className="about-section citations">
        <h3>Scientific References</h3>
        <ul className="citations-list">
          <li>
            Gubler, W.D. et al. (1999). "Control of Powdery Mildew Using the UC Davis Powdery Mildew Risk Index" — UC Davis
            <a href="https://www.apsnet.org/edcenter/apsnetfeatures/Pages/UCDavisRisk.aspx" 
               target="_blank" rel="noopener noreferrer">
              <ExternalLink size={14} />
            </a>
          </li>
          <li>
            González-Domínguez, E. et al. (2015). "A Mechanistic Model of Botrytis cinerea on Grapevines That Includes Weather, Vine Growth Stage, and the Main Infection Pathways"
            <a href="https://www.researchgate.net/publication/282811797_A_Mechanistic_Model_of_Botrytis_cinerea_on_Grapevines_That_Includes_Weather_Vine_Growth_Stage_and_the_Main_Infection_Pathways" 
               target="_blank" rel="noopener noreferrer">
              <ExternalLink size={14} />
            </a>
          </li>
          <li>
            Rossi, V. et al. (2008). "A mechanistic model simulating primary infections of downy mildew in grapevine"
            <a href="https://www.sciencedirect.com/science/article/abs/pii/S0304380007005881" 
               target="_blank" rel="noopener noreferrer">
              <ExternalLink size={14} />
            </a>
          </li>
        </ul>
      </section>
    </>
  );

  // ==========================================================================
  // HISTORICAL SEASONS CONTENT
  // ==========================================================================
  const SeasonsContent = () => (
    <>
      <section className="about-section">
        <div className="section-icon">
          <Database size={24} />
        </div>
        <div className="section-content">
          <h3>Data Source</h3>
          <p>
            Climate data is sourced from a network of weather stations and the former 
            NIWA CliFlo database. These data were processed through an Auxein-developed 
            interpolation model to determine daily climate at every vineyard in NZ, 
            producing gridded climate data at ~5km resolution.
          </p>
          <p>
            <strong>Historical data:</strong> 1986 - 2024<br />
            <strong>Coverage:</strong> Daily climate history for every NZ vineyard<br />
            <strong>Presented:</strong> 20 wine climate zones across NZ
          </p>
        </div>
      </section>

      <section className="about-section">
        <div className="section-icon">
          <Calendar size={24} />
        </div>
        <div className="section-content">
          <h3>Baseline Period (1986-2005)</h3>
          <p>
            All comparisons reference the 1986-2005 baseline period, representing 
            the 20-year average climate conditions. This period aligns with 
            international climate models for projecting future climates and contains 
            reliable instrumental records.
          </p>
          <p>
            When you see "vs baseline" comparisons, positive values indicate conditions 
            warmer/wetter than the 1986-2005 average.
          </p>
        </div>
      </section>

      <section className="about-section">
        <h3>Climate Variables</h3>
        <div className="variables-grid">
          <div className="variable-card">
            <h4>Growing Degree Days (GDD)</h4>
            <p>
              Accumulated heat units above 10°C base temperature during the growing 
              season (October-April). Higher GDD indicates more heat accumulation 
              for grape ripening.
            </p>
            <code>GDD = Σ max(0, Tmean - 10)</code>
          </div>
          <div className="variable-card">
            <h4>Temperature</h4>
            <p>
              Mean (Tmean), maximum (Tmax), and minimum (Tmin) temperatures. 
              Values shown are spatial averages across the climate zone.
            </p>
          </div>
          <div className="variable-card">
            <h4>Rainfall</h4>
            <p>
              Total precipitation in millimetres. Growing season totals 
              (October-April) are particularly relevant for vineyard management.
            </p>
          </div>
        </div>
      </section>
    </>
  );

  // ==========================================================================
  // PROJECTIONS CONTENT
  // ==========================================================================
  const ProjectionsContent = () => (
    <>
      <section className="about-section">
        <div className="section-icon">
          <TrendingUp size={24} />
        </div>
        <div className="section-content">
          <h3>SSP Climate Scenarios</h3>
          <p>
            Future projections are based on Shared Socioeconomic Pathways (SSPs) 
            from the IPCC's 6th Assessment Report and CMIP6 climate models.
          </p>
          <div className="ssp-list">
            <div className="ssp-item ssp126">
              <span className="ssp-badge">SSP1-2.6</span>
              <span className="ssp-desc">
                <strong>Sustainability pathway</strong> — Strong emissions reductions, 
                limiting warming to ~1.8°C by 2100
              </span>
            </div>
            <div className="ssp-item ssp245">
              <span className="ssp-badge">SSP2-4.5</span>
              <span className="ssp-desc">
                <strong>Middle of the road</strong> — Intermediate emissions, 
                warming of ~2.7°C by 2100
              </span>
            </div>
            <div className="ssp-item ssp370">
              <span className="ssp-badge">SSP3-7.0</span>
              <span className="ssp-desc">
                <strong>Regional rivalry</strong> — Limited mitigation, 
                warming of ~3.6°C by 2100
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="about-section">
        <h3>Projection Time Periods</h3>
        <div className="periods-grid">
          <div className="period-item">
            <span className="period-label">Near-term</span>
            <span className="period-years">2021-2040</span>
            <span className="period-desc">
              Changes already locked in, regardless of emissions pathway
            </span>
          </div>
          <div className="period-item">
            <span className="period-label">Mid-century</span>
            <span className="period-years">2041-2060</span>
            <span className="period-desc">
              Scenarios begin to diverge based on emissions
            </span>
          </div>
          <div className="period-item">
            <span className="period-label">End of century</span>
            <span className="period-years">2080-2099</span>
            <span className="period-desc">
              Large differences between low and high emissions scenarios
            </span>
          </div>
        </div>
      </section>

      <section className="about-section">
        <div className="section-icon warning">
          <AlertCircle size={24} />
        </div>
        <div className="section-content">
          <h3>Interpretation Guidelines</h3>
          <ul className="guidelines-list">
            <li>
              <strong>Projections show trends, not predictions.</strong> Individual 
              years will vary around projected averages.
            </li>
            <li>
              <strong>Uncertainty increases with time.</strong> Near-term projections 
              are more reliable than end-of-century projections.
            </li>
            <li>
              <strong>Zone averages smooth local variation.</strong> Conditions at 
              specific vineyard sites may differ from zone-level summaries.
            </li>
            <li>
              <strong>Climate is only one factor.</strong> Vineyard success depends 
              on many factors including soils, management, and variety selection.
            </li>
          </ul>
        </div>
      </section>

      <section className="about-section citations">
        <h3>Data Sources & References</h3>
        <ul className="citations-list">
          <li>
            IPCC AR6 Climate Projections
            <a href="https://www.ipcc.ch/report/ar6/wg1/" 
               target="_blank" rel="noopener noreferrer">
              <ExternalLink size={14} />
            </a>
          </li>
          <li>
            Ministry for the Environment - Climate Change Projections for NZ
            <a href="https://environment.govt.nz/publications/climate-change-projections-for-new-zealand/" 
               target="_blank" rel="noopener noreferrer">
              <ExternalLink size={14} />
            </a>
          </li>
        </ul>
      </section>
    </>
  );

  // ==========================================================================
  // VIEW TITLES
  // ==========================================================================
  const viewTitles = {
    currentseason: 'About Current Season Data',
    phenology: 'About Phenology Predictions',
    disease: 'About Disease Pressure Models',
    seasons: 'About Historical Climate Data',
    projections: 'About Climate Projections',
  };

  // ==========================================================================
  // RENDER CONTENT BASED ON VIEW
  // ==========================================================================
  const renderContent = () => {
    switch (activeView) {
      case 'currentseason':
        return <CurrentSeasonContent />;
      case 'phenology':
        return <PhenologyContent />;
      case 'disease':
        return <DiseasePressureContent />;
      case 'projections':
        return <ProjectionsContent />;
      case 'seasons':
      default:
        return <SeasonsContent />;
    }
  };

  return (
    <div className="climate-about-overlay" onClick={onClose}>
      <div className="climate-about-modal" onClick={(e) => e.stopPropagation()}>
        <div className="about-header">
          <h2>{viewTitles[activeView] || 'About Climate Data'}</h2>
          <button className="close-btn" onClick={onClose} aria-label="Close">
            <X size={24} />
          </button>
        </div>

        <div className="about-content">
          {renderContent()}
        </div>

        <div className="about-footer">
          <p>
            Data prepared by Auxein Limited for Regional Intelligence. 
            For commercial vineyard-specific analysis, contact us about Auxein Insights Pro.
          </p>
          <button className="close-about-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ClimateAbout;