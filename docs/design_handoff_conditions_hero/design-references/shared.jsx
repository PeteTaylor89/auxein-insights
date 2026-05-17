// shared.jsx — shared chrome (header, property pill, FAB, tab bar) for all 4 hero variants

// ─────────────────────────────────────────────────────────────
// Olive brand header — matches HomeScreen.js exactly
// (height ≈ status-bar inset + 56pt content)
// ─────────────────────────────────────────────────────────────
function BrandHeader({ wordmark = 'Auxein Grow', unread = 3, dark = true, transparent = false }) {
  return (
    <div style={{
      paddingTop: 8, paddingBottom: 12, paddingLeft: 16, paddingRight: 16,
      background: transparent ? 'transparent' : AX.olive,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <LogoMark size={28} color="#fff" />
        <div style={{
          color: '#fff', fontFamily: TYPE.display, fontWeight: 700,
          fontSize: 18, letterSpacing: 0.3,
        }}>{wordmark}</div>
      </div>
      <div style={{
        position: 'relative', width: 40, height: 40, borderRadius: 8,
        background: 'rgba(255,255,255,0.12)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon name="bell" size={20} color="#fff" />
        {unread > 0 && (
          <div style={{
            position: 'absolute', top: -4, right: -4,
            background: AX.danger, color: '#fff', fontSize: 10, fontWeight: 700,
            borderRadius: 10, padding: '1px 5px', minWidth: 18, textAlign: 'center',
            border: `1.5px solid ${transparent ? 'transparent' : AX.olive}`,
            lineHeight: '14px',
          }}>{unread > 99 ? '99+' : unread}</div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Property switcher pill + on-site chip — verbatim from HomeScreen.js
// ─────────────────────────────────────────────────────────────
function ContextBar({ property = 'Marlborough Estate', onSite = 4, onLight = false }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      background: onLight ? 'transparent' : AX.surface,
      padding: '8px 16px',
      borderBottom: onLight ? 'none' : `1px solid ${AX.border}`,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        background: AX.borderLight, border: `1px solid ${AX.border}`,
        padding: '8px 14px', borderRadius: 999,
        flex: '0 1 auto', minWidth: 0, maxWidth: '70%',
      }}>
        <Icon name="map-pin" size={15} color={AX.olive} />
        <div style={{
          color: AX.text, fontFamily: TYPE.ui, fontSize: 14, fontWeight: 600,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{property}</div>
        <Icon name="chevron-down" size={14} color={AX.textMuted} />
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        background: 'rgba(91,104,48,0.08)',
        border: '1px solid rgba(91,104,48,0.20)',
        padding: '7px 12px', borderRadius: 999,
      }}>
        <Icon name="users" size={13} color={AX.olive} />
        <div style={{ color: AX.olive, fontFamily: TYPE.ui, fontSize: 13, fontWeight: 600 }}>
          {onSite} on site
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Bottom tab bar — Home / Tasks / Map / Observe / Profile
// (Assets is hidden behind "Map" tap-and-hold per typical iOS density;
//  we show the 5 used in AppNavigator.js. For 5 tabs we use Home/Tasks/Map/Observe/Profile.)
// ─────────────────────────────────────────────────────────────
function TabBar({ active = 'Home' }) {
  const tabs = [
    { name: 'Home', icon: 'home' },
    { name: 'Tasks', icon: 'clipboard' },
    { name: 'Map', icon: 'map' },
    { name: 'Observe', icon: 'search' },
    { name: 'Profile', icon: 'user' },
  ];
  return (
    <div style={{
      background: AX.surface, borderTop: `1px solid ${AX.border}`,
      paddingTop: 6, paddingBottom: 28, paddingLeft: 4, paddingRight: 4,
      display: 'flex', justifyContent: 'space-around',
    }}>
      {tabs.map(t => {
        const on = t.name === active;
        return (
          <div key={t.name} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            flex: 1, paddingTop: 4,
          }}>
            <Icon name={t.icon} size={26} color={on ? AX.olive : AX.textMuted} strokeWidth={on ? 2.2 : 2} />
            <div style={{
              fontFamily: TYPE.ui, fontSize: 11, fontWeight: 500,
              color: on ? AX.olive : AX.textMuted,
            }}>{t.name}</div>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// FAB Log button — matches existing pattern
// ─────────────────────────────────────────────────────────────
function LogFAB({ bottom = 90, right = 18 }) {
  return (
    <div style={{
      position: 'absolute', bottom, right,
      background: AX.olive, color: '#fff',
      paddingLeft: 14, paddingRight: 18, height: 50,
      borderRadius: 999, display: 'flex', alignItems: 'center', gap: 4,
      boxShadow: '0 8px 24px rgba(91,104,48,0.35), 0 2px 6px rgba(0,0,0,0.15)',
      fontFamily: TYPE.ui, fontWeight: 700, fontSize: 16,
      zIndex: 30,
    }}>
      <Icon name="plus" size={22} color="#fff" />
      <span>Log</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Stat tile (used in A and B) — matches StatTile from HomeScreen.js
// ─────────────────────────────────────────────────────────────
function StatTile({ icon, iconBg, iconColor, value, label, accent }) {
  return (
    <div style={{
      background: AX.surface, border: `1px solid ${AX.border}`,
      borderRadius: 12, padding: 14, width: 'calc(50% - 4px)',
      boxSizing: 'border-box',
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 8, background: iconBg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 8,
      }}>
        <Icon name={icon} size={20} color={iconColor} />
      </div>
      <div style={{
        fontFamily: TYPE.display, fontSize: 28, fontWeight: 700,
        color: AX.text, lineHeight: '32px',
      }}>{value}</div>
      <div style={{
        fontFamily: TYPE.ui, fontSize: 13, color: AX.textMuted, marginTop: 2,
      }}>{label}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Section heading (Title + optional link)
// ─────────────────────────────────────────────────────────────
function SectionHeader({ title, link, hint }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      marginBottom: 8, paddingTop: 4,
    }}>
      <div style={{
        fontFamily: TYPE.display, fontSize: 18, fontWeight: 600, color: AX.text,
      }}>{title}</div>
      {link && <div style={{ fontFamily: TYPE.ui, fontSize: 13, color: AX.olive, fontWeight: 600 }}>{link}</div>}
      {hint && <div style={{ fontFamily: TYPE.ui, fontSize: 11, color: AX.textMuted }}>{hint}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Task card row
// ─────────────────────────────────────────────────────────────
function TaskRow({ icon, iconColor, title, meta, status, statusColor }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      background: AX.surface, borderRadius: 12,
      padding: 12, border: `1px solid ${AX.border}`,
      marginBottom: 8,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 8,
        background: iconColor + '22',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon name={icon} size={18} color={iconColor} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: TYPE.ui, fontSize: 14, fontWeight: 500, color: AX.text,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{title}</div>
        <div style={{
          fontFamily: TYPE.ui, fontSize: 11, color: AX.textMuted, marginTop: 2,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{meta}</div>
      </div>
      <div style={{
        width: 8, height: 8, borderRadius: 4, background: statusColor || AX.textMuted,
      }} />
    </div>
  );
}

Object.assign(window, {
  BrandHeader, ContextBar, TabBar, LogFAB, StatTile, SectionHeader, TaskRow,
});
