// IMW tasting lexicons — the vocabulary an MW candidate is expected to write with.
// Source: docs/taste_plan/Update_Sept 2027/IMW-Tasting-Lexicons.pdf (Institute of
// Masters of Wine), transcribed verbatim.
//
// WHY THIS IS A FRONTEND CONSTANT, not seeded vocab rows (deviation from
// TASTE_MW_CAPTURE_REDESIGN.md §3.2): the plan assumed the lexicon could be
// seeded as `user_id IS NULL` rows the way builtin templates are. It can't —
// `templates.user_id` is nullable but `vocab.user_id` is `nullable=False`, and
// `list_vocab` filters strictly on `user_id == me`. Global rows would need a
// migration AND an API change for data that is fixed, public and ~250 terms.
// So the lexicon ships in the bundle; `taste.vocab` keeps doing its actual job,
// which is the terms THIS taster adds. Both merge into one rail at render.

export interface LexiconBank {
  /** matches TemplateField.lexicon_dimension */
  key: string;
  /** shown as the rail's label */
  label: string;
  terms: string[];
}

export const LEXICON: LexiconBank[] = [
  {
    key: 'colour',
    label: 'Colour',
    terms: ['clarity', 'brilliant', 'bright', 'deep', 'dark', 'translucent', 'flushed', 'viscosity',
      'limpid', 'mid-depth', 'opaque', 'light', 'dull', 'cloudy', 'pale'],
  },
  {
    key: 'fruit',
    label: 'Fruit',
    terms: ['forward', 'ripe', 'opulent', 'tropical', 'rich', 'generous', 'honeyed', 'supple',
      'primary', 'secondary', 'exotic', 'concentrated', 'high-toned', 'grassy', 'vinous', 'leafy',
      'sinewy', 'thin', 'lean', 'stemmy', 'appley', 'citrus', 'intensity', 'floral', 'clean', 'steely'],
  },
  {
    key: 'acidity',
    label: 'Acidity',
    terms: ['low', 'moderate', 'high', 'fresh', 'crisp', 'pronounced', 'marked', 'searing', 'racy',
      'malic', 'tartaric', 'tart', 'refreshing', 'sour', 'bitter', 'astringent', 'flabby', 'soft'],
  },
  {
    key: 'tannin',
    label: 'Tannin',
    terms: ['soft', 'light', 'moderate', 'high', 'ripe', 'firm', 'rounded', 'silky', 'velvety', 'fine',
      'grippy', 'broad', 'dry', 'dusty', 'aggressive', 'astringent', 'hard', 'coarse', 'harsh',
      'green', 'oaky', 'stalky'],
  },
  {
    key: 'alcohol',
    label: 'Alcohol',
    terms: ['low', 'moderate', 'high', 'generous', 'burning', 'hot', 'spirity', 'watery'],
  },
  {
    key: 'texture',
    label: 'Texture',
    terms: ['smooth', 'silky', 'opulent', 'velvety', 'rich', 'round', 'succulent', 'supple',
      'persistent', 'viscous', 'voluptuous', 'soft', 'fat', 'concentrated', 'sinewy', 'thin', 'hard',
      'steely', 'lean', 'dilute', 'clean', 'dry', 'sweet', 'flat', 'full bodied', 'flabby', 'mineral'],
  },
  {
    key: 'structure',
    label: 'Structure',
    terms: ['light', 'delicate', 'supple', 'restrained', 'generous', 'firm', 'forward', 'broad',
      'depth', 'elegant', 'fine', 'taut', 'concentrated', 'pure', 'thin', 'lean', 'grip', 'rigid',
      'hard', 'unbalanced', 'steely', 'low intensity', 'muscular', 'neutral', 'subdued', 'weighty',
      'fat', 'over-extracted', 'one-dimensional', 'fractured', 'angular', 'backward', 'limp'],
  },
  {
    key: 'quality',
    label: 'Quality',
    terms: ['integrated', 'balanced', 'harmonious', 'elegant', 'finesse', 'refined', 'length',
      'prolonged', 'aftertaste', 'voluptuous', 'silky', 'racy', 'unbalanced', 'clumsy', 'dull',
      'flat', 'austere', 'dilute', 'short', 'premium', 'mid-market', 'mid-range', 'bulk'],
  },
  {
    key: 'maturity',
    label: 'Maturity',
    terms: ['youthful', 'young', 'immature', 'fresh', 'vibrant', 'lively', 'developed', 'evolved',
      'peaking', 'closed', 'mature', 'fading', 'drying out', 'dumb', 'tired', 'past it', 'aged',
      'potential'],
  },
  {
    key: 'oak',
    label: 'Oak',
    terms: ['toasted', 'buttery', 'integrated', 'cedar', 'coconut', 'vanillin', 'mocha', 'sweet'],
  },
  {
    key: 'nose',
    label: 'Nose',
    terms: ['spicy', 'closed', 'open', 'oxidized', 'reductive', 'earthy', 'gamey', 'overt', 'sappy',
      'grapey', 'tropical', 'pungent', 'aromatic', 'fragrant', 'mineral', 'herbaceous', 'restrained'],
  },

  // --- Page 2: "Synonyms and Other Useful Words" -----------------------------
  // These are the argument connectives. The guidelines mark the difference
  // between suggesting and proving as the thing examiners actually reward, so
  // they are first-class banks, not decoration.
  {
    key: 'positives',
    label: 'Positive',
    terms: ['striking', 'lively', 'vivid', 'prominent', 'defined', 'distinctive', 'appealing',
      'attractive', 'rich', 'silky', 'racy', 'positive', 'intense', 'concentrated', 'persistent',
      'pronounced', 'prolonged', 'integrated', 'harmonious', 'balanced', 'deep'],
  },
  {
    key: 'negatives',
    label: 'Negative',
    terms: ['lack of', 'hollow', 'devoid of', 'subdued', 'lacks', 'restrained', 'flabby', 'undefined',
      'dull', 'neutral', 'low key', 'obtrusive', 'shallow'],
  },
  {
    key: 'suggests',
    label: 'Suggests',
    terms: ['indicates', 'indicative of', 'points to', 'suggests', 'illustrates', 'demonstrates',
      'expresses', 'establishes', 'shows', 'signifies', 'emphasizes', 'impression', 'potentially',
      'consistent with', 'composition', 'typicity', 'emphasis on', 'incisive use of', 'evidence of',
      'expansive'],
  },
  {
    key: 'proves',
    label: 'Proves',
    terms: ['confirms', 'supports', 'shows', 'highlights', 'underlines', 'denotes', 'reveals',
      'influenced by', 'defines', 'signifies'],
  },
];

const BY_KEY = new Map(LEXICON.map((b) => [b.key, b]));

/** Resolve a field's `lexicon_dimension` (one key, or several) to its banks. */
export function banksFor(dimension: string | string[] | undefined): LexiconBank[] {
  if (!dimension) return [];
  const keys = Array.isArray(dimension) ? dimension : [dimension];
  return keys.map((k) => BY_KEY.get(k)).filter((b): b is LexiconBank => !!b);
}

/**
 * Splice a lexicon term into prose at the caret, repairing spacing on both
 * sides. Pure so the spacing rules are testable — this is the part that decides
 * whether tapping mid-sentence reads as writing or as a glitch.
 *
 * Returns the new text and where the caret should land (after the term).
 */
export function insertTerm(
  value: string,
  start: number,
  end: number,
  term: string,
): { text: string; caret: number } {
  const before = value.slice(0, start);
  const after = value.slice(end);
  // No leading space at the very start, or straight after whitespace/an opener.
  const lead = before.length > 0 && !/[\s([]$/.test(before) ? ' ' : '';
  // No trailing space before existing whitespace or closing punctuation.
  const trail = after.length > 0 && !/^[\s,.;:)\]]/.test(after) ? ' ' : '';
  return {
    text: `${before}${lead}${term}${trail}${after}`,
    caret: start + lead.length + term.length,
  };
}
