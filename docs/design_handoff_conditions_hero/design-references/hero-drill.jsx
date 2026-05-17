// hero-drill.jsx — drill-down on option 4 (time-of-day overlays on neutral photo)
// and option 6 (property silhouette styling variations).

// ─────────────────────────────────────────────────────────────
// NeutralPhoto — a pure-CSS "neutral midday vineyard" backdrop.
// Tonally honest: no time-of-day mood baked in. Overlays do the mood work.
// ─────────────────────────────────────────────────────────────
function NeutralPhoto({ height = 130, children }) {
  return (
    <div style={{ position: 'relative', height, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0,
        background: `
          radial-gradient(120% 70% at 50% 10%, #d8dccb 0%, transparent 55%),
          radial-gradient(100% 60% at 30% 40%, #a6b08a 0%, transparent 60%),
          radial-gradient(120% 80% at 70% 75%, #6f825a 0%, transparent 60%),
          linear-gradient(180deg, #c6cbb4 0%, #8a9874 38%, #5f7257 70%, #4a583f 100%)`,
      }} />
      {/* vine row striations */}
      <div style={{ position: 'absolute', inset: 0,
        backgroundImage: 'repeating-linear-gradient(94deg, rgba(0,0,0,0.10) 0 1px, transparent 1px 8px)',
        opacity: 0.55,
        maskImage: 'linear-gradient(180deg, transparent 45%, black 65%, black 100%)',
        WebkitMaskImage: 'linear-gradient(180deg, transparent 45%, black 65%, black 100%)',
      }} />
      {/* faint mid hill */}
      <div style={{ position: 'absolute', left: '-10%', right: '-10%',
        bottom: '40%', height: 32, background: '#7b8a68', opacity: 0.55,
        borderRadius: '50% 50% 0 0 / 100% 100% 0 0', filter: 'blur(2px)' }} />
      {/* film grain */}
      <div style={{ position: 'absolute', inset: 0,
        backgroundImage: `
          repeating-radial-gradient(circle at 22% 28%, rgba(255,255,255,0.04) 0 2px, transparent 2px 6px),
          repeating-radial-gradient(circle at 72% 62%, rgba(0,0,0,0.05) 0 2px, transparent 2px 6px)`,
      }} />
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Time-of-day overlay packs. Each is a stack of CSS layers + a colored
// "sun" position. Driven by a single `tod` value — hooks up cleanly to a
// `new Date()` calc client-side.
// ─────────────────────────────────────────────────────────────
const TIME_OF_DAY = {
  dawn: {
    label: 'Dawn',
    timeStr: '05:42',
    greet: 'Early start, Sam',
    statusBadge: { label: 'COOL · LOW WIND', dot: '#3b82f6', bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.40)', text: '#1e40af' },
    sun: { color: '#ffb088', x: '78%', y: '32%', glow: 60, size: 26 },
    layers: [
      'linear-gradient(180deg, rgba(35,46,82,0.55) 0%, rgba(120,90,90,0.25) 38%, rgba(255,184,140,0.18) 60%, rgba(20,30,40,0.40) 100%)',
      'radial-gradient(60% 50% at 78% 30%, rgba(255,180,140,0.45) 0%, transparent 70%)',
    ],
    accent: '#3b82f6',
  },
  morning: {
    label: 'Morning',
    timeStr: '08:14',
    greet: 'Good morning, Sam',
    statusBadge: { label: 'SPRAY OK', dot: '#16a34a', bg: 'rgba(22,163,74,0.10)', border: 'rgba(22,163,74,0.35)', text: '#15803d' },
    sun: { color: '#fbbf24', x: '82%', y: '24%', glow: 70, size: 34 },
    layers: [
      'linear-gradient(180deg, rgba(254,243,199,0.45) 0%, rgba(253,246,227,0.22) 50%, rgba(91,104,48,0.12) 100%)',
      'radial-gradient(50% 55% at 82% 22%, rgba(251,191,36,0.55) 0%, transparent 65%)',
    ],
    accent: '#5B6830',
  },
  midday: {
    label: 'Midday',
    timeStr: '12:38',
    greet: 'Good afternoon, Sam',
    statusBadge: { label: 'WIND ↑ 18km/h', dot: '#f59e0b', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.40)', text: '#92400e' },
    sun: { color: '#fef3c7', x: '50%', y: '12%', glow: 90, size: 42 },
    layers: [
      'linear-gradient(180deg, rgba(255,255,255,0.30) 0%, rgba(255,255,255,0.05) 40%, rgba(0,0,0,0.10) 100%)',
      'radial-gradient(60% 70% at 50% 10%, rgba(255,255,255,0.50) 0%, transparent 60%)',
    ],
    accent: '#5B6830',
  },
  dusk: {
    label: 'Dusk',
    timeStr: '18:51',
    greet: 'Wrap up, Sam',
    statusBadge: { label: 'LIGHT FADING', dot: '#D1583B', bg: 'rgba(209,88,59,0.12)', border: 'rgba(209,88,59,0.40)', text: '#9a3d28' },
    sun: { color: '#D1583B', x: '20%', y: '60%', glow: 80, size: 30 },
    layers: [
      'linear-gradient(180deg, rgba(120,40,30,0.30) 0%, rgba(209,88,59,0.45) 30%, rgba(120,80,40,0.40) 60%, rgba(40,30,20,0.55) 100%)',
      'radial-gradient(70% 60% at 20% 60%, rgba(209,88,59,0.60) 0%, transparent 60%)',
    ],
    accent: '#D1583B',
  },
};

// ─────────────────────────────────────────────────────────────
// Photo hero variant with a given time-of-day overlay applied to a neutral base.
// ─────────────────────────────────────────────────────────────
function PhotoTimedHero({ tod }) {
  const t = TIME_OF_DAY[tod];
  const b = t.statusBadge;
  return (
    <div style={{
      borderRadius: 16, overflow: 'hidden', border: `1px solid ${AX.border}`,
      background: AX.surface, boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    }}>
      <NeutralPhoto height={120}>
        {/* the overlay stack — this is the time-of-day CSS */}
        {t.layers.map((bg, i) => (
          <div key={i} style={{ position: 'absolute', inset: 0, background: bg }} />
        ))}
        {/* sun / light source dot */}
        <div style={{
          position: 'absolute', left: t.sun.x, top: t.sun.y,
          width: t.sun.size, height: t.sun.size, borderRadius: '50%',
          background: t.sun.color, opacity: tod === 'midday' ? 0.7 : 0.85,
          boxShadow: `0 0 ${t.sun.glow}px ${t.sun.color}80`,
          transform: 'translate(-50%, -50%)',
        }} />
        {/* time chip overlay */}
        <div style={{
          position: 'absolute', top: 10, left: 12,
          padding: '4px 9px', borderRadius: 999,
          background: 'rgba(0,0,0,0.45)', color: '#fff',
          fontFamily: TYPE.mono, fontSize: 11, fontWeight: 600, letterSpacing: 0.5,
          display: 'flex', alignItems: 'center', gap: 5,
          backdropFilter: 'blur(8px)',
        }}>
          <span style={{ width: 6, height: 6, borderRadius: 3, background: t.accent }} />
          {t.timeStr} · {t.label.toUpperCase()}
        </div>
      </NeutralPhoto>

      {/* content */}
      <div style={{ padding: '12px 14px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 12, color: AX.textMuted, fontWeight: 500 }}>
              Friday · 17 May
            </div>
            <div style={{
              fontFamily: TYPE.display, fontSize: 20, fontWeight: 700, color: AX.text,
              marginTop: 2, letterSpacing: -0.2,
            }}>{t.greet}</div>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4,
            background: b.bg, border: `1px solid ${b.border}`,
            padding: '4px 9px', borderRadius: 999,
          }}>
            <div style={{ width: 6, height: 6, borderRadius: 3, background: b.dot }} />
            <span style={{ fontSize: 10, fontWeight: 700, color: b.text, letterSpacing: 0.3 }}>
              {b.label}
            </span>
          </div>
        </div>
        <div style={{
          display: 'flex', justifyContent: 'space-between', marginTop: 14, gap: 4,
        }}>
          {[
            { icon: 'thermometer', value: tod === 'dawn' ? '9°' : tod === 'morning' ? '14°' : tod === 'midday' ? '22°' : '17°', label: 'Temp' },
            { icon: 'droplet', value: tod === 'dawn' ? '94%' : tod === 'morning' ? '72%' : tod === 'midday' ? '48%' : '66%', label: 'Humid' },
            { icon: 'wind', value: tod === 'midday' ? '18' : '8', label: 'km/h' },
            { icon: 'cloud-rain', value: '0', label: 'mm' },
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
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Variant components for canvas
// ─────────────────────────────────────────────────────────────
function PhotoDawn()    { return <HeroPreview treatmentName="4a · Dawn overlay"    blurb="Cool indigo top + warm peach sunrise glow lower-right. Greeting + status shift to ‘early start / low wind’.">      <PhotoTimedHero tod="dawn" /></HeroPreview>; }
function PhotoMorning() { return <HeroPreview treatmentName="4b · Morning overlay" blurb="Warm golden wash + amber sun upper-right. ‘Good morning’ + ‘Spray OK’. Most common state.">                       <PhotoTimedHero tod="morning" /></HeroPreview>; }
function PhotoMidday()  { return <HeroPreview treatmentName="4c · Midday overlay"  blurb="Bright + slightly washed-out, sun high. Status flips to a warning chip when wind exceeds spray threshold.">         <PhotoTimedHero tod="midday" /></HeroPreview>; }
function PhotoDusk()    { return <HeroPreview treatmentName="4d · Dusk overlay"    blurb="Rich terracotta + olive shadow, low-angled sun. ‘Wrap up’ + ‘light fading’ — gentle wind-down cue.">               <PhotoTimedHero tod="dusk" /></HeroPreview>; }

// ─────────────────────────────────────────────────────────────
// Option 6 — Property silhouette stylings
// ─────────────────────────────────────────────────────────────

// 6a — Filled abstract (the one already shown)
function SilFilled() {
  return (
    <div style={{ position: 'relative', height: 120, overflow: 'hidden',
      background: `linear-gradient(140deg, ${AX.sand} 0%, ${AX.sandWarm} 100%)` }}>
      <div style={{ position: 'absolute', inset: 0,
        backgroundImage: 'radial-gradient(circle, rgba(91,104,48,0.18) 1px, transparent 1px)',
        backgroundSize: '14px 14px', opacity: 0.5 }} />
      <svg viewBox="0 0 390 120" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: 0 }}>
        <g fill={AX.olive} stroke={AX.olive} strokeWidth="1.5">
          <polygon points="40,24 100,20 115,68 50,76" fillOpacity="0.14"/>
          <polygon points="118,22 178,28 192,74 122,80" fillOpacity="0.22"/>
          <polygon points="200,22 268,22 280,72 210,76" fillOpacity="0.10"/>
          <polygon points="55,86 145,86 155,112 60,112" fillOpacity="0.18"/>
          <polygon points="160,86 270,86 282,112 170,112" fillOpacity="0.10"/>
        </g>
        <polygon points="290,22 348,28 340,108 288,104" fill={AX.terracotta} fillOpacity="0.20" stroke={AX.terracotta} strokeWidth="1.5"/>
      </svg>
    </div>
  );
}

// 6b — Outline only (architectural)
function SilOutline() {
  return (
    <div style={{ position: 'relative', height: 120, overflow: 'hidden',
      background: AX.sand }}>
      <svg viewBox="0 0 390 120" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: 0 }}>
        <g fill="none" stroke={AX.olive} strokeWidth="1.2" strokeLinejoin="round">
          <polygon points="40,24 100,20 115,68 50,76"/>
          <polygon points="118,22 178,28 192,74 122,80"/>
          <polygon points="200,22 268,22 280,72 210,76"/>
          <polygon points="55,86 145,86 155,112 60,112"/>
          <polygon points="160,86 270,86 282,112 170,112"/>
        </g>
        <polygon points="290,22 348,28 340,108 288,104" fill="none" stroke={AX.terracotta} strokeWidth="1.6"/>
        {/* labels */}
        <g fontFamily="-apple-system, system-ui" fontSize="9" fontWeight="600" fill={AX.olive} textAnchor="middle">
          <text x="78" y="52">A</text>
          <text x="152" y="55">B</text>
          <text x="240" y="52">C</text>
          <text x="100" y="103">D</text>
          <text x="215" y="103">E</text>
          <text x="314" y="68" fill={AX.terracotta}>F</text>
        </g>
      </svg>
    </div>
  );
}

// 6c — Health-tinted (live status: green = healthy, amber = watch, red = risk)
function SilHealth() {
  return (
    <div style={{ position: 'relative', height: 120, overflow: 'hidden',
      background: `linear-gradient(140deg, ${AX.sand} 0%, ${AX.sandWarm} 100%)` }}>
      <svg viewBox="0 0 390 120" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: 0 }}>
        <g strokeWidth="1.5">
          <polygon points="40,24 100,20 115,68 50,76"   fill="#16a34a" fillOpacity="0.30" stroke="#15803d"/>
          <polygon points="118,22 178,28 192,74 122,80" fill="#f59e0b" fillOpacity="0.35" stroke="#b45309"/>
          <polygon points="200,22 268,22 280,72 210,76" fill="#16a34a" fillOpacity="0.30" stroke="#15803d"/>
          <polygon points="55,86 145,86 155,112 60,112" fill="#16a34a" fillOpacity="0.30" stroke="#15803d"/>
          <polygon points="160,86 270,86 282,112 170,112" fill="#f59e0b" fillOpacity="0.22" stroke="#b45309"/>
          <polygon points="290,22 348,28 340,108 288,104" fill="#dc2626" fillOpacity="0.30" stroke="#dc2626"/>
        </g>
      </svg>
      {/* legend */}
      <div style={{ position: 'absolute', bottom: 8, right: 12,
        display: 'flex', gap: 8, padding: '4px 8px',
        background: 'rgba(255,255,255,0.85)', borderRadius: 999,
        fontFamily: TYPE.ui, fontSize: 9, fontWeight: 600, color: AX.textMuted,
        backdropFilter: 'blur(6px)',
      }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
          <span style={{ width: 6, height: 6, borderRadius: 3, background: '#16a34a' }}/>HEALTHY
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
          <span style={{ width: 6, height: 6, borderRadius: 3, background: '#f59e0b' }}/>WATCH
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
          <span style={{ width: 6, height: 6, borderRadius: 3, background: '#dc2626' }}/>RISK
        </span>
      </div>
    </div>
  );
}

// 6d — Topo + blocks (richer, terrain-aware)
function SilTopo() {
  return (
    <div style={{ position: 'relative', height: 120, overflow: 'hidden',
      background: `linear-gradient(140deg, ${AX.sand} 0%, #f0e9c8 100%)` }}>
      <svg viewBox="0 0 390 120" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: 0 }}>
        {/* contour lines */}
        <g fill="none" stroke={AX.olive} strokeOpacity="0.30" strokeWidth="1">
          {[0,1,2,3,4,5].map(i => (
            <ellipse key={i} cx={130 + i*5} cy={150 - i*6} rx={260 - i*22} ry={120 - i*8} />
          ))}
        </g>
        {/* blocks on top */}
        <g strokeWidth="1.3" strokeLinejoin="round">
          <polygon points="40,24 100,20 115,68 50,76"   fill={AX.olive} fillOpacity="0.14" stroke={AX.olive}/>
          <polygon points="118,22 178,28 192,74 122,80" fill={AX.olive} fillOpacity="0.22" stroke={AX.olive}/>
          <polygon points="200,22 268,22 280,72 210,76" fill={AX.olive} fillOpacity="0.10" stroke={AX.olive}/>
          <polygon points="55,86 145,86 155,112 60,112" fill={AX.olive} fillOpacity="0.16" stroke={AX.olive}/>
          <polygon points="160,86 270,86 282,112 170,112" fill={AX.olive} fillOpacity="0.10" stroke={AX.olive}/>
          <polygon points="290,22 348,28 340,108 288,104" fill={AX.terracotta} fillOpacity="0.20" stroke={AX.terracotta}/>
        </g>
        {/* GPS dot */}
        <circle cx="148" cy="100" r="4" fill="#3b82f6" stroke="#fff" strokeWidth="1.5"/>
        <circle cx="148" cy="100" r="10" fill="#3b82f6" fillOpacity="0.18"/>
      </svg>
    </div>
  );
}

function SilHero({ visual }) {
  return (
    <div style={{
      borderRadius: 16, overflow: 'hidden', border: `1px solid ${AX.border}`,
      background: AX.surface, boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    }}>
      {visual}
      <div style={{ padding: '12px 14px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 13, color: AX.textMuted, fontWeight: 500 }}>Friday · 17 May</div>
            <div style={{ fontFamily: TYPE.display, fontSize: 20, fontWeight: 700, color: AX.text,
              marginTop: 2, letterSpacing: -0.2 }}>Good morning, Sam</div>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4,
            background: 'rgba(22,163,74,0.10)', border: '1px solid rgba(22,163,74,0.35)',
            padding: '4px 9px', borderRadius: 999,
          }}>
            <div style={{ width: 6, height: 6, borderRadius: 3, background: AX.success }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: '#15803d', letterSpacing: 0.3 }}>SPRAY OK</span>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14, gap: 4 }}>
          {[
            { icon: 'thermometer', value: '14°', label: 'Temp' },
            { icon: 'droplet', value: '72%', label: 'Humid' },
            { icon: 'wind', value: '8', label: 'km/h' },
            { icon: 'cloud-rain', value: '0', label: 'mm' },
          ].map(w => (
            <div key={w.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <Icon name={w.icon} size={18} color={AX.olive} />
              <div style={{ fontFamily: TYPE.display, fontSize: 17, fontWeight: 700, color: AX.text, lineHeight: 1, marginTop: 4 }}>{w.value}</div>
              <div style={{ fontSize: 10, color: AX.textMuted, fontWeight: 600, letterSpacing: 0.3, textTransform: 'uppercase' }}>{w.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SilA() { return <HeroPreview treatmentName="6a · Filled abstract"     blurb="Solid olive fills + 1 terracotta block (risk). Bold, brand-warm. Closest to original silhouette.">                   <SilHero visual={<SilFilled />} /></HeroPreview>; }
function SilB() { return <HeroPreview treatmentName="6b · Outline · labelled"  blurb="Line-only polygons with block letters. Architectural, ‘blueprint’ feel — most editorial / least visually heavy.">       <SilHero visual={<SilOutline />} /></HeroPreview>; }
function SilC() { return <HeroPreview treatmentName="6c · Health-tinted"       blurb="Each block tinted by live status (green / amber / red). Glanceable: ‘at a glance, where do I look?’ Most actionable.">  <SilHero visual={<SilHealth />} /></HeroPreview>; }
function SilD() { return <HeroPreview treatmentName="6d · Topo + blocks + GPS" blurb="Contour lines under blocks, with your live GPS dot. Richest — feels like a tiny live map preview, hints at Map tab.">  <SilHero visual={<SilTopo />} /></HeroPreview>; }

Object.assign(window, {
  PhotoDawn, PhotoMorning, PhotoMidday, PhotoDusk,
  SilA, SilB, SilC, SilD,
  NeutralPhoto, PhotoTimedHero, TIME_OF_DAY,
});
