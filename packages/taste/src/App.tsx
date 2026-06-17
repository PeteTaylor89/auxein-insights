import { useEffect } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { seedBuiltins } from './templates/seed';
import { seedGeo } from './templates/geo-seed';
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

// Primary nav (bottom bar, touch-first). Capture is reached via Home/flights,
// not a tab; Stats is reached from Home/Settings (P6 placeholder).
const NAV: { to: string; label: string }[] = [
  { to: '/home', label: 'Home' },
  { to: '/wines', label: 'Wines' },
  { to: '/events', label: 'Events' },
  { to: '/flights', label: 'Flights' },
  { to: '/templates', label: 'Grids' },
  { to: '/settings', label: 'Settings' },
];

export default function App() {
  // Seed builtin templates (CMS deductive grid) + geo reference tree on first run.
  useEffect(() => {
    void seedBuiltins();
    void seedGeo();
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
        {NAV.map((item) => (
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
