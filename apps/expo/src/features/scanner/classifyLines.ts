import type { ItemLine, ItemLineKind } from "@acme/validators";

import type { OcrBlock } from "./anchor";
import { itemConfig } from "./config";

function colorNear(
  color: OcrBlock["color"],
  hex: string,
  threshold: number,
): boolean {
  if (!color) return false;
  const n = parseInt(hex.replace("#", ""), 16);
  const target = { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
  const d = Math.sqrt(
    (color.r - target.r) ** 2 +
      (color.g - target.g) ** 2 +
      (color.b - target.b) ** 2,
  );
  return d <= threshold;
}

const ITEM_POWER_PATTERN = /item power/i;
const ARMOR_PATTERN = /^\d[\d,]* armor$/i;
const DPS_PATTERN = /damage per second|\d+(\.\d+)?\s*-\s*\d+(\.\d+)?/i;
const SOCKET_PATTERN = /empty socket/i;
// A "plain" affix line - leads with a sign, digit, or percent, e.g.
// "+20% Damage" or "12% Damage Reduction".
const AFFIX_PATTERN = /^[+\d%]/;

function classifyOne(block: OcrBlock): ItemLineKind {
  const text = block.text.trim();
  if (ITEM_POWER_PATTERN.test(text)) return "itemPower";
  if (ARMOR_PATTERN.test(text)) return "armor";
  if (DPS_PATTERN.test(text)) return "dps";
  if (SOCKET_PATTERN.test(text)) return "socket";
  if (
    colorNear(
      block.color,
      itemConfig.aspectColor,
      itemConfig.aspectColorThreshold,
    )
  ) {
    return "aspect";
  }
  // A "*" anywhere on an affix line marks it as a rolled Greater Affix (one
  // "*" per starred attribute) - distinct from the item-name star count.
  if (text.includes("*")) return "greater";
  if (AFFIX_PATTERN.test(text)) return "affix";
  return "other";
}

/**
 * Classifies the affix-region OcrBlock[] that `extractItemFields` already
 * isolated into typed ItemLines (item power, armor/DPS stat rows, sockets,
 * aspect paragraph, implicits vs. affixes, and an "other" fallback).
 *
 * Aspect-colored text is a special case: the aspect paragraph on a legendary
 * item routinely wraps across multiple OCR blocks, so consecutive
 * aspect-colored blocks are merged into a single line with concatenated
 * text rather than emitted as separate lines.
 */
export function classifyLines(blocks: OcrBlock[]): ItemLine[] {
  const sorted = [...blocks].sort((a, b) => a.frame.y - b.frame.y);

  // The biggest vertical gap between consecutive blocks stands in for the
  // implicit/affix divider ML Kit doesn't report as its own element. Blocks
  // above it default to "implicit" when nothing else claims them - found
  // before per-line classification so rules like affix/aspect/socket can
  // still override it regardless of position.
  let dividerIndex = -1;
  let maxGap: number = itemConfig.implicitDividerGapPx;
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    if (!prev || !curr) continue;
    const gap = curr.frame.y - (prev.frame.y + prev.frame.height);
    if (gap > maxGap) {
      maxGap = gap;
      dividerIndex = i;
    }
  }

  const result: ItemLine[] = [];
  sorted.forEach((block, i) => {
    let kind = classifyOne(block);
    if (kind === "other" && dividerIndex !== -1 && i < dividerIndex) {
      kind = "implicit";
    }

    const prevLine = result[result.length - 1];
    if (kind === "aspect" && prevLine?.kind === "aspect") {
      prevLine.text = `${prevLine.text} ${block.text}`;
      return;
    }
    result.push({ kind, text: block.text });
  });
  return result;
}
