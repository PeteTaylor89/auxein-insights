import { useCallback, useEffect, useState } from 'react';
import { newBase, repo } from '@/db';
import type { Template } from '@/db';
import { TemplateBuilder } from '@/features/builder/TemplateBuilder';

// Grids: list templates (builtin CMS + custom) and edit/duplicate via the builder.
export function TemplatesScreen() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [editing, setEditing] = useState<Template | null>(null);

  const load = useCallback(async () => {
    const all = await repo.templates.list();
    all.sort((a, b) => Number(b.is_builtin) - Number(a.is_builtin) || a.name.localeCompare(b.name));
    setTemplates(all);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const startNew = () =>
    setEditing({ ...newBase(), name: '', kind: 'custom', is_builtin: false, sections: [] });

  const startEdit = (t: Template) => setEditing(structuredClone(t));

  const duplicate = (t: Template) =>
    setEditing({
      ...newBase(),
      name: `${t.name} (copy)`,
      kind: 'custom',
      is_builtin: false,
      sections: structuredClone(t.sections),
    });

  const remove = async (t: Template) => {
    await repo.templates.remove(t.id);
    await load();
  };

  const handleSave = async (draft: Template) => {
    await repo.templates.save(draft);
    setEditing(null);
    await load();
  };

  if (editing) {
    return <TemplateBuilder draft={editing} onSave={handleSave} onCancel={() => setEditing(null)} />;
  }

  return (
    <section className="screen">
      <div className="builder-head">
        <h1 className="screen-title">Grids</h1>
        <button className="btn" onClick={startNew}>
          + New grid
        </button>
      </div>

      {templates.length === 0 && <p className="screen-blurb">No grids yet.</p>}

      <div className="template-list">
        {templates.map((t) => {
          const fieldCount = t.sections.reduce((n, s) => n + s.fields.length, 0);
          return (
            <div className="template-card" key={t.id}>
              <div className="template-card-main">
                <div className="template-card-title">
                  {t.name || 'Untitled'}
                  {t.is_builtin && <span className="badge">Built-in</span>}
                </div>
                <div className="template-card-meta">
                  {t.sections.length} sections · {fieldCount} fields · v{t.version}
                </div>
              </div>
              <div className="template-card-tools">
                {t.is_builtin ? (
                  <button className="btn btn--ghost" onClick={() => duplicate(t)}>
                    Duplicate
                  </button>
                ) : (
                  <>
                    <button className="btn btn--ghost" onClick={() => startEdit(t)}>
                      Edit
                    </button>
                    <button className="icon-btn icon-btn--danger" onClick={() => void remove(t)} aria-label="Delete grid">
                      ✕
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
