// src/pages/Home.jsx
import { useEffect, useState } from 'react';
import { useAuth } from '@vineyard/shared';
import { companiesService, propertyService, api } from '@vineyard/shared';
import WeatherWidget from '../components/widgets/WeatherWidget';
import SiteBanner from '../components/SiteBanner';
import FeedbackModal from '../components/FeedbackModal';
import ArticlesCarousel from '../components/ArticlesCarousel';
import { Link } from 'react-router-dom';
import { Calendar, Shield, Map, Zap, Eye, BarChart3, MessageSquare, ClipboardCheck } from "lucide-react";

function Home() {
  // The CONTEXT's hasPermission — it is bound to the 5-tier userTypeRole. The
  // standalone helper takes the ROUTING key and answers false for everyone.
  const { user, userTypeRole, hasPermission } = useAuth();
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  const [weatherLocations, setWeatherLocations] = useState([]); // [{id, name, lat, lon}]
  const [selectedWeatherId, setSelectedWeatherId] = useState(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  // Derived: the location object passed to WeatherWidget
  const weatherLocation = weatherLocations.find(l => l.id === selectedWeatherId) || weatherLocations[0] || null;

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);

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

        // Weather locations: every property with a forecast point, plus a block-centroid fallback
        try {
          const locations = [];

          try {
            const props = await propertyService.listProperties();
            const propList = Array.isArray(props) ? props : [];

            // Include every property that has a forecast point
            for (const p of propList) {
              if (p.forecast_latitude && p.forecast_longitude) {
                locations.push({
                  id: `prop-${p.id}`,
                  name: p.name,
                  lat: parseFloat(p.forecast_latitude),
                  lon: parseFloat(p.forecast_longitude),
                });
              }
            }

            // If no property had a forecast point, fall back to first block centroid
            if (locations.length === 0 && propList.length > 0) {
              const blocksResponse = await api.get('/blocks/company');
              const blocks = blocksResponse.data.blocks || [];
              if (blocks.length > 0 && blocks[0].centroid_latitude && blocks[0].centroid_longitude) {
                locations.push({
                  id: `prop-${propList[0].id}`,
                  name: propList[0].name,
                  lat: blocks[0].centroid_latitude,
                  lon: blocks[0].centroid_longitude,
                });
              }
            }
          } catch {
            // Properties not available — fall back to first block centroid
            const blocksResponse = await api.get('/blocks/company');
            const blocks = blocksResponse.data.blocks || [];
            if (blocks.length > 0 && blocks[0].centroid_latitude && blocks[0].centroid_longitude) {
              locations.push({
                id: `block-${blocks[0].id || 0}`,
                name: `${blocks[0].block_name} Vineyard`,
                lat: blocks[0].centroid_latitude,
                lon: blocks[0].centroid_longitude,
              });
            }
          }

          setWeatherLocations(locations);
          if (locations.length > 0) setSelectedWeatherId(locations[0].id);
        } catch (error) {
          console.error('Error fetching weather location:', error);
        }

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


  return (
    <div className="home-page">
      <SiteBanner />
      {/* The company stats grid — blocks, observations, tasks, team members —
          used to sit here. Four counts that never changed between visits are
          not what someone opens the app to find out, and they pushed the things
          people actually came for below the fold. The company name stays: this
          is a multi-tenant app and which company you are in still matters. */}
      <div className="home-welcome">
        {/* Held blank rather than defaulted while the company loads — flashing
            "Your Company" and then the real name reads as a wrong answer being
            corrected. The nbsp keeps the line height so nothing jumps. */}
        <h1 className="home-welcome-title">
          {loading ? '\u00a0' : (company?.name || 'Your Company')}
        </h1>
      </div>

      <div className="home-content">
        <div className="two-column-section">

          <div className="stats-container column-item">
            <div className="container-title">
              <span>Quick Actions</span>
            </div>
            <div className="stats-grid">
              <Link to="/tasks/new" className="stat-card">
                <div className="icon-wrapper"><Zap size={24} /></div>
                <div className="actions-title">New Task</div>
              </Link>
              <Link to="/observations/quick" className="stat-card">
                <div className="icon-wrapper"><Eye size={24} /></div>
                <div className="actions-title">Quick Observation</div>
              </Link>
              <Link to="/calendar" className="stat-card">
                <div className="icon-wrapper"><Calendar size={24} /></div>
                <div className="actions-title">Calendar</div>
              </Link>
              <Link to="/Insights" className="stat-card">
                <div className="icon-wrapper"><BarChart3 size={24} /></div>
                <div className="actions-title">Reports</div>
              </Link>
              {/* Straight to the register rather than to Reports and then two
                  clicks. Hidden without `reports:read`, because a shortcut that
                  lands on a different report than the one it names is worse
                  than no shortcut. */}
              {hasPermission('reports', 'read') && (
                <Link to="/Insights?insight=reports&report=site-access" className="stat-card">
                  <div className="icon-wrapper"><ClipboardCheck size={24} /></div>
                  <div className="actions-title">Site Access</div>
                </Link>
              )}
              <Link to="/maps" className="stat-card">
                <div className="icon-wrapper"><Map size={24} /></div>
                <div className="actions-title">Map</div>
              </Link>
              <button
                type="button"
                className="stat-card stat-card--button"
                onClick={() => setFeedbackOpen(true)}
              >
                <div className="icon-wrapper"><MessageSquare size={24} /></div>
                <div className="actions-title">Submit Feedback</div>
              </button>
              {userTypeRole === 'auxein_admin' && (
                <Link to="/admin" className="stat-card">
                  <div className="icon-wrapper"><Shield size={24} /></div>
                  <div className="actions-title">System Admin</div>
                </Link>
              )}
            </div>
          </div>

          <div className="content-container weather-container column-item">
            {weatherLocations.length > 1 && (
              <div className="weather-property-selector">
                <label htmlFor="weather-prop-select">Forecast for</label>
                <select
                  id="weather-prop-select"
                  value={selectedWeatherId || ''}
                  onChange={(e) => setSelectedWeatherId(e.target.value)}
                >
                  {weatherLocations.map(loc => (
                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                  ))}
                </select>
              </div>
            )}
            <WeatherWidget location={weatherLocation} />
          </div>

        </div>

        {/* Latest Articles Carousel */}
        <ArticlesCarousel />
      </div>

      <FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </div>
  );
}

export default Home;
