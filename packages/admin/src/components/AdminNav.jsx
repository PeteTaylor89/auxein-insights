// src/components/AdminNav.jsx — the admin sidebar.
//
// WAS a top bar of click-to-open dropdowns. That put EVERY destination two
// clicks away, and because the menus opened on click rather than hover, even
// finding out what a group contained cost a click. For a tool used all day
// with eighteen destinations, that is the wrong shape: the nav should be a map
// you read, not a set of drawers you rummage through.
//
// Now a persistent left sidebar. Every item is visible and one click away, the
// grouping is a heading rather than a container to open, and the active item is
// obvious without hunting. The mobile drawer already worked this way — it
// listed everything flat under group headings — so this makes the desktop
// agree with the phone rather than the other way round.
//
// The grouping is still load-bearing, not decorative: "Banners" and "Users"
// each exist in BOTH Insights and Grow and are different features against
// different backends (`admin_banners` vs `admin_grow_banners`). Flat, those are
// pairs of identical words; grouped, the difference is the first thing read.
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, Building2, Cloud, Megaphone, FileText, BookOpen,
  Mail, Map, ShieldCheck, Activity, Sprout, MapPinned, Wrench, BarChart3,
  Menu, X, LogOut, TrendingUp, CalendarCheck, ListTodo, FolderKanban,
  Handshake,
} from 'lucide-react';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import './admin-nav.css';

export const NAV_GROUPS = [
  {
    id: 'insights',
    label: 'Insights',
    icon: BarChart3,
    items: [
      { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
      { path: '/kpis', icon: TrendingUp, label: 'Platform KPIs' },
      { path: '/users', icon: Users, label: 'Users' },
      { path: '/accounts', icon: Building2, label: 'Accounts' },
      { path: '/articles', icon: FileText, label: 'Articles' },
      { path: '/research', icon: BookOpen, label: 'Research' },
      { path: '/email', icon: Mail, label: 'Email' },
      { path: '/banners', icon: Megaphone, label: 'Banners' },
    ],
  },
  {
    id: 'data',
    label: 'Data',
    icon: Cloud,
    items: [
      { path: '/weather', icon: Cloud, label: 'Weather' },
      { path: '/weather/map', icon: Map, label: 'Station map' },
      { path: '/qc', icon: ShieldCheck, label: 'QC' },
      { path: '/jobs', icon: Activity, label: 'Jobs' },
    ],
  },
  {
    id: 'grow',
    label: 'Grow',
    icon: Sprout,
    items: [
      { path: '/grow/companies', icon: Building2, label: 'Companies' },
      { path: '/grow/users', icon: Users, label: 'Users' },
      { path: '/grow/properties', icon: MapPinned, label: 'Properties' },
      { path: '/grow/contractors', icon: Wrench, label: 'Contractors' },
      { path: '/grow/banners', icon: Megaphone, label: 'Banners' },
    ],
  },
  // Partner clients are neither Insights nor Grow — they are licensees of the
  // data both products sit on. Its own group because a row labelled "Partners"
  // under "Insights" reads as an Insights feature, which is the one thing it is
  // not.
  {
    id: 'partners',
    label: 'Partners',
    icon: Handshake,
    items: [
      { path: '/partners', icon: Handshake, label: 'Data API' },
    ],
  },
  // The only group that is not platform data. These rows belong to the signed-in
  // admin, scoped to the caller and invisible to any other admin.
  {
    id: 'planner',
    label: 'Planner',
    icon: CalendarCheck,
    items: [
      { path: '/planner', icon: ListTodo, label: 'My tasks' },
      { path: '/projects', icon: FolderKanban, label: 'Projects' },
    ],
  },
];

const ALL_PATHS = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.path));

/**
 * Longest-prefix match. `/weather` must not stay lit while `/weather/map` is
 * open, and `/` (the dashboard) must match only itself or it lights on
 * every page.
 */
export function isPathActive(itemPath, pathname) {
  if (itemPath === '/') return pathname === '/';
  if (!pathname.startsWith(itemPath)) return false;
  return !ALL_PATHS.some(
    (p) => p !== itemPath && p.startsWith(itemPath) && pathname.startsWith(p),
  );
}

export default function AdminNav() {
  const location = useLocation();
  const { growUser, logout } = useAdminAuth();

  // Only one piece of open/closed state left. The dropdowns are gone, so there
  // is no open-group, no click-outside handler and no user menu to close —
  // three sources of "it stayed open over the page I moved to" removed with it.
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => { setDrawerOpen(false); }, [location.pathname]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setDrawerOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // The drawer scrolls independently; letting the page behind it scroll too is
  // the classic mobile-drawer bug.
  useEffect(() => {
    if (!drawerOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [drawerOpen]);

  const email = growUser?.email || '';
  const initials = (growUser?.fullName || email || '?')
    .split(/[\s@.]+/).filter(Boolean).slice(0, 2)
    .map((s) => s[0]?.toUpperCase()).join('');

  return (
    <>
      {/* Mobile only: a slim bar carrying the brand and the drawer toggle. */}
      <header className="anav-topbar">
        <Link to="/" className="anav-brand">
          <span className="anav-brand-name">Auxein</span>
          <span className="anav-brand-badge">Admin</span>
        </Link>
        <button
          type="button"
          className="anav-burger"
          aria-label={drawerOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen((v) => !v)}
        >
          {drawerOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </header>

      {drawerOpen && (
        <div className="anav-scrim" onClick={() => setDrawerOpen(false)} aria-hidden="true" />
      )}

      <aside className={`anav${drawerOpen ? ' is-open' : ''}`} aria-label="Main">
        <Link to="/" className="anav-brand anav-brand-desktop">
          <span className="anav-brand-name">Auxein</span>
          <span className="anav-brand-badge">Admin</span>
        </Link>

        <nav className="anav-scroll">
          {NAV_GROUPS.map((group) => {
            const GroupIcon = group.icon;
            return (
              <section className="anav-group" key={group.id}>
                <h2 className="anav-heading">
                  <GroupIcon size={13} aria-hidden="true" />
                  {group.label}
                </h2>
                <ul>
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active = isPathActive(item.path, location.pathname);
                    return (
                      <li key={item.path}>
                        <Link
                          to={item.path}
                          className={`anav-item${active ? ' active' : ''}`}
                          aria-current={active ? 'page' : undefined}
                        >
                          <Icon size={16} aria-hidden="true" />
                          <span>{item.label}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </nav>

        <div className="anav-foot">
          <Link to="/session" className="anav-who">
            <span className="anav-avatar" aria-hidden="true">{initials}</span>
            <span className="anav-email" title={email}>{email}</span>
          </Link>
          <button type="button" className="anav-signout" onClick={logout}>
            <LogOut size={15} aria-hidden="true" />
            <span>Sign out</span>
          </button>
        </div>
      </aside>
    </>
  );
}
