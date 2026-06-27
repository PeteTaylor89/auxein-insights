import type { ReactNode } from 'react';
import { Award, ClipboardList, Eye, Grape, Wind, Wine } from 'lucide-react';

// Section header icons (lucide line-icons, matching Grow's chrome). Keyed by a
// keyword in the section label so custom grids with similar names still resolve.
export function sectionIcon(label: string): ReactNode {
  const l = label.toLowerCase();
  const props = { size: 16, strokeWidth: 2, 'aria-hidden': true } as const;
  if (l.includes('sight')) return <Eye {...props} />;
  if (l.includes('nose') || l.includes('aroma')) return <Wind {...props} />;
  if (l.includes('flav')) return <Grape {...props} />;
  if (l.includes('palate') || l.includes('structure')) return <Wine {...props} />;
  if (l.includes('assess') || l.includes('quality') || l.includes('score')) return <Award {...props} />;
  if (l.includes('conclusion')) return <ClipboardList {...props} />;
  return <Wine {...props} />;
}

// Emoji per aroma/descriptor category (colourful, instant, no per-term lookup).
// Matched by keyword against the descriptor group label.
const AROMA_EMOJI: [RegExp, string][] = [
  [/citrus/, '🍋'],
  [/orchard/, '🍏'],
  [/stone/, '🍑'],
  [/tropical/, '🍍'],
  [/blue/, '🫐'],
  [/black/, '🍇'],
  [/red/, '🍒'],
  [/berry|other/, '🍓'],
  [/dried/, '🍇'],
  [/ros/, '🌷'],
  [/flower/, '🌸'],
  [/herb/, '🌿'],
  [/veget/, '🥦'],
  [/organic|earth/, '🍄'],
  [/mineral/, '🪨'],
  [/baking/, '🧁'],
  [/spice/, '🌶️'],
  [/oak/, '🛢️'],
  [/malo|cream|butter/, '🧈'],
  [/lees/, '🍞'],
  [/carbonic/, '🍌'],
  [/botrytis|honey/, '🍯'],
  [/tertiary|white/, '🍂'],
];

export function aromaEmoji(groupLabel: string): string {
  const l = groupLabel.toLowerCase();
  for (const [re, emoji] of AROMA_EMOJI) if (re.test(l)) return emoji;
  return '🍷';
}
