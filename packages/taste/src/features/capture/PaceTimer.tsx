import { useEffect, useRef, useState } from 'react';

// Per-wine pace timer.
//
// The MW practical gives 12-15 minutes per wine for parts a-c, and the
// guidelines list timing as an examinable skill in its own right ("Have a plan
// on timing and stick to it", "Don't spend too long on first question"). The
// point is calibration, not alarm: it counts up, changes colour at the two
// thresholds, and never interrupts.
//
// Deliberately NOT persisted. `taste.notes` has no duration column, and adding
// one is a migration. This is a live pacing aid for the glass in front of you;
// if it should become a tracked statistic later, that is a schema change to ask
// for rather than sneak in.

const TARGET_S = 12 * 60;
const LIMIT_S = 15 * 60;

function mmss(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function PaceTimer({ glassId }: { glassId: string }) {
  // Keyed by glass so switching wines in a flight restarts the clock for that
  // wine rather than showing the session total.
  const startedAt = useRef<{ id: string; t: number }>({ id: glassId, t: Date.now() });
  const [now, setNow] = useState(Date.now());
  const [running, setRunning] = useState(true);

  if (startedAt.current.id !== glassId) {
    startedAt.current = { id: glassId, t: Date.now() };
  }

  useEffect(() => {
    if (!running) return;
    const h = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(h);
  }, [running]);

  const elapsed = Math.max(0, Math.floor((now - startedAt.current.t) / 1000));
  const state = elapsed >= LIMIT_S ? 'over' : elapsed >= TARGET_S ? 'near' : 'ok';

  return (
    <button
      type="button"
      className={`pace pace--${state}`}
      title={running ? 'Pause the pace timer' : 'Resume'}
      aria-label={`Pace timer ${mmss(elapsed)}${running ? '' : ', paused'}`}
      onClick={() => {
        if (running) {
          setRunning(false);
        } else {
          // Resume from where it stopped rather than jumping forward.
          startedAt.current = { id: glassId, t: Date.now() - elapsed * 1000 };
          setNow(Date.now());
          setRunning(true);
        }
      }}
    >
      {running ? '' : '❚❚ '}
      {mmss(elapsed)}
    </button>
  );
}
