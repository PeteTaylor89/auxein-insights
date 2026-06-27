import Dexie, { type Table } from 'dexie';
import type {
  Flight,
  GeoRegion,
  Meta,
  Note,
  OutboxItem,
  Photo,
  TasteEvent,
  Template,
  Wine,
} from './types';

// Dexie is the system of record at capture (spec §2). Schema strings list indexed
// properties only; the full object is stored regardless. First entry = primary key.
export class TasteDB extends Dexie {
  templates!: Table<Template, string>;
  events!: Table<TasteEvent, string>;
  wines!: Table<Wine, string>;
  notes!: Table<Note, string>;
  flights!: Table<Flight, string>;
  photos!: Table<Photo, string>;
  geoRegions!: Table<GeoRegion, string>;
  meta!: Table<Meta, string>;
  outbox!: Table<OutboxItem, number>;

  constructor() {
    super('auxein_taste');
    const stores = {
      templates: 'id, kind, is_builtin, updated_at, deleted',
      events: 'id, date, updated_at, deleted',
      wines: 'id, producer, geo_region, geo_ref_id, updated_at, deleted',
      notes: 'id, wine_id, event_id, flight_id, template_id, updated_at, deleted',
      flights: 'id, event_id, updated_at, deleted',
      photos: 'id, note_id, status, updated_at, deleted',
      geoRegions: 'id, parent_id, level, country_code, name',
      meta: 'key',
      outbox: '++seq, entity, id, [entity+id]',
    };
    this.version(1).stores(stores);

    // v2 (R3): Note.values became the reconciliation envelope { raw, raw_scale?,
    // canonical? } and gained blind_conclusions. Pre-R3 notes stored flat raw
    // values and would break the readers, so clear the note-shaped stores on
    // upgrade (no production data — see TASTE_DEV_PLAN R3). Indexes are unchanged.
    this.version(2)
      .stores(stores)
      .upgrade(async (tx) => {
        await tx.table('notes').clear();
        await tx.table('photos').clear();
        await tx.table('outbox').clear();
        await tx.table('flights').toCollection().modify((f: { note_ids?: string[] }) => {
          f.note_ids = [];
        });
      });
  }
}

export const db = new TasteDB();
