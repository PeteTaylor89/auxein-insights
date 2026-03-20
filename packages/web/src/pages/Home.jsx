// src/pages/Home.jsx
import { useEffect, useState } from 'react';
import { useAuth } from '@vineyard/shared';
import { companiesService, tasksService, notificationService, api } from '@vineyard/shared';
import WeatherWidget from '../components/widgets/WeatherWidget';
import { Link } from 'react-router-dom';
import { User, Users, ClipboardList, Calendar, Shield, Map, Zap, Eye, BarChart3, Bell } from "lucide-react";

const INSIGHTS_URL = import.meta.env.VITE_INSIGHTS_URL || '';

function Home() {
  const { user, userTypeRole } = useAuth();
  const [stats, setStats] = useState(null);
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  const [weatherLocation, setWeatherLocation] = useState(null);
  const [latestArticles, setLatestArticles] = useState([]);
  const [upcomingTasks, setUpcomingTasks] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

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

        try {
          const blocksResponse = await api.get('/blocks/company');
          const blocks = blocksResponse.data.blocks || [];

          let location = null;
          if (blocks.length > 0 && blocks[0].centroid_latitude && blocks[0].centroid_longitude) {
            location = {
              lat: blocks[0].centroid_latitude,
              lon: blocks[0].centroid_longitude,
              name: `${blocks[0].block_name} Vineyard`
            };
          }
          setWeatherLocation(location);
        } catch (error) {
          console.error('Error fetching blocks for weather location:', error);
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

  // Fetch upcoming tasks and notification count
  useEffect(() => {
    if (!user) return;
    tasksService.getMyTasks?.({ status: 'scheduled', limit: 3 })
      .then((data) => {
        const tasks = Array.isArray(data) ? data : data?.items || data?.tasks || [];
        setUpcomingTasks(tasks.slice(0, 3));
      })
      .catch(() => {});
    notificationService.getUnreadCount()
      .then((data) => setUnreadCount(data.count ?? 0))
      .catch(() => {});
  }, [user]);

  return (
    <div className="home-page">
      {/* Welcome banner */}
      <div className="home-welcome">
        <h2 className="home-welcome-title">
          Welcome back{user?.first_name ? `, ${user.first_name}` : ''}.
        </h2>
      </div>

      <div className="home-content">
        {/* Company Stats */}
        <div className="stats-container">
          <div className="container-title">
            <span>{company?.name || 'Your Company'}</span>
          </div>
          <div className="stats-grid">
            <Link to="/Maps" className="stat-card">
              <div className="stat-value">{stats?.block_count || '0'}</div>
              <div className="stat-label">Vineyard Blocks</div>
            </Link>
            <Link to="/observations" className="stat-card">
              <div className="stat-value">{stats?.observation_count || '0'}</div>
              <div className="stat-label">Observations</div>
            </Link>
            <Link to="/observations" className="stat-card" onClick={() => { /* switches to tasks tab */ }}>
              <div className="stat-value">{stats?.task_count || '0'}</div>
              <div className="stat-label">Tasks</div>
            </Link>
            <div className="stat-card">
              <div className="stat-value">{stats?.user_count || '0'}</div>
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
              <Link to="/maps-v2" className="stat-card">
                <div className="icon-wrapper"><Map size={24} /></div>
                <div className="actions-title">Maps V2</div>
              </Link>
              {userTypeRole === 'auxein_admin' && (
                <Link to="/admin" className="stat-card">
                  <div className="icon-wrapper"><Shield size={24} /></div>
                  <div className="actions-title">System Admin</div>
                </Link>
              )}
            </div>
          </div>

          <div className="content-container weather-container column-item">
            <WeatherWidget location={weatherLocation} />
          </div>

        </div>

        {/* Upcoming */}
        <div className="stats-container upcoming-section">
          <div className="container-title">
            <span>Upcoming</span>
            {unreadCount > 0 && (
              <Link to="/notifications" className="badge badge--accent" style={{ textDecoration: 'none' }}>
                <Bell size={12} /> {unreadCount} notification{unreadCount !== 1 ? 's' : ''}
              </Link>
            )}
          </div>
          <ul className="upcoming-list">
            {upcomingTasks.length > 0 ? (
              upcomingTasks.map((task) => (
                <li key={task.id} className="upcoming-item">
                  <div className="upcoming-icon"><ClipboardList size={18} /></div>
                  <div className="upcoming-details">
                    <div className="upcoming-title">{task.title || task.task_number}</div>
                    <div className="upcoming-meta">
                      {task.scheduled_start_date
                        ? new Date(task.scheduled_start_date).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })
                        : 'No date'
                      }
                      {task.status && ` — ${task.status.replace('_', ' ')}`}
                    </div>
                  </div>
                </li>
              ))
            ) : (
              <li className="upcoming-item">
                <div className="upcoming-icon"><ClipboardList size={18} /></div>
                <div className="upcoming-details">
                  <div className="upcoming-title">No upcoming tasks</div>
                  <div className="upcoming-meta">Scheduled tasks will appear here</div>
                </div>
              </li>
            )}
            <li className="upcoming-item">
              <Link to="/calendar" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', textDecoration: 'none', color: 'inherit' }}>
                <div className="upcoming-icon"><Calendar size={18} /></div>
                <div className="upcoming-details">
                  <div className="upcoming-title" style={{ color: 'var(--color-primary)' }}>View full calendar</div>
                  <div className="upcoming-meta">Tasks, observations, maintenance & more</div>
                </div>
              </Link>
            </li>
          </ul>
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
    </div>
  );
}

export default Home;
