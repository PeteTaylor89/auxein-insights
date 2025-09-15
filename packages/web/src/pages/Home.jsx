// src/pages/Home.jsx
import { useEffect, useState } from 'react';
import MobileNavigation from '../components/MobileNavigation';
import { useAuth } from '@vineyard/shared';
import { companiesService, api } from '@vineyard/shared';
import WeatherWidget from '../components/widgets/WeatherWidget'; 
import { Link } from 'react-router'
import { User, Lightbulb, Users, LibraryBig} from "lucide-react"


function Home() {
  const {user } = useAuth();
  const [stats, setStats] = useState(null);
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  const [weatherLocation, setWeatherLocation] = useState(null);
  
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

        // ADD THIS: Fetch vineyard blocks for weather location
        try {
          const blocksResponse = await api.get('/blocks/company');
          const blocks = blocksResponse.data.blocks || [];
          
          // If user has blocks, use the first one for weather location
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
  
  // Set body background color
  useEffect(() => {
    document.body.classList.add("primary-bg");
    
    return () => {
      document.body.classList.remove("primary-bg");
    };
  }, []);
  
  return (
    <div className="home-page">
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
            <Link to="/planobservation" className="stat-card">
              <div className="stat-value">{stats?.observation_count || '0'}</div>
              <div className="stat-label">Observations</div>
            </Link>
            <Link to="/listplan" className="stat-card">
              <div className="stat-value">{stats?.task_count || '0'}</div>
              <div className="stat-label">Tasks</div>
            </Link>
            <div className="stat-card">
              <div className="stat-value">{stats?.user_count || '0'}</div>
              <div className="stat-label">Team Members</div>
            </div>
          </div>
        </div>

        <div className="stats-container">
          <div className="container-title">
            <span>Observation Links</span>
          </div>
          <div className="stats-grid">
            <Link to="/planobservation" className="stat-card">
              <div className="stat-value">{stats?.block_count || '0'}</div>
              <div className="stat-label"> Plan Observation</div>
            </Link>
            <Link to="/listplan" className="stat-card">
              <div className="stat-value">{stats?.observation_count || '0'}</div>
              <div className="stat-label">List Planned Obs</div>
            </Link>
            <Link to="/plandetail/:id" className="stat-card">
              <div className="stat-value">{stats?.task_count || '0'}</div>
              <div className="stat-label">Obs Plan Details</div>
            </Link>
            <div className="stat-card">
              <div className="stat-value">{stats?.user_count || '0'}</div>
              <div className="stat-label">Team Members</div>
            </div>
          </div>
        </div>

        <div className="stats-container">
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
            <Link to="/training" className="stat-card">
              <div className="icon-wrapper"><LibraryBig /></div>
              <div className="actions-title">Training</div>
            </Link>
            <Link to="/timesheets" className="stat-card">
              <div className="icon-wrapper"><Lightbulb /></div>
              <div className="actions-title">Timesheets</div>
            </Link>
          </div>
        </div>
        
        <div className="content-container weather-container">
          <WeatherWidget location={weatherLocation} />
        </div>       

      </div>
      <MobileNavigation />
    </div>
  );
}

export default Home;