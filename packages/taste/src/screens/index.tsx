// Route screens. Most are P1 stubs labelling their target phase.
// Settings carries a P2 storage-diagnostics panel so the Dexie layer is verifiable.
import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { db, newBase, repo } from '@/db';
import type { Wine } from '@/db';

function Placeholder({ title, blurb }: { title: string; blurb: string }) {
  return (
    <section className="screen">
      <h1 className="screen-title">{title}</h1>
      <p className="screen-blurb">{blurb}</p>
    </section>
  );
}

// Home launcher (default landing).
export { HomeScreen } from '@/features/home/HomeScreen';

// Real capture grid lives in features/capture (P4).
export { CaptureScreen } from '@/features/capture/CaptureScreen';

// P5 features.
export { WinesScreen } from '@/features/wines/WinesScreen';
export { EventsScreen } from '@/features/events/EventsScreen';
export { FlightsScreen } from '@/features/flights/FlightsScreen';

export const StatsScreen = (): ReactNode => (
  <Placeholder title="Stats" blurb="Client-side dashboard over Dexie. Built in P6." />
);

// Real builder lives in features/templates (P3).
export { TemplatesScreen } from '@/features/templates/TemplatesScreen';

const TABLES = ['templates', 'events', 'wines', 'notes', 'flights', 'photos', 'geoRegions', 'outbox'] as const;
type Counts = Record<(typeof TABLES)[number], number>;

export const SettingsScreen = (): ReactNode => {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [log, setLog] = useState<string>('');

  const refresh = useCallback(async () => {
    const entries = await Promise.all(TABLES.map(async (t) => [t, await db.table(t).count()] as const));
    setCounts(Object.fromEntries(entries) as Counts);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Round-trip a throwaway wine: save (→ outbox upsert) then soft-delete (→ outbox delete).
  const runSelfTest = useCallback(async () => {
    const wine: Wine = {
      ...newBase(),
      producer: 'Self-test',
      label: 'Diagnostic',
      vintage: null,
      variety: [],
      geo_country: '',
      geo_region: '',
      geo_subregion_appellation: '',
      geo_vineyard: '',
      geo_ref_id: null,
      price: null,
      source: '',
      abv: null,
    };
    const saved = await repo.wines.save(wine);
    const live = (await repo.wines.list()).some((w) => w.id === saved.id);
    await repo.wines.remove(saved.id);
    const goneFromList = !(await repo.wines.list()).some((w) => w.id === saved.id);
    const softDeleted = (await db.wines.get(saved.id))?.deleted === true;
    setLog(
      `save v${saved.version} → listed:${live} · after remove → listed:${!goneFromList ? 'still!' : 'no'} · soft-deleted:${softDeleted}`,
    );
    await refresh();
  }, [refresh]);

  return (
    <section className="screen">
      <h1 className="screen-title">Settings</h1>
      <p className="screen-blurb">Saved style, export, account. Built in P7.</p>

      <h2 className="screen-subtitle">Storage (P2 diagnostics)</h2>
      <div className="kv">
        {counts
          ? TABLES.map((t) => (
              <div className="kv-row" key={t}>
                <span>{t}</span>
                <span>{counts[t]}</span>
              </div>
            ))
          : 'opening database…'}
      </div>
      <button className="btn" onClick={() => void runSelfTest()}>
        Run storage self-test
      </button>
      {log && <pre className="log">{log}</pre>}
    </section>
  );
};
