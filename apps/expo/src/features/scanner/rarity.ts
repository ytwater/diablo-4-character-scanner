import { itemConfig } from "./config";

export interface Rgb {
  r: number;
  g: number;
  b: number;
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
