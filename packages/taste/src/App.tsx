import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { isAuthed, purgeLegacyAuth, subscribeAuth } from './auth/tasteAuth';
import { SignInScreen } from './auth/SignInScreen';
import { ResetPasswordScreen, VerifyScreen } from './auth/EmailLinkScreens';
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
  const location = useLocation();

  // Server-backed: gate the app on sign-in (the only seed/reference data —
  // regions + the builtin grid — lives on the server, fetched on demand).
  const [authed, setAuthed] = useState(isAuthed());
  useEffect(() => subscribeAuth(() => setAuthed(isAuthed())), []);

  // F1: drop the Insights token this app used to store. It is not valid against
  // taste-api any more, and leaving it behind puts a returning user in a 401
  // loop instead of simply showing them the sign-in screen. Runs once.
  useEffect(() => {
    purgeLegacyAuth();
  }, []);

  // BEFORE the gate, deliberately. Both screens are reached from a link in an
  // email, opened in whatever browser handles mail — routinely not the one
  // holding the session. And the reset flow exists for people who cannot sign
  // in, so gating it on being signed in would make it useless.
  if (location.pathname === '/verify') return <VerifyScreen />;
  if (location.pathname === '/reset') return <ResetPasswordScreen />;

  if (!authed) return <SignInScreen />;

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
