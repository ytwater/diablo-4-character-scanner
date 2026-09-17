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
export function detectMode(blocks: TextBlock[]): ScanMode {
  const text = blocks.map((b) => b.text).join("\n");

  if (/^\s*equipped\s*$/im.test(text)) return "item";
  if (/\bcharacter\b/i.test(text)) return "character";
  return "none";
}
