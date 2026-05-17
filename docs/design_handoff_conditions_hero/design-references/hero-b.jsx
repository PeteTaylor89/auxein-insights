// hero-b.jsx — Direction B: "Map-led"
// Property map fills the top half, with floating glass cards overlaid for
// conditions/alerts. A pull-up sheet with today's tasks docks at the bottom.
// Inspired by Onside but built around Auxein's blocks and olive palette.

function BlockShape({ left, top, width, height, color, label, ha, alert }) {
  return (
    <div style={{
      position: 'absolute', left, top, width, height,
      transform: 'rotate(-6deg)',
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        background: color + '40',
        border: `1.5px solid ${color}`,
        borderRadius: 6,
        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.15)',
      }} />
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        transform: 'rotate(6deg)',
      }}>
        <div style={{
          color: '#fff', fontFamily: TYPE.display, fontWeight: 800, fontSize: 13,
          letterSpacing: 0.5, textShadow: '0 1px 2px rgba(0,0,0,0.6)',
        }}>{label}</div>
        <div style={{
          color: 'rgba(255,255,255,0.85)', fontSize: 10, fontWeight: 600,
          textShadow: '0 1px 1px rgba(0,0,0,0.5)',
        }}>{ha} ha</div>
      </div>
      {alert && (
        <div style={{
          position: 'absolute', top: -10, right: -8,
          background: AX.terracotta, color: '#fff',
          width: 22, height: 22, borderRadius: 11,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: '2px solid #fff', boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
          transform: 'rotate(6deg)',
        }}>
          <Icon name="alert-triangle" size={11} color="#fff" strokeWidth={2.5} />
        </div>
      )}
    </div>
  );
}

function GlassCard({ children, style = {} }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.92)',
      backdropFilter: 'blur(12px) saturate(140%)',
      WebkitBackdropFilter: 'blur(12px) saturate(140%)',
      border: '1px solid rgba(255,255,255,0.6)',
      borderRadius: 14,
      boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
      ...style,
    }}>{children}</div>
  );
}

function HeroB() {
  return (
    <div style={{
      width: '100%', height: '100%', position: 'relative',
      display: 'flex', flexDirection: 'column',
      background: AX.bg, fontFamily: TYPE.ui, overflow: 'hidden',
    }}>
      {/* Map fills 0..58% */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '60%', zIndex: 0 }}>
        <SatBackdrop style={{ width: '100%', height: '100%' }}>
          <BlockShape left={28}  top={140} width={92}  height={70} color="#a8d96c" label="A" ha="2.4" />
          <BlockShape left={120} top={120} width={110} height={86} color="#5fc7a8" label="B" ha="3.1" alert />
          <BlockShape left={232} top={140} width={94}  height={70} color="#a8d96c" label="C" ha="2.0" />
          <BlockShape left={56}  top={222} width={120} height={80} color="#7ed18c" label="D" ha="3.6" />
          <BlockShape left={184} top={228} width={140} height={84} color="#5fc7a8" label="E" ha="4.2" alert />
          <BlockShape left={96}  top={314} width={170} height={84} color="#a8d96c" label="F" ha="5.1" />
          {/* GPS dot */}
          <div style={{
            position: 'absolute', left: 230, top: 305,
            width: 14, height: 14, borderRadius: 7, background: '#3b82f6',
            border: '2px solid #fff', boxShadow: '0 0 0 8px rgba(59,130,246,0.25)',
          }} />
        </SatBackdrop>
      </div>

      {/* Transparent status bar spacer */}
      <div style={{ height: 44, position: 'relative', zIndex: 5,
        background: 'linear-gradient(180deg, rgba(0,0,0,0.25), transparent)' }} />

      {/* Transparent header */}
      <div style={{ position: 'relative', zIndex: 5 }}>
        <BrandHeader unread={3} transparent />
      </div>

      {/* Floating context pill (no card bg) */}
      <div style={{
        position: 'relative', zIndex: 5,
        padding: '0 16px 8px', display: 'flex', gap: 8,
      }}>
        <GlassCard style={{
          padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8,
          flex: '0 1 auto', minWidth: 0,
        }}>
          <Icon name="map-pin" size={15} color={AX.olive} />
          <div style={{ fontSize: 14, fontWeight: 600, color: AX.text }}>Marlborough Estate</div>
          <Icon name="chevron-down" size={14} color={AX.textMuted} />
        </GlassCard>
        <GlassCard style={{
          padding: '8px 11px', display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <Icon name="users" size={13} color={AX.olive} />
          <div style={{ fontSize: 13, fontWeight: 600, color: AX.olive }}>4</div>
        </GlassCard>
      </div>

      {/* Top-right summary stack */}
      <div style={{
        position: 'absolute', top: 102, right: 16, zIndex: 6,
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        <GlassCard style={{
          padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <Icon name="thermometer" size={16} color={AX.olive} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: AX.text, lineHeight: 1 }}>14°</div>
            <div style={{ fontSize: 9, color: AX.textMuted, fontWeight: 600, letterSpacing: 0.3 }}>SPRAY OK</div>
          </div>
        </GlassCard>
      </div>

      {/* Alert callout on Block E */}
      <div style={{
        position: 'absolute', left: 16, top: 195, zIndex: 6,
      }}>
        <GlassCard style={{
          padding: '8px 10px', maxWidth: 168,
          borderLeft: `3px solid ${AX.terracotta}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <Icon name="alert-triangle" size={13} color={AX.terracotta} />
            <div style={{ fontSize: 11, fontWeight: 700, color: AX.terracotta, letterSpacing: 0.4 }}>2 RISKS</div>
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, color: AX.text, lineHeight: 1.3 }}>
            Block B · Botrytis trending up
          </div>
        </GlassCard>
      </div>

      {/* Bottom sheet — pulled up over map's lower edge */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 78, top: '52%',
        zIndex: 7, background: AX.surface,
        borderTopLeftRadius: 24, borderTopRightRadius: 24,
        boxShadow: '0 -8px 24px rgba(0,0,0,0.12)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <div style={{
          width: 40, height: 4, borderRadius: 2, background: AX.border,
          alignSelf: 'center', marginTop: 8, marginBottom: 4,
        }} />

        {/* Stat strip */}
        <div style={{
          display: 'flex', padding: '8px 16px 12px', gap: 8,
        }}>
          {[
            { v: 7, l: 'Tasks', c: AX.olive },
            { v: 2, l: 'Overdue', c: AX.danger },
            { v: 3, l: 'Risks', c: AX.terracotta },
            { v: 1, l: 'Obs', c: AX.success },
          ].map(s => (
            <div key={s.l} style={{
              flex: 1, padding: '6px 0', textAlign: 'center',
              background: AX.borderLight, borderRadius: 10,
            }}>
              <div style={{ fontFamily: TYPE.display, fontSize: 18, fontWeight: 700, color: s.c, lineHeight: 1 }}>
                {s.v}
              </div>
              <div style={{ fontSize: 10, color: AX.textMuted, fontWeight: 600, marginTop: 2,
                letterSpacing: 0.3, textTransform: 'uppercase' }}>{s.l}</div>
            </div>
          ))}
        </div>

        <div style={{ padding: '0 16px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 8,
          }}>
            <div style={{ fontFamily: TYPE.display, fontSize: 16, fontWeight: 600, color: AX.text }}>
              Today
            </div>
            <div style={{ fontSize: 12, color: AX.olive, fontWeight: 600 }}>View all</div>
          </div>

          <TaskRow
            icon="search" iconColor={AX.success}
            title="Botrytis scout — Block B"
            meta="10:00 · Pinot Noir"
            statusColor={AX.warning}
          />
          <TaskRow
            icon="alert-triangle" iconColor={AX.warning}
            title="Spray sulphur — A, B, F"
            meta="Before 4pm"
            statusColor={AX.info}
          />
        </div>
      </div>

      <LogFAB bottom={92} />

      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10 }}>
        <TabBar active="Home" />
      </div>
    </div>
  );
}

window.HeroB = HeroB;
