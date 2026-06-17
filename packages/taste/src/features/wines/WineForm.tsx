import { useState } from 'react';
import type { Wine } from '@/db';
import { WineFields } from './WineFields';

// Re-export so existing importers of `emptyWine` from WineForm keep working.
export { emptyWine } from './WineFields';

interface Props {
  draft: Wine;
  onSave: (wine: Wine) => void | Promise<void>;
  onCancel: () => void;
}

export function WineForm({ draft, onSave, onCancel }: Props) {
  const [wine, setWine] = useState<Wine>(draft);
  const [error, setError] = useState('');

  const submit = () => {
    if (!wine.label.trim() && !wine.producer.trim()) {
      setError('Add a producer or label first.');
      return;
    }
    void onSave({ ...wine, producer: wine.producer.trim(), label: wine.label.trim(), source: wine.source.trim() });
  };

  return (
    <section className="screen">
      <div className="builder-head">
        <h1 className="screen-title">{draft.version > 0 ? 'Edit wine' : 'New wine'}</h1>
        <div className="template-card-tools">
          <button className="btn btn--ghost" onClick={onCancel}>Cancel</button>
          <button className="btn" onClick={submit}>Save</button>
        </div>
      </div>

      <div className="grid-section">
        <WineFields wine={wine} onChange={setWine} />
      </div>

      {error && <p className="form-error">{error}</p>}
    </section>
  );
}
