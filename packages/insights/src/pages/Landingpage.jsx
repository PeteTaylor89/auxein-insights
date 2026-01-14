// pages/LandingPage.jsx - Single-page Auxein Regional Intelligence
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Thermometer, Cloud, TrendingUp, ChartArea, ChartSpline, CloudSunRain, Grape, ShieldCheck, Bug, X } from 'lucide-react';
import ClimateContainer from '../components/climate/ClimateContainer';
import RegionMap from '../components/RegionMap';
import Logo from '../assets/App_Logo_September 20251.jpg';
import MainLogo from '../assets/Logo_September 2025.png';
import './LandingPage.css';

function LandingPage() {
  const [activeInsight, setActiveInsight] = useState(null);
  
  // Featured regions data
  const featuredRegions = [
    { id: 'marlborough', name: 'Marlborough', temp: '15.2°C', gdd: 1250, lat: -41.5, lon: 173.9 },
    { id: 'central-otago', name: 'Central Otago', temp: '11.8°C', gdd: 1050, lat: -45.0, lon: 169.1 },
    { id: 'waipara', name: 'Waipara', temp: '13.5°C', gdd: 1150, lat: -43.0, lon: 172.7 },
    { id: 'hawkes-bay', name: 'Hawke\'s Bay', temp: '15.8°C', gdd: 1400, lat: -39.6, lon: 176.9 }
  ];

  // Insight options
  const insightOptions = [
    { id: 'currentseason', icon: <CloudSunRain size={28} />, label: 'Current Season', placeholder: 'Current Season Climate Analysis coming soon...' },
    { id: 'phenology', icon: <Grape size={28} />, label: 'Phenology', placeholder: 'Phenology analysis coming soon...' },
    { id: 'disease', icon: <ShieldCheck size={28} />, label: 'Disease', placeholder: 'Disease risk analysis coming soon...' },
    { id: 'biosecurity', icon: <Bug size={28} />, label: 'Biosecurity', placeholder: 'Biosecurity monitoring coming soon...' },
    { id: 'climateprojection', icon: <ChartSpline size={28} />, label: 'Climate Projections', placeholder: 'Climate Projections coming soon...' }
  ];

  // Default weather location
  const defaultWeatherLocation = {
    lat: -41.2865,
    lon: 174.7762,
    name: 'Wellington, NZ'
  };

  const handleInsightClick = (insightId) => {
    setActiveInsight(activeInsight === insightId ? null : insightId);
    
    // Smooth scroll to insights section
    if (activeInsight !== insightId) {
      setTimeout(() => {
        document.getElementById('insights-section')?.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'start' 
        });
      }, 100);
    }
  };

  const renderActiveInsight = () => {
    const insight = insightOptions.find(opt => opt.id === activeInsight);
    if (!insight) return null;

    if (insight.component) {
      const Component = insight.component;
      return (
        <div className="insight-content-wrapper">
          <div className="insight-header">
            <h3>{insight.label}</h3>
            <button 
              className="close-insight-btn"
              onClick={() => setActiveInsight(null)}
              aria-label={`Close ${insight.label}`}
            >
              <X size={24} />
            </button>
          </div>
          <Component />
        </div>
      );
    }

    return (
      <div className="insight-content-wrapper">
        <div className="insight-header">
          <h3>{insight.label}</h3>
          <button 
            className="close-insight-btn"
            onClick={() => setActiveInsight(null)}
            aria-label={`Close ${insight.label}`}
          >
            <X size={24} />
          </button>
        </div>
        <div className="insight-placeholder">
          <p>{insight.placeholder}</p>
        </div>
      </div>
    );
  };

  return (
    <div className="landing-page">
      {/* Sticky Header */}
      <header className="landing-header">
        <div className="header-container">
          <div className="header-brand">
            <img src={MainLogo} alt="Auxein Logo" className="header-logo" />
            <div className="header-title-block">
              <h1>Auxein Insights</h1>
              <p>Viticultural Regional Intelligence</p>
            </div>
          </div>
          
          <nav className="header-nav">
            <Link to="/about">About</Link>
            <a href="https://auxein.co.nz/log-in" target="_blank" rel="noopener noreferrer">
              Insights-Pro
            </a>
            <a 
              href="https://auxein.co.nz" 
              target="_blank" 
              rel="noopener noreferrer"
            >
              Auxein
            </a>
          </nav>
        </div>
      </header>

      {/* Insights Section */}
      <section id="insights-section" className="insights-section">
        <div className="section-header">
          <h2>Vine-Sights</h2>

        </div>
        <div className="insights-grid">
          {insightOptions.map(insight => (
            <button
              key={insight.id}
              className={`insight-card ${activeInsight === insight.id ? 'active' : ''}`}
              onClick={() => handleInsightClick(insight.id)}
            >
              <div className="insight-icon">{insight.icon}</div>
              <div className="insight-label">{insight.label}</div>
            </button>
          ))}
        </div>

        {/* Active Insight Display */}
        {activeInsight && (
          <div className="active-insight-container">
            {renderActiveInsight()}
          </div>
        )}
      </section>

      {/* Map Section */}
      <section className="map-section">
        <div className="section-header">
          <h2>Regional Explorer</h2>
        </div>
        
        <div className="map-container-wrapper">
          <RegionMap regions={featuredRegions} />
        </div>

      </section>



      {/* About/CTA Section */}
      <section className="about-cta-section">
        <div className="about-content">
          <h2>Auxein Insights</h2>
          <p>
            Access comprehensive climate data and insights for New Zealand's wine regions. 
            Our platform aggregates decades of climate information to help viticulturists 
            and wine industry professionals understand regional climate patterns.
          </p>
          <p>
            Built on over 600 million climate data points, we provide analysis of temperature 
            patterns, rainfall trends, growing degree days, and other critical metrics that 
            impact viticulture.
          </p>
          
          <div className="premium-cta">
            <h3>Vineyard Management & Insights</h3>
            <p>
              Our premium Auxein Insights platform offers vineyard-specific climate analysis, 
              risk management tools, and comprehensive management features.
            </p>
            <a 
              href="https://auxein.co.nz/"
              target="_blank" 
              rel="noopener noreferrer"
              className="premium-btn"
            >
              Explore Auxein Insights →
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <img src={Logo} alt="Auxein Logo" className="footer-logo" />
            <p>Auxein Insights</p>
          </div>
          <div className="footer-links">
            <Link to="/about">About</Link>
            <a href="https://auxein.co.nz" target="_blank" rel="noopener noreferrer">
              Auxein
            </a>
            <a href="https://auxein.co.nz/contact" target="_blank" rel="noopener noreferrer">
              Contact
            </a>
          </div>
          <div className="footer-copyright">
            © {new Date().getFullYear()} Auxein Limited. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}

export default LandingPage;