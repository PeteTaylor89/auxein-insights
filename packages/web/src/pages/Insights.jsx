// src/pages/Insights.jsx - Updated with Interactive Insights
import { useEffect, useState } from 'react';
import MobileNavigation from '../components/MobileNavigation';
import { useAuth } from '@vineyard/shared';
import {companiesService, propertyService} from '@vineyard/shared';
import RegionalClimateHistory from '../components/climate/RegionalClimateHistory';
import ArticlesCarousel from '../components/ArticlesCarousel';
import PhenologyPanel from '../components/phenology/PhenologyPanel';
import SprayProgramPanel from '../components/spray/SprayProgramPanel';
import HelpTip from '../components/HelpTip';
import { Link } from 'react-router'
import { Grape, ChartArea, User, Sprout, Bug, Lightbulb, ShieldCheck, Users, LibraryBig, CloudSunRain, ChartSpline, MapPinned, Droplets} from "lucide-react"
import './Insights.css';

// Insight pill cards, in display order.
const INSIGHT_CARDS = [
  { key: 'climate', label: 'Climate History', Icon: ChartArea },
  { key: 'climateprojection', label: 'Climate Projections', Icon: ChartSpline },
  { key: 'currentseason', label: 'Current Season', Icon: CloudSunRain },
  { key: 'phenology', label: 'Phenology', Icon: Grape },
  { key: 'sprayprogram', label: 'Spray Program', Icon: Droplets },
  { key: 'disease', label: 'Disease', Icon: ShieldCheck },
  { key: 'biosecurity', label: 'Biosecurity', Icon: Bug },
  { key: 'industry', label: 'Latest Industry Insight', Icon: Bug },
];


function Insights() {
  const {user } = useAuth();
  const [stats, setStats] = useState(null);
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeInsight, setActiveInsight] = useState(null);
  const [properties, setProperties] = useState([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState('');

  // Load properties
  useEffect(() => {
    propertyService.listProperties()
      .then(data => setProperties(Array.isArray(data) ? data : []))
      .catch(() => setProperties([]));
  }, []);

  const selectedProperty = properties.find(p => String(p.id) === selectedPropertyId) || null;
 
  // Fetch company data and stats
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // Get company data if not already in user object
        let companyData = user?.company;
        if (!companyData && user?.company_id) {
          const response = await companiesService.getCompanyById(user.company_id);
          companyData = response;
        } else if (!companyData) {
          try {
            const response = await companiesService.getCurrentCompany();
            companyData = response;
          } catch (err) {
            console.error('Error fetching company:', err);
          }
        }
        setCompany(companyData);
        
        // Get stats
        const statsData = await companiesService.getCurrentCompanyStats();
        setStats(statsData);
       
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };

    if (user) {
      fetchData();
    }
  }, [user]);
  
  // Handle insight card clicks
  const handleInsightClick = (insightType) => {
    // Toggle the insight - if same type clicked, close it
    setActiveInsight(activeInsight === insightType ? null : insightType);
  };

  // Render the active insight component
  const renderActiveInsight = () => {
    switch (activeInsight) {
      case 'climate':
        return (
          <div className="content-container">
            <div className="container-title">
              <span className="help-tip-head"><span>Climate History</span><HelpTip topic="insights.climate" /></span>

              <button
                className="close-insight-btn"
                onClick={() => setActiveInsight(null)}
                aria-label="Close Climate History"
              >
                ×
              </button>
            </div>
            <RegionalClimateHistory properties={properties} />
          </div>
        );
      case 'phenology':
        return (
          <div className="content-container">
            <div className="container-title">
              <span className="help-tip-head"><span>Phenology Analysis</span><HelpTip topic="insights.phenology" /></span>
              <button 
                className="close-insight-btn"
                onClick={() => setActiveInsight(null)}
                aria-label="Close Phenology Analysis"
              >
                ×
              </button>
            </div>
            <PhenologyPanel />
          </div>
        );
      case 'climateprojection':
        return (
          <div className="content-container">
            <div className="container-title">
              <span className="help-tip-head"><span>Climate Projections</span><HelpTip topic="insights.climateprojection" /></span>
              <button 
                className="close-insight-btn"
                onClick={() => setActiveInsight(null)}
                aria-label="Close Climate Analysis"
              >
                ×
              </button>
            </div>
            <div className="insight-placeholder">
              <p>Climate Projections coming soon...</p>
              <p>This will show various climate change model projections based on historical climate data.</p>
            </div>
          </div>
        );
      case 'currentseason':
        return (
          <div className="content-container">
            <div className="container-title">
              <span className="help-tip-head"><span>Current Season Climate{selectedProperty ? ` — ${selectedProperty.name}` : ''}</span><HelpTip topic="insights.currentseason" /></span>
              <button
                className="close-insight-btn"
                onClick={() => setActiveInsight(null)}
                aria-label="Close Climate Analysis"
              >
                ×
              </button>
            </div>
            <div className="insight-placeholder">
              {selectedProperty ? (
                <>
                  <p>Current season data for <strong>{selectedProperty.name}</strong></p>
                  <p>Property-level climate intelligence will show: weather station data (if available), GDD accumulation vs baseline, disease pressure, and phenology estimates specific to this property's blocks.</p>
                  {!selectedProperty.climate_zone_id && (
                    <p style={{ color: 'var(--color-warning)' }}>Set a climate zone for this property in Manage → Weather to enable regional fallback data.</p>
                  )}
                </>
              ) : (
                <>
                  <p>Current Season Climate Analysis coming soon...</p>
                  <p>Select a property above for property-level insights, or view company-wide data here. This will show climate data based on modelled and Harvest API data.</p>
                </>
              )}
            </div>
          </div>
        );
      case 'sprayprogram':
        return (
          <div className="content-container">
            <div className="container-title">
              <span className="help-tip-head"><span>Spray Program{selectedProperty ? ` — ${selectedProperty.name}` : ''}</span><HelpTip topic="insights.sprayprogram" /></span>
              <button
                className="close-insight-btn"
                onClick={() => setActiveInsight(null)}
                aria-label="Close Spray Program"
              >
                ×
              </button>
            </div>
            <SprayProgramPanel selectedPropertyId={selectedPropertyId} />
          </div>
        );
      case 'disease':
        return (
          <div className="content-container">
            <div className="container-title">
              <span className="help-tip-head"><span>Disease Risk Analysis</span><HelpTip topic="insights.disease" /></span>
              <button 
                className="close-insight-btn"
                onClick={() => setActiveInsight(null)}
                aria-label="Close Disease Analysis"
              >
                ×
              </button>
            </div>
            <div className="insight-placeholder">
              <p>Disease risk analysis coming soon...</p>
              <p>This will show powdery mildew, downy mildew, and botrytis risk based on weather conditions and historical patterns.</p>
            </div>
          </div>
        );
      case 'biosecurity':
        return (
          <div className="content-container">
            <div className="container-title">
              <span className="help-tip-head"><span>Biosecurity Monitoring</span><HelpTip topic="insights.biosecurity" /></span>
              <button 
                className="close-insight-btn"
                onClick={() => setActiveInsight(null)}
                aria-label="Close Biosecurity Analysis"
              >
                ×
              </button>
            </div>
            <div className="insight-placeholder">
              <p>Biosecurity monitoring coming soon...</p>
              <p>This will show pest pressure monitoring, beneficial insect tracking, and integrated pest management recommendations.</p>
            </div>
          </div>
        );
        case 'industry':
        return (
          <div className="content-container">
            <div className="container-title">
              <span className="help-tip-head"><span>Industry Insights</span><HelpTip topic="insights.industry" /></span>
              <button 
                className="close-insight-btn"
                onClick={() => setActiveInsight(null)}
                aria-label="Close Biosecurity Analysis"
              >
                ×
              </button>
            </div>
            <ArticlesCarousel title={null} />
          </div>
        );
      default:
        return null;
    }
  };
  useEffect(() => {
    document.body.classList.add("primary-bg");
    
    return () => {
      document.body.classList.remove("primary-bg");
    };
  }, []);
  
  return (
    <div className="page-container">
      <div className="insights-page">

        <div className="insights-header">
          <div className="insights-title-row">
            <Lightbulb size={24} />
            <h1 className="section-title">
              {selectedProperty ? selectedProperty.name : (company?.name || 'Your Company')} — Insights
            </h1>
          </div>

          {properties.length > 0 && (
            <div className="insights-toolbar">
              <MapPinned size={18} style={{ color: 'var(--color-primary)' }} />
              <select
                className="insights-property-select"
                value={selectedPropertyId}
                onChange={(e) => setSelectedPropertyId(e.target.value)}
              >
                <option value="">All Properties (Company Level)</option>
                {properties.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name}{p.region ? ` — ${p.region}` : ''}
                  </option>
                ))}
              </select>
              {selectedProperty && selectedProperty.climate_zone_id && (
                <span className="insights-zone-tag">Climate zone assigned</span>
              )}
            </div>
          )}
        </div>

        <div className="insights-pills">
          {INSIGHT_CARDS.map(({ key, label, Icon }) => (
            <button
              key={key}
              className={`insight-pill ${activeInsight === key ? 'active' : ''}`}
              onClick={() => handleInsightClick(key)}
            >
              <Icon size={16} />
              <span>{label}</span>
            </button>
          ))}
        </div>

        {/* Dynamic Insight Component */}
        {renderActiveInsight()}

      </div>
      <MobileNavigation />
    </div>
  );
}

export default Insights;