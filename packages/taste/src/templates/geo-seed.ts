import geoSeed from './geo-seed.json';
import { db, geo, meta } from '@/db';
import type { GeoRegion } from '@/db';
import { slugify } from './factory';

// Nested authoring shape (geo-seed.json). Compact + human-editable; flattened
// into the self-referential GeoRegion rows (dev-plan §4.5) at seed time so we
// never hand-materialise hundreds of slugs/paths.
interface SeedNode {
  name: string;
  kind?: string;
  aliases?: string[];
  children?: SeedNode[];
}
interface SeedCountry {
  name: string;
  code: string;
  aliases?: string[];
  children: SeedNode[];
}
interface GeoSeedFile {
  version: number;
  countries: SeedCountry[];
}

const SEED_META_KEY = 'seed:geo:version';

// Default human label for a depth when the node omits `kind`.
const KIND_BY_LEVEL = ['country', 'region', 'appellation', 'vineyard'];

// Walk the tree, computing id (parent.id + '-' + slug), materialised path, and
// denormalised country_code on every node.
function flatten(file: GeoSeedFile): GeoRegion[] {
  const rows: GeoRegion[] = [];

  const visit = (
    node: { name: string; kind?: string; aliases?: string[]; children?: SeedNode[] },
    parentId: string | null,
    level: number,
    countryCode: string,
    parentPath: string,
    idPrefix: string,
  ) => {
    const slug = slugify(node.name);
    const id = idPrefix ? `${idPrefix}-${slug}` : slug;
    const path = parentPath ? `${parentPath} › ${node.name}` : node.name;
    rows.push({
      id,
      parent_id: parentId,
      level,
      kind: node.kind ?? KIND_BY_LEVEL[level] ?? 'region',
      name: node.name,
      country_code: countryCode,
      path,
      aliases: node.aliases,
      gi_id: null,
    });
    for (const child of node.children ?? []) {
      visit(child, id, level + 1, countryCode, path, id);
    }
  };

  for (const country of file.countries) {
    // Country id is the ISO code (lowercased), not a name slug.
    const code = country.code.toLowerCase();
    rows.push({
      id: code,
      parent_id: null,
      level: 0,
      kind: 'country',
      name: country.name,
      country_code: country.code,
      path: country.name,
      aliases: country.aliases,
      gi_id: null,
    });
    for (const child of country.children) {
      visit(child, code, 1, country.code, country.name, code);
    }
  }

  return rows;
}

// Seed the geo reference tree on first run. Reference data — overwrite by id is
// fine (no user edits to preserve, unlike templates). Version-gated so a corpus
// bump re-seeds; stale rows from a shrunk corpus are cleared first.
export async function seedGeo(): Promise<void> {
  const file = geoSeed as GeoSeedFile;
  const installed = (await meta.get<number>(SEED_META_KEY, 0)) ?? 0;
  if (installed >= file.version) return;

  const rows = flatten(file);
  if (installed > 0) await db.geoRegions.clear(); // re-seed: drop the old corpus
  await geo.bulkSeed(rows);
  await meta.set(SEED_META_KEY, file.version);
}
