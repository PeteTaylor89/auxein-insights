import { useCallback, useEffect, useState } from 'react';
import { repo } from '@/db';
import type { Wine } from '@/db';
import { WineForm, emptyWine } from './WineForm';
import { wineLabel, wineOrigin } from './wineLabel';

// Wines: the real wine entity (replaces the P4 inline quick-entry). List +
// create/edit/delete via WineForm; variety + geo typeahead live in the form.
export function WinesScreen() {
  const [wines, setWines] = useState<Wine[]>([]);
  const [editing, setEditing] = useState<Wine | null>(null);

  const load = useCallback(async () => {
    const all = await repo.wines.list();
    all.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    setWines(all);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async (wine: Wine) => {
    await repo.wines.save(wine);
    setEditing(null);
    await load();
  };

  const remove = async (w: Wine) => {
    await repo.wines.remove(w.id);
    await load();
  };

  if (editing) {
    return <WineForm draft={editing} onSave={handleSave} onCancel={() => setEditing(null)} />;
  }

  return (
    <section className="screen">
      <div className="builder-head">
        <h1 className="screen-title">Wines</h1>
        <button className="btn" onClick={() => setEditing(emptyWine())}>+ New wine</button>
      </div>

      {wines.length === 0 && <p className="screen-blurb">No wines yet. Add one, or capture a note.</p>}

      <div className="template-list">
        {wines.map((w) => {
          const origin = wineOrigin(w);
          return (
            <div className="template-card" key={w.id}>
              <div className="template-card-main">
                <div className="template-card-title">{wineLabel(w)}</div>
                <div className="template-card-meta">
                  {[w.variety.join(', '), origin].filter(Boolean).join(' · ') || 'No detail yet'}
                </div>
              </div>
              <div className="template-card-tools">
                <button className="btn btn--ghost" onClick={() => setEditing(structuredClone(w))}>Edit</button>
                <button className="icon-btn icon-btn--danger" onClick={() => void remove(w)} aria-label="Delete wine">✕</button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
