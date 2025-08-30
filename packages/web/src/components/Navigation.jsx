// src/components/Navigation.jsx
import { Link } from 'react-router-dom';

function Navigation() {
  return (
    <nav className="main-nav">
      <div className="nav-logo">
        <Link to="/">Vineyard Management</Link>
      </div>
      <div className="nav-links">
        <Link to="/dashboard">Dashboard</Link>
        <Link to="/">Home</Link>
        <Link to="/login">Login</Link>
      </div>
    </nav>
  );
}

export default Navigation;