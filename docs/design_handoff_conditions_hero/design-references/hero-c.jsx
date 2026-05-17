// hero-c.jsx — Direction C: "Field log"
// Action-first home for staff in the paddock. Big glove-friendly tappable
// action tiles for the four things you actually do (Observation, Task,
// Incident, Visitor). The Log FAB is replaced by the tiles, but stays in
// the bottom-right for muscle-memory familiarity.

function ActionTile({ icon, label, sub, accent, big = false }) {
  return (
    <div style={{
      flex: 1, background: AX.surface,
      border: `1px solid ${AX.border}`,
      borderRadius: 16, padding: 14,
      position: 'relative', overflow: 'hidden',
      minHeight: big ? 132 : 110,
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
    }}>
      {/* accent corner */}
      <div style={{
        position: 'absolute', right: -28, top: -28,
        width: 96, height: 96, borderRadius: 48,
        background: accent + '15',
      }} />
      <div style={{
        position: 'relative', zIndex: 1,
        width: 44, height: 44, borderRadius: 12,
        background: accent + '1a', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon name={icon} size={22} color={accent} strokeWidth={2.2} />
      </div>
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{
          fontFamily: TYPE.display, fontSize: 17, fontWeight: 700, color: AX.text,
          letterSpacing: -0.2,
        }}>{label}</div>
        <div style={{
          fontFamily: TYPE.ui, fontSize: 11, color: AX.textMuted, marginTop: 2,
        }}>{sub}</div>
      </div>
    </div>
  );
}

function HeroC() {
  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
      background: AX.bgWarm, fontFamily: TYPE.ui,
    }}>
      <div style={{ height: 44, background: AX.olive, flexShrink: 0 }} />

      {/* Combined header — greeting baked in */}
      <div style={{
        background: AX.olive, padding: '6px 16px 18px',
        borderBottomLeftRadius: 20, borderBottomRightRadius: 20,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <LogoMark size={26} color="#fff" />
            <div style={{ color: '#fff', fontFamily: TYPE.display, fontWeight: 700, fontSize: 16, letterSpacing: 0.3 }}>
              Auxein Grow
            </div>
          </div>
          <div style={{
            position: 'relative', width: 36, height: 36, borderRadius: 8,
            background: 'rgba(255,255,255,0.14)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon name="bell" size={18} color="#fff" />
            <div style={{
              position: 'absolute', top: -3, right: -3,
              background: AX.terracotta, width: 16, height: 16, borderRadius: 8,
              fontSize: 9, color: '#fff', fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: `1.5px solid ${AX.olive}`,
            }}>3</div>
          </div>
        </div>
        <div style={{
          fontFamily: TYPE.display, color: '#fff', fontSize: 24, fontWeight: 700,
          letterSpacing: -0.3, lineHeight: 1.1,
        }}>
          Morning, Sam
        </div>
        <div style={{
          fontFamily: TYPE.ui, color: 'rgba(255,255,255,0.78)', fontSize: 13, marginTop: 4,
        }}>
          Friday, 17 May · Marlborough Estate
        </div>

        {/* Inline status strip */}
        <div style={{
          display: 'flex', gap: 8, marginTop: 14,
        }}>
          {[
            { v: 7, l: 'tasks today' },
            { v: 2, l: 'overdue' },
            { v: 4, l: 'on site' },
          ].map(s => (
            <div key={s.l} style={{
              flex: 1, background: 'rgba(255,255,255,0.12)',
              border: '1px solid rgba(255,255,255,0.16)',
              borderRadius: 10, padding: '8px 10px',
            }}>
              <div style={{ fontFamily: TYPE.display, color: '#fff', fontSize: 18, fontWeight: 700, lineHeight: 1 }}>{s.v}</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.75)', fontWeight: 600,
                marginTop: 4, letterSpacing: 0.3, textTransform: 'uppercase' }}>{s.l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, padding: '18px 16px 12px', overflow: 'hidden' }}>
        <div style={{
          fontFamily: TYPE.display, fontSize: 14, fontWeight: 600, color: AX.textMuted,
          letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 10,
        }}>
          Log something
        </div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
          <ActionTile icon="search" label="Observation" sub="Scout · Capture" accent={AX.success} big />
          <ActionTile icon="alert-octagon" label="Incident" sub="Near-miss · Harm" accent={AX.danger} big />
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <ActionTile icon="alert-triangle" label="Risk" sub="Hazard · Control" accent={AX.warning} big />
          <ActionTile icon="user-plus" label="Visitor" sub="Check in · Induct" accent={AX.olive} big />
        </div>

        {/* In progress strip */}
        <div style={{ marginTop: 18 }}>
          <SectionHeader title="In progress" hint="Tap to resume" />
          <div style={{
            background: AX.surface, borderRadius: 12,
            border: `1px solid ${AX.warning}55`,
            borderLeft: `3px solid ${AX.warning}`,
            padding: 12, display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{
              width: 10, height: 10, borderRadius: 5, background: AX.warning,
              boxShadow: `0 0 0 4px ${AX.warning}33`,
            }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: AX.text }}>
                Powdery mildew scout — Block C
              </div>
              <div style={{ fontSize: 11, color: AX.textMuted, marginTop: 2 }}>
                3 spots captured · started 9:42
              </div>
            </div>
            <Icon name="chevron-right" size={20} color={AX.textMuted} />
          </div>
        </div>
      </div>

      <TabBar active="Home" />
    </div>
  );
}

window.HeroC = HeroC;
