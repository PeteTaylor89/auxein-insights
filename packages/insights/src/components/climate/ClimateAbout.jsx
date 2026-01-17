// packages/insights/src/components/climate/ClimateAbout.jsx
/**
 * ClimateAbout Component
 * 
 * Modal displaying information about the climate data sources,
 * methodology, and interpretation guidelines.
 */

import React from 'react';
import { X, Database, Calendar, TrendingUp, AlertCircle, ExternalLink } from 'lucide-react';

const ClimateAbout = ({ onClose }) => {
  return (
    <div className="climate-about-overlay" onClick={onClose}>
      <div className="climate-about-modal" onClick={(e) => e.stopPropagation()}>
        <div className="about-header">
          <h2>About Climate Data</h2>
          <button className="close-btn" onClick={onClose} aria-label="Close">
            <X size={24} />
          </button>
        </div>

        <div className="about-content">
          {/* Data Source */}
          <section className="about-section">
            <div className="section-icon">
              <Database size={24} />
            </div>
            <div className="section-content">
              <h3>Data Source</h3>
              <p>
                Climate data is sourced from a network of weather stations and through the former NIWA's CliFlo database.  
                These data were put through an Auxein developed interpolation model to determine the daily climate at every vineyard in NZ, and a 
                daily gridded climate data at ~5km resolution across New Zealand. 
                This data is aggregated to monthly values and summarised for 20 wine climate zones.
              </p>
              <p>
                <strong>Historical data:</strong> 1986 - 2024<br />
                <strong>Coverage:</strong> Every NZ vineyard - Daily climate history <strong>|</strong> Projection to 2100<br />
                <strong>Presented:</strong> 20 wine climate zones across NZ
              </p>
            </div>
          </section>

          {/* Baseline Period */}
          <section className="about-section">
            <div className="section-icon">
              <Calendar size={24} />
            </div>
            <div className="section-content">
              <h3>Baseline Period (1986-2005)</h3>
              <p>
                All comparisons reference the 1986-2005 baseline period, which represents 
                the 20-year average climate conditions. This period is used as it aligns with international climate models  
                for projecting future climates, and contains reliable instrumental records.
              </p>
              <p>
                When you see "vs baseline" comparisons, positive values indicate conditions 
                warmer/wetter than the 1986-2005 average.
              </p>
            </div>
          </section>

          {/* Climate Variables */}
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

          {/* SSP Scenarios */}
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

          {/* Projection Periods */}
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

          {/* Interpretation */}
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

          {/* Citations */}
          <section className="about-section citations">
            <h3>Data Sources & References</h3>
            <ul className="citations-list">
              <li>
                NIWA CliFlo - Now Defunct
                <a href="https://niwa.co.nz/" 
                   target="_blank" rel="noopener noreferrer">
                  <ExternalLink size={14} />
                </a>
              </li>
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
        </div>

        <div className="about-footer">
          <p>
            Data prepared by Auxein Limited for Regional Intelligence. 
            For commercial vineyard-specific analysis, contact us about Auxein Insights Pro or bespoke modelling for your operation.
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