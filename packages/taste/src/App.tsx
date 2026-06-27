import { useEffect } from 'react';
import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { seedBuiltins } from './templates/seed';
import { seedGeo } from './templates/geo-seed';
import { startAutoSync } from './sync/controller';
import {
  CaptureScreen,
  EventsScreen,
  FlightsScreen,
  HomeScreen,
  SettingsScreen,
  StatsScreen,
  TemplatesScreen,
  WinesScreen,
} from './screens';

// Primary nav (bottom bar, touch-first): 4 tabs around a center capture FAB.
// Events / Grids / Settings live on Home (the hub), not the bar.
const NAV_LEFT: { to: string; label: string }[] = [
  { to: '/home', label: 'Home' },
  { to: '/wines', label: 'Wines' },
];
const NAV_RIGHT: { to: string; label: string }[] = [
  { to: '/flights', label: 'Flights' },
  { to: '/stats', label: 'Insights' },
];

export default function App() {
  const navigate = useNavigate();

  // Seed builtin templates (CMS deductive grid) + geo reference tree on first run.
  useEffect(() => {
    void seedBuiltins();
    void seedGeo();
    startAutoSync(); // opportunistic cloud sync (no-op until signed in)
  }, []);

  return (
    <div className="app-shell">
      <header className="app-header">
        <span className="app-mark">Auxein</span>
        <span className="app-mark-sub">Taste</span>
      </header>

      <main className="app-main">
        <Routes>
          <Route path="/" element={<Navigate to="/home" replace />} />
          <Route path="/home" element={<HomeScreen />} />
          <Route path="/capture" element={<CaptureScreen />} />
          <Route path="/flights" element={<FlightsScreen />} />
          <Route path="/events" element={<EventsScreen />} />
          <Route path="/wines" element={<WinesScreen />} />
          <Route path="/stats" element={<StatsScreen />} />
          <Route path="/templates" element={<TemplatesScreen />} />
          <Route path="/settings" element={<SettingsScreen />} />
          <Route path="*" element={<Navigate to="/home" replace />} />
        </Routes>
      </main>

      <nav className="app-nav">
        {NAV_LEFT.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => (isActive ? 'nav-item nav-item--active' : 'nav-item')}
          >
            {item.label}
          </NavLink>
        ))}
        <button className="nav-fab" aria-label="New tasting" onClick={() => navigate('/capture', { state: { mode: 'quick' } })}>
          +
        </button>
        {NAV_RIGHT.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => (isActive ? 'nav-item nav-item--active' : 'nav-item')}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
