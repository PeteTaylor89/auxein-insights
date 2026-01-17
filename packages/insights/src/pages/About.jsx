// pages/About.jsx
/**
 * About Page Component
 * 
 * Information about Auxein and the Regional Intelligence platform.
 * Styled consistently with ClimateAbout modal.
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { 
  ArrowLeft, 
  Grape, 
  Cloud, 
  TrendingUp, 
  Users, 
  Database,
  Shield,
  ExternalLink,
  Mail,
  MapPin
} from 'lucide-react';
import Logo from '../assets/Logo_September 2025.png';
import './About.css';

const About = () => {
  return (
    <div className="about-page">
      {/* Header */}
      <header className="about-page-header">
        <Link to="/" className="back-link">
          <ArrowLeft size={20} />
          <span>Back to Regional Intelligence</span>
        </Link>
        <img src={Logo} alt="Auxein" className="about-logo" />
      </header>

      {/* Main Content */}
      <main className="about-page-content">
        <div className="about-container">
          {/* Hero Section */}
          <section className="about-hero">
            <h1>About Auxein Insights</h1>
            <p className="hero-subtitle">
              Climate intelligence for New Zealand viticulture
            </p>
          </section>

          {/* Mission Section */}
          <section className="about-section">
            <div className="section-icon">
              <Grape size={24} />
            </div>
            <div className="section-content">
              <h2>Our Mission</h2>
              <p>
                Auxein Insights provides comprehensive climate intelligence for New Zealand's 
                wine industry, helping viticulturists and wine professionals make informed 
                decisions based on robust climate data and forward-looking projections.
              </p>
              <p>
                We believe that understanding climate—past, present, and future—is essential 
                for sustainable viticulture and informed vineyard management decisions.
              </p>
            </div>
          </section>

          {/* Platform Features */}
          <section className="about-section">
            <h2>Regional Intelligence Platform</h2>
            <div className="features-grid">
              <div className="feature-card">
                <div className="feature-icon">
                  <Database size={20} />
                </div>
                <h3>Climate History</h3>
                <p>
                  37 years of historical climate data (1987-2023) for 20 wine climate zones, 
                  derived from NIWA's Virtual Climate Station Network.
                </p>
              </div>
              <div className="feature-card">
                <div className="feature-icon">
                  <TrendingUp size={20} />
                </div>
                <h3>Future Projections</h3>
                <p>
                  CMIP6 climate projections under three SSP scenarios, showing how conditions 
                  may change through to 2100.
                </p>
              </div>
              <div className="feature-card">
                <div className="feature-icon">
                  <MapPin size={20} />
                </div>
                <h3>Zone Comparison</h3>
                <p>
                  Compare climate patterns across New Zealand's wine regions to understand 
                  regional differences and identify analogues.
                </p>
              </div>
              <div className="feature-card">
                <div className="feature-icon">
                  <Cloud size={20} />
                </div>
                <h3>Season Analysis</h3>
                <p>
                  Detailed growing season breakdowns showing monthly patterns for GDD, 
                  rainfall, and temperature metrics.
                </p>
              </div>
            </div>
          </section>

          {/* About Auxein */}
          <section className="about-section">
            <div className="section-icon">
              <Shield size={24} />
            </div>
            <div className="section-content">
              <h2>About Auxein Limited</h2>
              <p>
                Auxein Limited is a New Zealand climate technology company focused on the 
                wine industry. Founded with a vision to democratise access to climate 
                intelligence, we develop tools that help the wine sector understand and 
                adapt to changing conditions.
              </p>
              <p>
                Our team combines expertise in climatology, viticulture, and software 
                development to create practical tools for the wine industry.
              </p>
            </div>
          </section>

          {/* Data Sources */}
          <section className="about-section">
            <h2>Data Sources</h2>
            <div className="data-sources-list">
              <div className="data-source-item">
                <h4>Historical Climate Data</h4>
                <p>
                  NIWA Virtual Climate Station Network (VCSN) — daily gridded climate data 
                  at ~5km resolution, aggregated to monthly values for wine climate zones.
                </p>
                <a 
                  href="https://niwa.co.nz/climate/our-services/virtual-climate-stations" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="source-link"
                >
                  Learn more <ExternalLink size={14} />
                </a>
              </div>
              <div className="data-source-item">
                <h4>Climate Projections</h4>
                <p>
                  CMIP6 climate model ensemble, downscaled for New Zealand conditions. 
                  Based on IPCC AR6 Shared Socioeconomic Pathways (SSPs).
                </p>
                <a 
                  href="https://www.ipcc.ch/report/ar6/wg1/" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="source-link"
                >
                  IPCC AR6 Report <ExternalLink size={14} />
                </a>
              </div>
              <div className="data-source-item">
                <h4>Wine Climate Zones</h4>
                <p>
                  20 climate zones defined based on New Zealand's wine-growing regions, 
                  aligned with Geographical Indications where applicable.
                </p>
              </div>
            </div>
          </section>

          {/* Premium CTA */}
          <section className="about-section premium-section">
            <div className="premium-content">
              <h2>Auxein Insights Pro</h2>
              <p>
                For vineyard-specific climate analysis, risk management tools, and 
                comprehensive vineyard management features, explore our premium platform.
              </p>
              <div className="premium-features">
                <span className="premium-feature">Vineyard-specific climate data</span>
                <span className="premium-feature">Custom risk assessments</span>
                <span className="premium-feature">Block-level management</span>
                <span className="premium-feature">Observation tracking</span>
                <span className="premium-feature">Compliance reporting</span>
              </div>
              <a 
                href="https://auxein.co.nz" 
                target="_blank" 
                rel="noopener noreferrer"
                className="premium-btn"
              >
                Explore Auxein Insights Pro →
              </a>
            </div>
          </section>

          {/* Contact */}
          <section className="about-section contact-section">
            <h2>Get in Touch</h2>
            <div className="contact-grid">
              <a 
                href="mailto:hello@auxein.co.nz" 
                className="contact-card"
              >
                <Mail size={20} />
                <span>hello@auxein.co.nz</span>
              </a>
              <a 
                href="https://auxein.co.nz" 
                target="_blank" 
                rel="noopener noreferrer"
                className="contact-card"
              >
                <ExternalLink size={20} />
                <span>auxein.co.nz</span>
              </a>
            </div>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="about-page-footer">
        <p>© {new Date().getFullYear()} Auxein Limited. All rights reserved.</p>
        <p className="footer-location">Canterbury, New Zealand</p>
      </footer>
    </div>
  );
};

export default About;