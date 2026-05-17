// hero-visuals.jsx — visual-treatment study for Direction A hero card.
// Each variant renders the same content card with a different visual approach.

// ─────────────────────────────────────────────────────────────
// Photographic backdrop — pure CSS, layered to suggest a vineyard scene.
// Used as the base for natural / sand-wash / olive-duotone treatments.
// ─────────────────────────────────────────────────────────────
function PhotoVineyard({ children, treatment = 'natural', height = 130 }) {
  // Base layered "photograph"
  const photo = (
    <div style={{ position: 'absolute', inset: 0,
      background: `
        radial-gradient(110% 60% at 80% 8%, #fef3c7 0%, transparent 40%),
        radial-gradient(70% 40% at 18% 22%, #f6e4a8 0%, transparent 55%),
        radial-gradient(140% 90% at 50% 18%, #cde0a8 0%, transparent 50%),
        radial-gradient(80% 50% at 30% 65%, #7d9a4e 0%, transparent 50%),
        radial-gradient(100% 60% at 70% 80%, #5a7536 0%, transparent 55%),
        linear-gradient(180deg, #d8e4b4 0%, #91a85f 38%, #5f7a3e 62%, #4a5e2e 100%)`,
    }}>
      {/* Vine row striations — very subtle */}
      <div style={{ position: 'absolute', inset: 0,
        backgroundImage: 'repeating-linear-gradient(96deg, rgba(0,0,0,0.08) 0 1px, transparent 1px 8px)',
        opacity: 0.5,
        maskImage: 'linear-gradient(180deg, transparent 50%, black 70%, black 100%)',
        WebkitMaskImage: 'linear-gradient(180deg, transparent 50%, black 70%, black 100%)',
      }} />
      {/* Soft hill silhouette mid-way */}
      <div style={{ position: 'absolute', left: '-10%', right: '-10%',
        bottom: '38%', height: 36,
        background: '#6e8a48', opacity: 0.6,
        borderRadius: '50% 50% 0 0 / 100% 100% 0 0',
        filter: 'blur(2px)',
      }} />
      {/* Subtle film grain via dual gradients */}
      <div style={{ position: 'absolute', inset: 0,
        backgroundImage: `
          repeating-radial-gradient(circle at 20% 30%, rgba(255,255,255,0.04) 0 2px, transparent 2px 6px),
          repeating-radial-gradient(circle at 70% 60%, rgba(0,0,0,0.04) 0 2px, transparent 2px 6px)`,
      }} />
    </div>
  );

  const overlays = {
    natural: <div style={{ position: 'absolute', inset: 0,
      background: 'linear-gradient(180deg, rgba(0,0,0,0.18) 0%, transparent 35%, transparent 70%, rgba(0,0,0,0.18) 100%)',
    }} />,
    'sand-wash': <div style={{ position: 'absolute', inset: 0,
      background: `linear-gradient(180deg, rgba(253,246,227,0.55) 0%, rgba(253,246,227,0.4) 100%)`,
      mixBlendMode: 'normal',
    }} />,
    'olive-duotone': <div style={{ position: 'absolute', inset: 0,
      background: AX.olive, mixBlendMode: 'color', opacity: 0.85,
    }} />,
    'warm-dawn': <div style={{ position: 'absolute', inset: 0,
      background: `linear-gradient(180deg, rgba(209,88,59,0.42) 0%, rgba(253,246,227,0.25) 60%, rgba(91,104,48,0.20) 100%)`,
    }} />,
    'high-contrast': <div style={{ position: 'absolute', inset: 0,
      background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.55) 100%)',
    }} />,
  };

  return (
    <div style={{ position: 'relative', height, overflow: 'hidden' }}>
      {photo}
      {/* desaturation filter applied via wrapper for duotone variants */}
      {treatment === 'olive-duotone' && (
        <div style={{ position: 'absolute', inset: 0,
          background: photo.props.style.background,
          filter: 'grayscale(100%) contrast(0.9)',
        }} />
      )}
      {overlays[treatment]}
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Block silhouette — uses actual property polygon shapes as the visual.
// Most "data-as-art": the visual is the user's own farm.
// ─────────────────────────────────────────────────────────────
function BlockSilhouette({ height = 130 }) {
  return (
    <div style={{
      position: 'relative', height, overflow: 'hidden',
      background: `linear-gradient(140deg, ${AX.sand} 0%, ${AX.sandWarm} 100%)`,
    }}>
      {/* faint dotted grid */}
      <div style={{ position: 'absolute', inset: 0,
        backgroundImage: 'radial-gradient(circle, rgba(91,104,48,0.18) 1px, transparent 1px)',
        backgroundSize: '14px 14px', opacity: 0.5,
      }} />
      {/* block shapes — abstract olive polygons */}
      <svg viewBox="0 0 390 130" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: 0 }}>
        <g fill="none" stroke={AX.olive} strokeWidth="1.5">
          <polygon points="40,30 95,25 110,72 55,82" fill={AX.olive} fillOpacity="0.12"/>
          <polygon points="115,28 175,32 190,80 120,84" fill={AX.olive} fillOpacity="0.20"/>
          <polygon points="200,30 268,28 280,76 210,82" fill={AX.olive} fillOpacity="0.10"/>
          <polygon points="55,90 145,90 155,118 60,118" fill={AX.olive} fillOpacity="0.16"/>
          <polygon points="160,90 270,90 280,118 170,118" fill={AX.olive} fillOpacity="0.10"/>
          <polygon points="290,28 350,32 340,118 290,114" fill={AX.terracotta} fillOpacity="0.18" stroke={AX.terracotta}/>
        </g>
        {/* tiny label dots */}
        <circle cx="78" cy="55" r="2.5" fill={AX.olive}/>
        <circle cx="152" cy="58" r="2.5" fill={AX.olive}/>
        <circle cx="240" cy="55" r="2.5" fill={AX.olive}/>
        <circle cx="100" cy="105" r="2.5" fill={AX.olive}/>
        <circle cx="215" cy="105" r="2.5" fill={AX.olive}/>
        <circle cx="318" cy="72" r="3" fill={AX.terracotta}/>
      </svg>
      {/* corner gloss */}
      <div style={{ position: 'absolute', inset: 0,
        background: 'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, transparent 50%)',
      }} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Topographic contour lines — data-vis abstract.
// ─────────────────────────────────────────────────────────────
function TopoContours({ height = 130 }) {
  return (
    <div style={{
      position: 'relative', height, overflow: 'hidden',
      background: `linear-gradient(140deg, ${AX.sand} 0%, #f0e9c8 100%)`,
    }}>
      <svg viewBox="0 0 390 130" preserveAspectRatio="xMidYMid slice"
        style={{ position: 'absolute', inset: 0 }}>
        <g fill="none" stroke={AX.olive} strokeOpacity="0.45" strokeWidth="1.2">
          {[0,1,2,3,4,5,6,7].map(i => (
            <ellipse key={i} cx={120 + i*4} cy={170 - i*8} rx={260 - i*22} ry={130 - i*10} />
          ))}
        </g>
        <g fill="none" stroke={AX.terracotta} strokeOpacity="0.7" strokeWidth="1.4">
          <ellipse cx="135" cy="170" rx="40" ry="22" />
        </g>
      </svg>
      {/* sun */}
      <div style={{ position: 'absolute', top: 18, right: 32,
        width: 24, height: 24, borderRadius: 12,
        background: AX.terracotta, opacity: 0.85,
        boxShadow: '0 0 30px rgba(209,88,59,0.4)',
      }} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Hero card — accepts a visual element + treatment-specific copy color.
// ─────────────────────────────────────────────────────────────
function HeroCard({ visual, dateColor = AX.textMuted, nameColor = AX.text, badge = 'spray-ok' }) {
  const badges = {
    'spray-ok': { dot: AX.success, bg: 'rgba(22,163,74,0.10)', border: 'rgba(22,163,74,0.35)', text: '#15803d', label: 'SPRAY OK' },
    'caution':  { dot: AX.warning, bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.40)', text: '#92400e', label: 'WIND ↑' },
  };
  const b = badges[badge];
  return (
    <div style={{
      borderRadius: 16, overflow: 'hidden', border: `1px solid ${AX.border}`,
      background: AX.surface, boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    }}>
      {visual}
      <div style={{ padding: '12px 14px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 13, color: dateColor, fontWeight: 500 }}>
              Friday · 17 May
            </div>
            <div style={{
              fontFamily: TYPE.display, fontSize: 20, fontWeight: 700, color: nameColor,
              marginTop: 2, letterSpacing: -0.2,
            }}>Good morning, Sam</div>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4,
            background: b.bg, border: `1px solid ${b.border}`,
            padding: '4px 9px', borderRadius: 999,
          }}>
            <div style={{ width: 6, height: 6, borderRadius: 3, background: b.dot }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: b.text, letterSpacing: 0.3 }}>
              {b.label}
            </span>
          </div>
        </div>
        <div style={{
          display: 'flex', justifyContent: 'space-between', marginTop: 14, gap: 4,
        }}>
          {[
            { icon: 'thermometer', value: '14°', label: 'Temp' },
            { icon: 'droplet', value: '72%', label: 'Humid' },
            { icon: 'wind', value: '8', label: 'km/h' },
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
// Hero card variants — content for "in-page" type-only treatment
// (#5: no imagery) — different structure.
// ─────────────────────────────────────────────────────────────
function HeroCardMinimal() {
  return (
    <div style={{
      borderRadius: 16, padding: '18px 18px 16px',
      background: AX.sandWarm,
      border: `1px solid ${AX.oliveBorder}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div>
          <div style={{
            fontSize: 11, fontWeight: 700, letterSpacing: 0.6,
            color: AX.olive, textTransform: 'uppercase',
          }}>Fri · 17 May · 06:42</div>
          <div style={{
            fontFamily: TYPE.display, fontSize: 28, fontWeight: 700, color: AX.charcoal,
            marginTop: 6, lineHeight: 1.05, letterSpacing: -0.6,
          }}>Morning,<br/>Sam.</div>
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
      <div style={{
        display: 'flex', justifyContent: 'space-between', marginTop: 18, gap: 4,
      }}>
        {[
          { icon: 'thermometer', value: '14°', label: 'Temp · Hi 21°' },
          { icon: 'droplet', value: '72%', label: 'Humidity' },
          { icon: 'wind', value: '8 SW', label: 'km/h · gust 14' },
          { icon: 'cloud-rain', value: '0', label: 'mm · 24h' },
        ].map(w => (
          <div key={w.label} style={{
            flex: 1, display: 'flex', flexDirection: 'column', gap: 2,
          }}>
            <Icon name={w.icon} size={16} color={AX.olive} />
            <div style={{ fontFamily: TYPE.display, fontSize: 17, fontWeight: 700, color: AX.text, lineHeight: 1, marginTop: 4 }}>
              {w.value}
            </div>
            <div style={{ fontSize: 9, color: AX.textMuted, fontWeight: 600, letterSpacing: 0.3, textTransform: 'uppercase' }}>
              {w.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Hero "preview" panel — phone-top crop showing chrome + hero card.
// Used as the artboard content so all 8 variants line up visually.
// ─────────────────────────────────────────────────────────────
function HeroPreview({ children, treatmentName, blurb }) {
  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      background: AX.bg, fontFamily: TYPE.ui,
      borderRadius: 28, overflow: 'hidden',
      position: 'relative',
    }}>
      {/* phone-ish status bar */}
      <div style={{
        height: 44, background: AX.olive,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
        padding: '0 22px 8px',
      }}>
        <div style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>9:41</div>
        <div style={{ display: 'flex', gap: 5, alignItems: 'center', opacity: 0.9 }}>
          <svg width="16" height="10" viewBox="0 0 19 12"><rect x="0" y="7.5" width="3.2" height="4.5" rx="0.7" fill="#fff"/><rect x="4.8" y="5" width="3.2" height="7" rx="0.7" fill="#fff"/><rect x="9.6" y="2.5" width="3.2" height="9.5" rx="0.7" fill="#fff"/><rect x="14.4" y="0" width="3.2" height="12" rx="0.7" fill="#fff"/></svg>
          <svg width="22" height="11" viewBox="0 0 27 13"><rect x="0.5" y="0.5" width="23" height="12" rx="3.5" stroke="#fff" strokeOpacity="0.45" fill="none"/><rect x="2" y="2" width="20" height="9" rx="2" fill="#fff"/></svg>
        </div>
      </div>
      <BrandHeader unread={3} />
      <ContextBar property="Marlborough Estate" onSite={4} />

      <div style={{ padding: '14px 16px 16px', flex: 1 }}>
        {children}

        {/* peek of stat tiles */}
        <div style={{ display: 'flex', gap: 8, marginTop: 14, opacity: 0.85 }}>
          <div style={{
            flex: 1, background: AX.surface, border: `1px solid ${AX.border}`,
            borderRadius: 12, padding: 12, height: 84,
          }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: 'rgba(91,104,48,0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="clipboard" size={15} color={AX.olive} />
            </div>
            <div style={{ fontFamily: TYPE.display, fontSize: 22, fontWeight: 700, color: AX.text, marginTop: 6, lineHeight: 1 }}>7</div>
            <div style={{ fontSize: 11, color: AX.textMuted, marginTop: 2 }}>Upcoming tasks</div>
          </div>
          <div style={{
            flex: 1, background: AX.surface, border: `1px solid ${AX.border}`,
            borderRadius: 12, padding: 12, height: 84,
          }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: AX.dangerBg,
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="alert-triangle" size={15} color={AX.danger} />
            </div>
            <div style={{ fontFamily: TYPE.display, fontSize: 22, fontWeight: 700, color: AX.text, marginTop: 6, lineHeight: 1 }}>2</div>
            <div style={{ fontSize: 11, color: AX.textMuted, marginTop: 2 }}>Overdue</div>
          </div>
        </div>
      </div>

      {/* footer label */}
      <div style={{
        background: 'rgba(0,0,0,0.78)', color: '#fff',
        padding: '10px 14px',
        position: 'absolute', left: 0, right: 0, bottom: 0,
        backdropFilter: 'blur(8px)',
      }}>
        <div style={{ fontFamily: TYPE.display, fontSize: 13, fontWeight: 700, letterSpacing: 0.3 }}>
          {treatmentName}
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.72)', marginTop: 2, lineHeight: 1.4 }}>
          {blurb}
        </div>
      </div>
    </div>
  );
}

// Visual treatments (the 8 options)
function V_CssMorning() {
  return (
    <HeroPreview
      treatmentName="1 · CSS illustration · morning"
      blurb="Pure CSS hills + gradient sky. Stylized, brand-controllable, no asset pipeline. Cheap to ship, mood-shifts with time of day."
    >
      <HeroCard visual={<HorizonIllustration height={104} mood="morning" />} />
    </HeroPreview>
  );
}
function V_CssDusk() {
  return (
    <HeroPreview
      treatmentName="2 · CSS illustration · dusk"
      blurb="Same approach, terracotta sun + olive hills. Shows how the illustration mood swings with /weather/api time of day."
    >
      <HeroCard visual={<HorizonIllustration height={104} mood="dusk" />} />
    </HeroPreview>
  );
}
function V_PhotoNatural() {
  return (
    <HeroPreview
      treatmentName="3 · Photo · natural"
      blurb="Real vineyard photograph, full colour, soft top/bottom legibility gradient. Most lifelike — but ties brand mood to whatever was shot that day."
    >
      <HeroCard visual={<PhotoVineyard treatment="natural" height={104} />} />
    </HeroPreview>
  );
}
function V_PhotoSandWash() {
  return (
    <HeroPreview
      treatmentName="4 · Photo · sand wash"
      blurb="Photograph tinted to brand sand. Warm + soft, content stays legible. A balanced middle ground between realism and brand control."
    >
      <HeroCard visual={<PhotoVineyard treatment="sand-wash" height={104} />} />
    </HeroPreview>
  );
}
function V_PhotoOliveDuotone() {
  return (
    <HeroPreview
      treatmentName="5 · Photo · olive duotone"
      blurb="Photograph as olive-tinted duotone. Boldest brand statement, very consistent — but flattens detail and could feel heavy daily."
    >
      <HeroCard visual={<PhotoVineyard treatment="olive-duotone" height={104} />} dateColor={AX.textMuted} />
    </HeroPreview>
  );
}
function V_BlockSilhouette() {
  return (
    <HeroPreview
      treatmentName="6 · Property silhouette"
      blurb="Visual is the user's own farm — block polygons abstracted. Unique to Auxein, ‘data is the art’, no stock-photo feel."
    >
      <HeroCard visual={<BlockSilhouette height={104} />} />
    </HeroPreview>
  );
}
function V_TopoContours() {
  return (
    <HeroPreview
      treatmentName="7 · Topographic contours"
      blurb="Abstract olive contour lines + small terracotta accent. Data-vis flavoured, ages well, no ‘sunset cliché’ — but quieter / less warm."
    >
      <HeroCard visual={<TopoContours height={104} />} />
    </HeroPreview>
  );
}
function V_Minimal() {
  return (
    <HeroPreview
      treatmentName="8 · No imagery · sand card"
      blurb="Maximum restraint. Big greeting on a sand card. Fastest to render, oldest-tech-stack-friendly, but feels less ‘hero’."
    >
      <HeroCardMinimal />
    </HeroPreview>
  );
}

Object.assign(window, {
  V_CssMorning, V_CssDusk, V_PhotoNatural, V_PhotoSandWash,
  V_PhotoOliveDuotone, V_BlockSilhouette, V_TopoContours, V_Minimal,
  HeroPreview, HeroCard, HeroCardMinimal,
  PhotoVineyard, BlockSilhouette, TopoContours,
});
