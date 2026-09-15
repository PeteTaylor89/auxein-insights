// src/components/AdminNav.jsx — the unified nav for both admin halves.
//
// Replaces the flat 12-item bar inherited from Insights, which had two problems:
// it was a single undifferentiated row, and below 768px `admin.css` simply
// `display: none`d it — there was no mobile navigation at all, just a brand and
// a dead "Exit Admin" link.
//
// Structure is three groups, and the grouping is load-bearing rather than
// cosmetic: "Banners" exists in BOTH Insights and Grow and they are different
// features against different backends (`admin_banners` vs `admin_grow_banners`).
// A flat list puts two identical words side by side; a grouped one makes the
// difference the first thing you read (plan §7.2).
//
// Uses its own `anav-*` class names rather than the old `.admin-nav-*` ones so
// the two cannot fight during the transition. The old rules in admin.css are
// now unused.
import { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, Building2, Cloud, Megaphone, FileText, BookOpen,
  Mail, Map, ShieldCheck, Activity, Sprout, MapPinned, Wrench, BarChart3,
  Menu, X, ChevronDown, LogOut, TrendingUp,
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

function groupIsActive(group, pathname) {
  return group.items.some((i) => isPathActive(i.path, pathname));
}

export default function AdminNav() {
  const location = useLocation();
  const { growUser, logout } = useAdminAuth();

  const [openGroup, setOpenGroup] = useState(null);   // desktop dropdown
  const [drawerOpen, setDrawerOpen] = useState(false); // mobile drawer
  const [userOpen, setUserOpen] = useState(false);
  const navRef = useRef(null);

  // Any navigation closes everything. Without this the dropdown stays open
  // over the page you just moved to.
  useEffect(() => {
    setOpenGroup(null);
    setDrawerOpen(false);
    setUserOpen(false);
  }, [location.pathname]);

  // Escape closes whatever is open, outermost first.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (drawerOpen) setDrawerOpen(false);
      else if (openGroup) setOpenGroup(null);
      else if (userOpen) setUserOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen, openGroup, userOpen]);

  // Click outside the bar closes the desktop menus.
  useEffect(() => {
    if (!openGroup && !userOpen) return undefined;
    const onDown = (e) => {
      if (navRef.current && !navRef.current.contains(e.target)) {
        setOpenGroup(null);
        setUserOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [openGroup, userOpen]);

  // The drawer is fixed and scrolls independently; letting the page behind it
  // scroll too is the classic mobile-drawer bug.
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
    <header className="anav" ref={navRef}>
      <div className="anav-bar">
        <Link to="/" className="anav-brand" aria-label="Auxein Admin, dashboard">
          <span className="anav-brand-name">Auxein</span>
          <span className="anav-brand-badge">Admin</span>
        </Link>

        {/* ── Desktop: grouped dropdowns ───────────────────────────── */}
        <nav className="anav-groups" aria-label="Main">
          {NAV_GROUPS.map((group) => {
            const GroupIcon = group.icon;
            const active = groupIsActive(group, location.pathname);
            const open = openGroup === group.id;
            return (
              <div className="anav-group" key={group.id}>
                <button
                  type="button"
                  className={`anav-group-button${active ? ' active' : ''}${open ? ' open' : ''}`}
                  aria-expanded={open}
                  aria-haspopup="true"
                  onClick={() => setOpenGroup(open ? null : group.id)}
                >
                  <GroupIcon size={16} />
                  <span>{group.label}</span>
                  <ChevronDown size={14} className="anav-chevron" />
                </button>

                {open && (
                  <div className="anav-menu" role="menu">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      return (
                        <Link
                          key={item.path}
                          to={item.path}
                          role="menuitem"
                          className={`anav-menu-item${isPathActive(item.path, location.pathname) ? ' active' : ''}`}
                        >
                          <Icon size={15} />
                          <span>{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="anav-right">
          {/* ── Desktop: identity + sign out ───────────────────────── */}
          <div className="anav-user">
            <button
              type="button"
              className="anav-user-button"
              aria-expanded={userOpen}
              aria-haspopup="true"
              onClick={() => setUserOpen((v) => !v)}
            >
              <span className="anav-avatar" aria-hidden="true">{initials}</span>
              <span className="anav-user-email">{email}</span>
              <ChevronDown size={14} className="anav-chevron" />
            </button>
            {userOpen && (
              <div className="anav-menu anav-menu-right" role="menu">
                <Link to="/session" role="menuitem" className="anav-menu-item">
                  <ShieldCheck size={15} />
                  <span>Session details</span>
                </Link>
                <button type="button" role="menuitem" className="anav-menu-item anav-danger" onClick={logout}>
                  <LogOut size={15} />
                  <span>Sign out</span>
                </button>
              </div>
            )}
          </div>

          {/* ── Mobile: drawer toggle ──────────────────────────────── */}
          <button
            type="button"
            className="anav-burger"
            aria-label={drawerOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen((v) => !v)}
          >
            {drawerOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* ── Mobile drawer ────────────────────────────────────────── */}
      {drawerOpen && (
        <>
          <div
            className="anav-scrim"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          <div className="anav-drawer" role="dialog" aria-modal="true" aria-label="Menu">
            <div className="anav-drawer-scroll">
              {NAV_GROUPS.map((group) => {
                const GroupIcon = group.icon;
                return (
                  <section className="anav-drawer-group" key={group.id}>
                    <h2 className="anav-drawer-heading">
                      <GroupIcon size={14} />
                      {group.label}
                    </h2>
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      return (
                        <Link
                          key={item.path}
                          to={item.path}
                          className={`anav-drawer-item${isPathActive(item.path, location.pathname) ? ' active' : ''}`}
                        >
                          <Icon size={17} />
                          <span>{item.label}</span>
                        </Link>
                      );
                    })}
                  </section>
                );
              })}
            </div>

            <div className="anav-drawer-foot">
              <div className="anav-drawer-user">
                <span className="anav-avatar" aria-hidden="true">{initials}</span>
                <span className="anav-drawer-email">{email}</span>
              </div>
              <button type="button" className="anav-drawer-signout" onClick={logout}>
                <LogOut size={16} />
                Sign out
              </button>
            </div>
          </div>
        </>
      )}
    </header>
  );
}
