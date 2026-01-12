// src/pages/Home.jsx
import { useEffect, useState } from 'react';
import MobileNavigation from '../components/MobileNavigation';
import { useAuth } from '@vineyard/shared';
import { companiesService, api } from '@vineyard/shared';
import WeatherWidget from '../components/widgets/WeatherWidget'; 
import { Link } from 'react-router';
import { User, Users } from "lucide-react";
import Logo from '../assets/App_Logo_September 2025.jpg'; 

function Home() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  const [weatherLocation, setWeatherLocation] = useState(null);
  
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
  

  
  return (
    <div className="home-page">
      {/* Top bar with logo + title */}
      <header className="home-header">
        <div className="home-brand">
          <img src={Logo} alt="Auxein Logo" className="home-logo" />
          <div className="home-title-block">
            <h1 className="home-title">Auxein Insights</h1>
            <p className="home-subtitle">
              Welcome back{user?.first_name ? `, ${user.first_name}` : ''}.
            </p>
          </div>
        </div>
      </header>
      
      <div className="home-content">
        {/* Quick Stats Row */}
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
            <Link to="/observations" className="stat-card">
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
              <Link to="/admin/visitors" className="stat-card">
                <div className="icon-wrapper"><Users /></div>
                <div className="actions-title">Visitor Log</div>
              </Link>
              <Link to="/visitors" className="stat-card">
                <div className="icon-wrapper"><User /></div>
                <div className="actions-title">Register Visitor</div>
              </Link>
            </div>
          </div>

          <div className="content-container weather-container column-item">
            <WeatherWidget location={weatherLocation} />
          </div>

        </div>       
      </div>

      <MobileNavigation />
    </div>
  );
}

export default Home;
