import type { ItemRarity } from "@acme/validators";

import { itemConfig } from "./config";

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

// The item's type line spells its rarity out in plain text ("Unique Ring",
// "Ancestral Magic Boots", "Ancestral Mythic Unique Quarterstaff") - parsing
// that is far more reliable than sampling pixel color, which is sensitive to
// framing/lighting/JPEG compression and ML Kit's block-vs-line grouping.
// Check "mythic unique" before "unique" since the plain word is a substring
// of it. `\W*` (not just `\s*`) between the two words tolerates an OCR
// misread inserting stray punctuation where the space should be (e.g.
// "Mythic'Unique").
const RARITY_TEXT_PATTERNS: [ItemRarity, RegExp][] = [
  ["mythicUnique", /mythic\W*unique/i],
  ["unique", /\bunique\b/i],
  ["legendary", /\blegendary\b/i],
  ["rare", /\brare\b/i],
  ["magic", /\bmagic\b/i],
  ["common", /\bcommon\b/i],
];

export function parseRarityFromTypeLine(text: string): ItemRarity | undefined {
  for (const [rarity, pattern] of RARITY_TEXT_PATTERNS) {
    if (pattern.test(text)) return rarity;
  }
  return undefined;
}

/**
 * Falls back to scanning every candidate line (name, type, affixes) for a
 * rarity word, for when name/type-line detection itself got confused by a
 * bad capture and the rarity word landed somewhere else entirely (e.g. as
 * an affix line instead of the type line).
 */
export function parseRarityFromAnyLine(
  texts: (string | undefined)[],
): ItemRarity | undefined {
  for (const text of texts) {
    if (!text) continue;
    const rarity = parseRarityFromTypeLine(text);
    if (rarity) return rarity;
  }
  return undefined;
}

function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.replace("#", ""), 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

function distance(a: Rgb, b: Rgb): number {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

export function classifyRarity(rgb: Rgb): string | undefined {
  let best: string | undefined;
  let bestDistance = Infinity;

  for (const [rarity, hex] of Object.entries(itemConfig.rarityColors)) {
    const d = distance(rgb, hexToRgb(hex));
    if (d < bestDistance) {
      bestDistance = d;
      best = rarity;
    }
  }

  return bestDistance <= itemConfig.rarityColorThreshold ? best : undefined;
}
