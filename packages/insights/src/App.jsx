// src/App.jsx - Auxein Regional Intelligence (Public)
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import About from './pages/About';

// Admin pages
import AdminDashboard from './pages/AdminDashboard';
import UserManagement from './pages/UserManagement';
import UserDetail from './pages/UserDetail';
import WeatherStatus from './pages/WeatherStatus';
import StationDetail from './pages/StationDetail';

// Auth
import { PublicAuthProvider } from './contexts/PublicAuthContext';
import AdminRoute from './components/AdminRoute';

function App() {
  return (
    <PublicAuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public routes - no authentication required */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/about" element={<About />} />
          
          {/* Admin routes - @auxein.co.nz only */}
          <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
          <Route path="/admin/users" element={<AdminRoute><UserManagement /></AdminRoute>} />
          <Route path="/admin/users/:id" element={<AdminRoute><UserDetail /></AdminRoute>} />
          <Route path="/admin/weather" element={<AdminRoute><WeatherStatus /></AdminRoute>} />
          <Route path="/admin/weather/:id" element={<AdminRoute><StationDetail /></AdminRoute>} />
          
          {/* Catch all route - redirect to home */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </PublicAuthProvider>
  );
}

export default App;