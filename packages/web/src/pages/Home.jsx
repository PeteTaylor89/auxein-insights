// src/pages/Home.jsx
import { useEffect, useState } from 'react';
import { useAuth } from '@vineyard/shared';
import { companiesService, propertyService, api } from '@vineyard/shared';
import WeatherWidget from '../components/widgets/WeatherWidget';
import SiteBanner from '../components/SiteBanner';
import FeedbackModal from '../components/FeedbackModal';
import { Link } from 'react-router-dom';
import { Calendar, Shield, Map, Zap, Eye, BarChart3, MessageSquare } from "lucide-react";

const INSIGHTS_URL = import.meta.env.VITE_INSIGHTS_URL || 'https://insights.auxein.co.nz';

function Home() {
  const { user, userTypeRole } = useAuth();
  const [stats, setStats] = useState(null);
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  const [weatherLocations, setWeatherLocations] = useState([]); // [{id, name, lat, lon}]
  const [selectedWeatherId, setSelectedWeatherId] = useState(null);
  const [latestArticles, setLatestArticles] = useState([]);
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

        const statsData = await companiesService.getCurrentCompanyStats();
        setStats(statsData);

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

  // Fetch latest articles from public API
  useEffect(() => {
    api.get('/v1/public/articles', { params: { page: 1, page_size: 6 } })
      .then(res => setLatestArticles(res.data?.items || []))
      .catch(() => {});
  }, []);

  const renderStatValue = (value) => {
    if (loading) return <span className="stat-skeleton" aria-hidden="true" />;
    return value ?? 0;
  };

  return (
    <div className="home-page">
      <SiteBanner />
      <div className="home-content">
        {/* Company Stats */}
        <div className="stats-container">
          <div className="container-title">
            <span>{company?.name || 'Your Company'}</span>
          </div>
          <div className="stats-grid">
            <Link to="/maps" className="stat-card">
              <div className="stat-value">{renderStatValue(stats?.block_count)}</div>
              <div className="stat-label">Vineyard Blocks</div>
            </Link>
            <Link to="/observations" className="stat-card">
              <div className="stat-value">{renderStatValue(stats?.observation_count)}</div>
              <div className="stat-label">Observations</div>
            </Link>
            <Link to="/observations?tab=tasks" className="stat-card">
              <div className="stat-value">{renderStatValue(stats?.task_count)}</div>
              <div className="stat-label">Tasks</div>
            </Link>
            <div className="stat-card stat-card--static">
              <div className="stat-value">{renderStatValue(stats?.user_count)}</div>
              <div className="stat-label">Team Members</div>
            </div>
          </div>
        </div>

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
              <Link to="/reports" className="stat-card">
                <div className="icon-wrapper"><BarChart3 size={24} /></div>
                <div className="actions-title">Reports</div>
              </Link>
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
        {latestArticles.length > 0 && (
          <div className="articles-section">
            <div className="container-title">
              <span>Latest from Auxein Insights</span>
            </div>
            <div className="articles-carousel">
              <div className="articles-carousel-track">
                {latestArticles.map((article) => (
                  <a
                    key={article.id}
                    href={`${INSIGHTS_URL}/articles/${article.slug}`}
                    className="carousel-article-card"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {(article.thumbnail_url || article.featured_image_url) && (
                      <div className="carousel-card-image">
                        <img
                          src={article.thumbnail_url || article.featured_image_url}
                          alt={article.featured_image_alt || article.title}
                          loading="lazy"
                        />
                      </div>
                    )}
                    <div className="carousel-card-body">
                      {article.tags && article.tags.length > 0 && (
                        <div className="carousel-card-tags">
                          {article.tags.slice(0, 2).map((t) => (
                            <span key={t} className="carousel-tag">{t}</span>
                          ))}
                        </div>
                      )}
                      <h3 className="carousel-card-title">{article.title}</h3>
                      {article.excerpt && (
                        <p className="carousel-card-excerpt">{article.excerpt}</p>
                      )}
                      <span className="carousel-card-date">
                        {article.published_at
                          ? new Date(article.published_at).toLocaleDateString('en-NZ', {
                              day: 'numeric', month: 'short', year: 'numeric'
                            })
                          : ''}
                      </span>
                    </div>
                  </a>
                ))}
              </div>
            </div>
            <div className="articles-carousel-footer">
              <a
                href={`https://insights.auxein.co.nz/articles`}
                className="btn-ghost"
                target="_blank"
                rel="noopener noreferrer"
              >
                View all articles
              </a>
            </div>
          </div>
        )}
      </div>

      <FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </div>
  );
}

export default Home;
