// hero-a.jsx — Direction A: "Field & Forecast"
// Conservative enhancement of current HomeScreen.
// Adds a hero conditions card (horizon illustration + weather strip) above the
// existing 4-tile grid and task feed.

function HeroA() {
  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      background: AX.bg, fontFamily: TYPE.ui,
    }}>
      {/* Status-bar spacer (44pt) */}
      <div style={{ height: 44, background: AX.olive, flexShrink: 0 }} />
      <BrandHeader unread={3} />
      <ContextBar property="Marlborough Estate" onSite={4} />

      <div style={{ flex: 1, overflow: 'hidden', background: AX.bg }}>
        {/* Hero conditions card */}
        <div style={{ padding: '14px 16px 0' }}>
          <div style={{
            borderRadius: 16, overflow: 'hidden', border: `1px solid ${AX.border}`,
            background: AX.surface,
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          }}>
            <HorizonIllustration height={104} mood="morning" />
            <div style={{ padding: '12px 14px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 13, color: AX.textMuted, fontWeight: 500 }}>
                    Friday · 17 May
                  </div>
                  <div style={{
                    fontFamily: TYPE.display, fontSize: 20, fontWeight: 700, color: AX.text,
                    marginTop: 2, letterSpacing: -0.2,
                  }}>Good morning, Sam</div>
                </div>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  background: 'rgba(22,163,74,0.10)', border: '1px solid rgba(22,163,74,0.35)',
                  padding: '4px 9px', borderRadius: 999,
                }}>
                  <div style={{ width: 6, height: 6, borderRadius: 3, background: AX.success }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#15803d', letterSpacing: 0.3 }}>
                    SPRAY OK
                  </span>
                </div>
              </div>

              {/* Weather strip */}
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                marginTop: 14, gap: 4,
              }}>
                {[
                  { icon: 'thermometer', value: '14°', label: 'Temp', sub: 'Hi 21°' },
                  { icon: 'droplet', value: '72%', label: 'Humidity', sub: 'Dew 9°' },
                  { icon: 'wind', value: '8', label: 'km/h SW', sub: 'gust 14' },
                  { icon: 'cloud-rain', value: '0', label: 'Rain mm', sub: '24h fcst' },
                ].map(w => (
                  <div key={w.label} style={{
                    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                  }}>
                    <Icon name={w.icon} size={18} color={AX.olive} />
                    <div style={{ fontFamily: TYPE.display, fontSize: 17, fontWeight: 700, color: AX.text, lineHeight: 1, marginTop: 4 }}>
                      {w.value}
                    </div>
                    <div style={{ fontSize: 10, color: AX.textMuted, fontWeight: 600, letterSpacing: 0.3, textTransform: 'uppercase' }}>
                      {w.label}
                    </div>
                    <div style={{ fontSize: 10, color: AX.textFaint }}>{w.sub}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Stat tiles */}
        <div style={{
          padding: '14px 16px 0', display: 'flex', flexWrap: 'wrap', gap: 8,
        }}>
          <StatTile icon="clipboard" iconBg="rgba(91,104,48,0.10)" iconColor={AX.olive}
            value={7} label="Upcoming tasks" />
          <StatTile icon="alert-triangle" iconBg={AX.dangerBg} iconColor={AX.danger}
            value={2} label="Overdue tasks" />
          <StatTile icon="tool" iconBg="rgba(230,126,34,0.10)" iconColor="#E67E22"
            value={3} label="Maintenance due" />
          <StatTile icon="search" iconBg="rgba(22,163,74,0.12)" iconColor={AX.success}
            value={1} label="Active observations" />
        </div>

        {/* Upcoming */}
        <div style={{ padding: '14px 16px 0' }}>
          <SectionHeader title="Today's plan" link="View all" />
          <TaskRow
            icon="search" iconColor={AX.success}
            title="Botrytis scout — Block C"
            meta="Today · 10:00 · Chardonnay"
            statusColor={AX.warning}
          />
          <TaskRow
            icon="alert-triangle" iconColor={AX.warning}
            title="Spray window: Sulphur"
            meta="Today · before 4pm · Blocks A,B,F"
            statusColor={AX.info}
          />
          <TaskRow
            icon="tool" iconColor="#E67E22"
            title="Service tractor #2 — 250h"
            meta="Tomorrow · Shed"
            statusColor={AX.textMuted}
          />
        </div>
      </div>

      <LogFAB bottom={68} />
      <TabBar active="Home" />
    </div>
  );
}

window.HeroA = HeroA;
