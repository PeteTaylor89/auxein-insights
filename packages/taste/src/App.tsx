import { useEffect } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { seedBuiltins } from './templates/seed';
import { seedGeo } from './templates/geo-seed';
import {
  CaptureScreen,
  EventsScreen,
  FlightsScreen,
  SettingsScreen,
  StatsScreen,
  TemplatesScreen,
  WinesScreen,
} from './screens';

// Primary nav lives in a bottom bar (touch-first; thumb-reachable on phone/iPad).
const NAV: { to: string; label: string }[] = [
  { to: '/capture', label: 'Capture' },
  { to: '/flights', label: 'Flights' },
  { to: '/events', label: 'Events' },
  { to: '/wines', label: 'Wines' },
  { to: '/stats', label: 'Stats' },
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
          <Route path="/" element={<Navigate to="/capture" replace />} />
          <Route path="/capture" element={<CaptureScreen />} />
          <Route path="/flights" element={<FlightsScreen />} />
          <Route path="/events" element={<EventsScreen />} />
          <Route path="/wines" element={<WinesScreen />} />
          <Route path="/stats" element={<StatsScreen />} />
          <Route path="/templates" element={<TemplatesScreen />} />
          <Route path="/settings" element={<SettingsScreen />} />
          <Route path="*" element={<Navigate to="/capture" replace />} />
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
