// hero-d.jsx — Direction D: "Block pulse"
// Horizontal carousel of block cards, each showing a radial protection score
// + risk/task chips. Below: a unified activity feed across all blocks.
// Most novel direction — invites a daily glance per block.

function PulseDial({ value, color, size = 96 }) {
  // value 0..100
  const deg = (value / 100) * 360;
  return (
    <div style={{
      position: 'relative', width: size, height: size,
      borderRadius: size / 2,
      background: `conic-gradient(${color} 0deg ${deg}deg, ${AX.borderLight} ${deg}deg 360deg)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        width: size - 16, height: size - 16, borderRadius: '50%',
        background: AX.surface,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.04)',
      }}>
        <div style={{
          fontFamily: TYPE.display, fontSize: 24, fontWeight: 700, color: AX.text, lineHeight: 1,
        }}>{value}</div>
        <div style={{
          fontSize: 9, color: AX.textMuted, fontWeight: 700, letterSpacing: 0.6,
          marginTop: 2, textTransform: 'uppercase',
        }}>Protection</div>
      </div>
    </div>
  );
}

function BlockCard({ name, variety, ha, score, scoreColor, tasks, risks, active }) {
  return (
    <div style={{
      flex: '0 0 232px', scrollSnapAlign: 'start',
      background: AX.surface, borderRadius: 16,
      border: active ? `1.5px solid ${AX.olive}` : `1px solid ${AX.border}`,
      padding: 14, position: 'relative',
      boxShadow: active ? '0 6px 16px rgba(91,104,48,0.15)' : '0 1px 3px rgba(0,0,0,0.05)',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{
            fontFamily: TYPE.display, fontSize: 18, fontWeight: 700, color: AX.text, lineHeight: 1,
            letterSpacing: -0.2,
          }}>{name}</div>
          <div style={{
            fontFamily: TYPE.ui, fontSize: 11, color: AX.textMuted,
            marginTop: 3,
          }}>{variety} · {ha} ha</div>
        </div>
        {risks > 0 && (
          <div style={{
            background: AX.terracotta, color: '#fff',
            width: 22, height: 22, borderRadius: 11,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 700,
          }}>{risks}</div>
        )}
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 14, marginTop: 14,
      }}>
        <PulseDial value={score} color={scoreColor} size={92} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '6px 8px', background: AX.borderLight, borderRadius: 8,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Icon name="clipboard" size={11} color={AX.textMuted} />
              <span style={{ fontSize: 10, fontWeight: 600, color: AX.textMuted, letterSpacing: 0.3, textTransform: 'uppercase' }}>Tasks</span>
            </div>
            <span style={{ fontFamily: TYPE.display, fontWeight: 700, color: AX.text, fontSize: 14 }}>{tasks}</span>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '6px 8px', background: AX.borderLight, borderRadius: 8,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Icon name="alert-triangle" size={11} color={AX.textMuted} />
              <span style={{ fontSize: 10, fontWeight: 600, color: AX.textMuted, letterSpacing: 0.3, textTransform: 'uppercase' }}>Risks</span>
            </div>
            <span style={{ fontFamily: TYPE.display, fontWeight: 700,
              color: risks > 0 ? AX.terracotta : AX.text, fontSize: 14 }}>{risks}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function FeedRow({ icon, color, who, action, target, when }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 0', borderBottom: `1px solid ${AX.borderLight}`,
    }}>
      <div style={{
        width: 30, height: 30, borderRadius: 15,
        background: color + '20',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Icon name={icon} size={14} color={color} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, color: AX.text, lineHeight: 1.3,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          <span style={{ fontWeight: 600 }}>{who}</span>
          <span style={{ color: AX.textSecondary }}> {action} </span>
          <span style={{ fontWeight: 600 }}>{target}</span>
        </div>
      </div>
      <div style={{ fontSize: 11, color: AX.textFaint, flexShrink: 0 }}>{when}</div>
    </div>
  );
}

function HeroD() {
  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      background: AX.bg, fontFamily: TYPE.ui,
    }}>
      <div style={{ height: 44, background: AX.olive, flexShrink: 0 }} />
      <BrandHeader unread={3} />
      <ContextBar property="Marlborough Estate" onSite={4} />

      <div style={{ flex: 1, overflow: 'hidden' }}>
        {/* Filter row */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px 10px',
        }}>
          <div style={{
            fontFamily: TYPE.display, fontSize: 17, fontWeight: 700, color: AX.text,
            letterSpacing: -0.2,
          }}>Blocks · today</div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4,
            fontSize: 13, color: AX.olive, fontWeight: 600,
          }}>
            <span>All 6</span>
            <Icon name="chevron-down" size={14} color={AX.olive} />
          </div>
        </div>

        {/* Carousel */}
        <div style={{
          display: 'flex', gap: 10, overflowX: 'auto', overflowY: 'visible',
          padding: '4px 16px 14px', scrollSnapType: 'x mandatory',
        }}>
          <BlockCard name="Block A" variety="Sauv Blanc" ha="2.4" score={94} scoreColor={AX.success} tasks={1} risks={0} />
          <BlockCard name="Block B" variety="Pinot Noir" ha="3.1" score={68} scoreColor={AX.warning} tasks={3} risks={2} active />
          <BlockCard name="Block C" variety="Chardonnay" ha="2.0" score={88} scoreColor={AX.success} tasks={1} risks={0} />
          <BlockCard name="Block D" variety="Pinot Gris" ha="3.6" score={79} scoreColor={AX.success} tasks={2} risks={1} />
        </div>

        {/* Pager dots */}
        <div style={{
          display: 'flex', justifyContent: 'center', gap: 4, marginBottom: 8,
        }}>
          {[0,1,2,3,4,5].map(i => (
            <div key={i} style={{
              width: i === 1 ? 14 : 5, height: 5, borderRadius: 3,
              background: i === 1 ? AX.olive : AX.border,
              transition: 'all .2s',
            }} />
          ))}
        </div>

        {/* Activity feed */}
        <div style={{
          background: AX.surface, marginTop: 6,
          borderTop: `1px solid ${AX.border}`,
          padding: '14px 16px 16px',
          flex: 1, overflow: 'hidden',
        }}>
          <div style={{
            display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
            marginBottom: 6,
          }}>
            <div style={{
              fontFamily: TYPE.display, fontSize: 16, fontWeight: 600, color: AX.text,
            }}>Recent activity</div>
            <div style={{ fontSize: 12, color: AX.olive, fontWeight: 600 }}>View all</div>
          </div>
          <FeedRow icon="search"          color={AX.success}    who="Mia"  action="started a scout on" target="Block B"  when="2m" />
          <FeedRow icon="alert-triangle"  color={AX.terracotta} who="Sam"  action="flagged a risk on"     target="Block B"  when="14m" />
          <FeedRow icon="check-circle"    color={AX.olive}      who="Jake" action="completed"             target="Spray run E" when="1h" />
          <FeedRow icon="user-plus"       color={AX.olive}      who="Mia"  action="checked in 2 visitors at" target="main gate" when="2h" />
        </div>
      </div>

      <LogFAB bottom={68} />
      <TabBar active="Home" />
    </div>
  );
}

window.HeroD = HeroD;
