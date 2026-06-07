import cmsSeed from './cms-seed.json';
import { db, meta, nowIso } from '@/db';
import type { Template } from '@/db';
import type { TemplateSection } from './types';

interface CmsSeed {
  id: string;
  name: string;
  version: number;
  sections: TemplateSection[];
}

const SEED_META_KEY = 'seed:cms:version';

const union = (base: string[] = [], extra: string[] = []): string[] => [
  ...base,
  ...extra.filter((x) => !base.includes(x)),
];

// Merge user-added descriptors (from the in-app "+ add") into a newer seed so a
// version bump never drops terms the user added to the builtin grid. Seed defines
// structure + order; existing-only options/group-terms are appended.
function mergeSeed(seed: TemplateSection[], existing: TemplateSection[]): TemplateSection[] {
  const exFields = new Map(existing.flatMap((s) => s.fields).map((f) => [f.key, f]));
  return seed.map((section) => ({
    ...section,
    fields: section.fields.map((f) => {
      const prev = exFields.get(f.key);
      if (!prev) return f;
      const merged = { ...f };
      if (f.options) merged.options = union(f.options, prev.options);
      if (f.groups) {
        merged.groups = f.groups.map((g) => {
          const pg = prev.groups?.find((x) => x.label === g.label);
          return pg ? { ...g, options: union(g.options, pg.options) } : g;
        });
      }
      return merged;
    }),
  }));
}

// Seed builtin templates on first run. Idempotent + re-seeds when the bundled
// seed version is newer. The CMS grid is just a builtin Template (kind 'cms',
// is_builtin true → locked from edit/delete; users duplicate it to customise).
//
// Seeded directly (not via repo.save) so it never enters the outbox — it's
// shipped reference content, not a user mutation. created_at is preserved so a
// re-seed doesn't rewrite history; version tracks the bundled seed, not edits.
export async function seedBuiltins(): Promise<void> {
  const seed = cmsSeed as unknown as CmsSeed;
  const installed = (await meta.get<number>(SEED_META_KEY, 0)) ?? 0;
  if (installed >= seed.version) return;

  const existing = await db.templates.get(seed.id);
  const ts = nowIso();
  const sections = existing ? mergeSeed(seed.sections, existing.sections) : seed.sections;
  const row: Template = {
    id: seed.id,
    name: seed.name,
    kind: 'cms',
    sections,
    is_builtin: true,
    created_at: existing?.created_at ?? ts,
    updated_at: ts,
    version: seed.version,
    deleted: false,
  };
  await db.templates.put(row);
  await meta.set(SEED_META_KEY, seed.version);
}
