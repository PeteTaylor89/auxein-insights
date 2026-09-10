// src/pages/Insights.jsx - Updated with Interactive Insights
import { useEffect, useState } from 'react';
import MobileNavigation from '../components/MobileNavigation';
import { useAuth } from '@vineyard/shared';
import {companiesService, propertyService} from '@vineyard/shared';
import RegionalClimateHistory from '../components/climate/RegionalClimateHistory';
import ArticlesCarousel from '../components/ArticlesCarousel';
import ThisSeasonPanel from '../components/season/ThisSeasonPanel';
import SprayProgramPanel from '../components/spray/SprayProgramPanel';
import HelpTip from '../components/HelpTip';
import ReportsPanel from '../components/reports/ReportsPanel';
import { Link, useSearchParams } from 'react-router'
import { Grape, ChartArea, User, Sprout, Bug, Lightbulb, ShieldCheck, Users, LibraryBig, CloudSunRain, ChartSpline, MapPinned, Droplets, FileText} from "lucide-react"
import './Insights.css';

// Insight pill cards, in display order.
const INSIGHT_CARDS = [
  // `permission` gates the pill. Reports aggregate labour, incidents and who
  // was on site, so they stop at manager — the backend refuses anyone else
  // and a pill that only ever 403s is worse than no pill.
  { key: 'reports', label: 'Reports', Icon: FileText, permission: ['reports', 'read'] },
  { key: 'climate', label: 'Climate History', Icon: ChartArea },
  { key: 'climateprojection', label: 'Climate Projections', Icon: ChartSpline },
  // Weather, disease and phenology are one question about one property, so
  // they are one card with three sections rather than three pills that each
  // answered part of it — two of which were placeholders and one of which
  // rendered mock data. `currentseason`, `phenology` and `disease` are kept as
  // deep-link ALIASES below so existing links still land somewhere sensible.
  { key: 'thisseason', label: 'This Season', Icon: CloudSunRain },
  { key: 'sprayprogram', label: 'Spray Program', Icon: Droplets },
  { key: 'biosecurity', label: 'Biosecurity', Icon: Bug },
  { key: 'industry', label: 'Latest Industry Insight', Icon: Bug },
];


function Insights() {
  // hasPermission comes from the auth context, NOT the standalone helper in
  // shared/utils. The context binds it to `userTypeRole` — the 5-tier
  // permission key — whereas the profile object's own fields are the routing
  // key, so passing `user.user_type` to the standalone version silently returns
  // false for everyone and the gated card never appears.
  const { user, hasPermission } = useAuth();
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

  // Deep links from elsewhere in Grow. The observation management page sends
  // a run here with `?insight=reports&report=counts&metric=bud_count`; before
  // this the page read NOTHING off the URL and every such link landed on the
  // bare pill grid, which is indistinguishable from a broken link.
  //
  // Only opens a card the user can actually see, so a link forwarded to someone
  // without the permission degrades to the normal page instead of an empty
  // panel or a 403.
  const [searchParams] = useSearchParams();
  const requestedInsight = searchParams.get('insight');
  const requestedReport = searchParams.get('report');
  const requestedMetric = searchParams.get('metric');

  useEffect(() => {
    if (!requestedInsight) return;
    const allowed = INSIGHT_CARDS.find(
      (c) => c.key === requestedInsight
        && (!c.permission || hasPermission(c.permission[0], c.permission[1])),
    );
    if (allowed) setActiveInsight(requestedInsight);
    // hasPermission is stable via useCallback in the auth context.
  }, [requestedInsight, hasPermission]);

  const selectedProperty = properties.find(p => String(p.id) === selectedPropertyId) || null;

  // A card with no `permission` is open to anyone who can reach the page.
  const visibleCards = INSIGHT_CARDS.filter(
    (c) => !c.permission || hasPermission(c.permission[0], c.permission[1]),
  );
 
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
      case 'reports':
        return (
          <div className="content-container">
            <div className="container-title">
              <span className="help-tip-head"><span>Reports</span></span>
              <button
                className="close-insight-btn"
                onClick={() => setActiveInsight(null)}
                aria-label="Close Reports"
              >
                ×
              </button>
            </div>
            <ReportsPanel
              companyName={company?.name}
              initialReport={requestedReport}
              initialMetric={requestedMetric}
            />
          </div>
        );
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
      // The three legacy keys fall through to the same panel. A link someone
      // saved to ?insight=phenology has to land on the phenology it names, not
      // on an empty grid — and the panel opens on the matching section.
      case 'thisseason':
      case 'currentseason':
      case 'phenology':
      case 'disease':
        return (
          <div className="content-container">
            <div className="container-title">
              <span className="help-tip-head"><span>This Season{selectedProperty ? ` — ${selectedProperty.name}` : ''}</span><HelpTip topic="insights.currentseason" /></span>
              <button
                className="close-insight-btn"
                onClick={() => setActiveInsight(null)}
                aria-label="Close This Season"
              >
                ×
              </button>
            </div>
            <ThisSeasonPanel
              selectedPropertyId={selectedPropertyId}
              selectedProperty={selectedProperty}
              initialSection={
                activeInsight === 'phenology' ? 'phenology'
                  : activeInsight === 'disease' ? 'disease'
                    : 'weather'
              }
            />
          </div>
        );
      case 'sprayprogram':
        return (
          <div className="content-container">
            <div className="container-title">
              <span className="help-tip-head"><span>Spray Program{selectedProperty ? ` â€” ${selectedProperty.name}` : ''}</span><HelpTip topic="insights.sprayprogram" /></span>
              <button
                className="close-insight-btn"
                onClick={() => setActiveInsight(null)}
                aria-label="Close Spray Program"
              >
                Ã—
              </button>
            </div>
            <SprayProgramPanel selectedPropertyId={selectedPropertyId} />
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
          {visibleCards.map(({ key, label, Icon }) => (
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