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
    this.version(1).stores({
      templates: 'id, kind, is_builtin, updated_at, deleted',
      events: 'id, date, updated_at, deleted',
      wines: 'id, producer, geo_region, geo_ref_id, updated_at, deleted',
      notes: 'id, wine_id, event_id, flight_id, template_id, updated_at, deleted',
      flights: 'id, event_id, updated_at, deleted',
      photos: 'id, note_id, status, updated_at, deleted',
      geoRegions: 'id, parent_id, level, country_code, name',
      meta: 'key',
      outbox: '++seq, entity, id, [entity+id]',
    });
  }
}

export const db = new TasteDB();
