import type { TextBlock } from "./anchor";

export type ScanMode = "item" | "character" | "none";

/**
 * Decides what the camera is currently pointed at.
 *
 * Item tooltips overlay the character sheet rather than replacing it, so a
 * single frame routinely contains both "CHARACTER" and "EQUIPPED" -- the real
 * captures all do. The tooltip is the foreground thing the user is aiming at,
 * so it wins whenever it's present.
 */
/**
 * Signals that a tooltip is in frame. Several independent ones, because
 * relying on a single token is fragile: an exact-match test for a line reading
 * "EQUIPPED" failed on device the moment OCR added stray characters, and the
 * screen silently fell back to character mode.
 */
const ITEM_SIGNALS = [
  /\bequipped\b/i,
  /\bite[mn]n?\s*power\b/i,
  /\b(unique|legendary|mythic|rare|magic|ancestral)\s+\w/i,
  /\brequires\s+level\b/i,
  /\bsell\s+value\b/i,
];

export function detectMode(blocks: TextBlock[]): ScanMode {
  const text = blocks.map((b) => b.text).join("\n");

  const itemScore = ITEM_SIGNALS.filter((re) => re.test(text)).length;
  if (itemScore > 0) return "item";
  if (/\bcharacter\b/i.test(text)) return "character";
  return "none";
}
