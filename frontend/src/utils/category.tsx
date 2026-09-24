import type { Icon } from '@phosphor-icons/react';
import {
  CookingPotIcon, BowlSteamIcon, CheeseIcon, LeafIcon, FireIcon, IceCreamIcon, CoffeeIcon, BreadIcon, ForkKnifeIcon,
} from '@phosphor-icons/react';

export type Tone = 'saffron' | 'pomegranate' | 'emerald' | 'sky' | 'violet' | 'amber' | 'teal' | 'rose';
const TONES: Tone[] = ['saffron', 'violet', 'emerald', 'sky', 'pomegranate', 'amber', 'teal', 'rose'];

const RULES: { match: RegExp; tone: Tone; icon: Icon }[] = [
  { match: /горяч|основн/i,            tone: 'saffron',     icon: CookingPotIcon },
  { match: /суп|шурп/i,                tone: 'amber',       icon: BowlSteamIcon },
  { match: /закус/i,                   tone: 'violet',      icon: CheeseIcon },
  { match: /салат|овощ/i,              tone: 'emerald',     icon: LeafIcon },
  { match: /грил|шашлык|мангал/i,      tone: 'rose',        icon: FireIcon },
  { match: /десерт|слад/i,             tone: 'pomegranate', icon: IceCreamIcon },
  { match: /напит|чай|кофе|бар/i,      tone: 'sky',         icon: CoffeeIcon },
  { match: /хлеб|выпеч|лепёш|лепеш/i, tone: 'teal',        icon: BreadIcon },
];

/** Stable colour + icon for a category: by name when recognised, otherwise by id. */
export function categoryStyle(name: string | undefined | null, id?: number | null): { tone: Tone; Icon: Icon } {
  const rule = name ? RULES.find((r) => r.match.test(name)) : undefined;
  if (rule) return { tone: rule.tone, Icon: rule.icon };
  return { tone: TONES[Math.abs(id ?? 0) % TONES.length], Icon: ForkKnifeIcon };
}
