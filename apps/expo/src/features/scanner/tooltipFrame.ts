import type { OcrBlock } from "./anchor";
import { similarity } from "./anchor";

export interface TooltipFrame {
  left: number;
  right: number;
  top: number;
  bottom: number;
  equipped: OcrBlock;
  unequip?: OcrBlock;
}

const ANCHOR_THRESHOLD = 0.75;

// Compare letters only, so a fused button glyph or divider diamond ("P
// Unequip", "EQUIPPED ◆") doesn't sink the match.
function letters(text: string): string {
  return text.toUpperCase().replace(/[^A-Z]/g, "");
}

// Whole-block match only - unlike findAnchor, no substring containment, since
// the tooltip footer's "Unique Equipped" line also contains "EQUIPPED".
function isEquippedHeader(b: OcrBlock): boolean {
  return similarity(letters(b.text), "EQUIPPED") >= ANCHOR_THRESHOLD;
}

// Substring containment is safe here - "Unequip" appears nowhere else in the
// tooltip, and ML Kit often fuses the key-binding glyph into the same line.
function isUnequipAction(b: OcrBlock): boolean {
  const text = letters(b.text);
  return (
    text.includes("UNEQUIP") || similarity(text, "UNEQUIP") >= ANCHOR_THRESHOLD
  );
}

/**
 * Bounds an equipped-item tooltip using its fixed chrome: the grey
 * "EQUIPPED" header bar marks the top and (since the word is centered in the
 * bar) the tooltip's horizontal center; the "Unequip" action below the
 * tooltip marks the bottom and, being left-aligned inside the border, the
 * left edge. The right edge mirrors the left around the center. Everything
 * outside - player nameplates, the character panel, the paper doll, keyword
 * popups below the action bar - is excluded.
 */
export function findTooltipFrame(
  blocks: OcrBlock[],
  imageWidth: number,
  imageHeight: number,
): TooltipFrame | undefined {
  const equipped = blocks
    .filter(isEquippedHeader)
    .sort((a, b) => a.frame.y - b.frame.y)[0];
  if (!equipped) return undefined;

  const top = equipped.frame.y + equipped.frame.height;
  const centerX = equipped.frame.x + equipped.frame.width / 2;

  const unequip = blocks
    .filter((b) => b.frame.y > top && isUnequipAction(b))
    .sort((a, b) => a.frame.y - b.frame.y)[0];

  // The "Unequip" text starts after its button glyph, which puts it right of
  // the tooltip's own text column - step left ~2.5 line heights to reach the
  // border. Without it, fall back to the header word's width: the grey bar
  // is roughly 5x as wide as the word.
  const halfWidth = unequip
    ? centerX - (unequip.frame.x - equipped.frame.height * 2.5)
    : equipped.frame.width * 2.5;

  return {
    left: Math.max(0, centerX - halfWidth),
    right: Math.min(imageWidth, centerX + halfWidth),
    top,
    bottom: unequip ? unequip.frame.y : imageHeight,
    equipped,
    unequip,
  };
}

export function blocksInFrame(
  blocks: OcrBlock[],
  frame: TooltipFrame,
): OcrBlock[] {
  return blocks.filter(
    (b) =>
      b.frame.y >= frame.top &&
      b.frame.y + b.frame.height <= frame.bottom &&
      b.frame.x >= frame.left &&
      b.frame.x + b.frame.width <= frame.right,
  );
}
