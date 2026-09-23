import type { OcrBlock } from "./anchor";

export interface ItemFieldCandidates {
  name?: OcrBlock;
  type?: OcrBlock;
  affixes: string[];
}

// Every Diablo 4 item tooltip has a "Requires Level" line directly below the
// affix list and above the Sell Value / Durability / Tempers / action-button
// footer, so it makes a reliable stop marker for where affixes end.
const FOOTER_START_PATTERN = /requires level/i;

// The "CHARACTER" tab header can end up inside the ROI depending on framing
// and isn't part of the item itself. ML Kit sometimes fuses the adjacent tab
// icon into the same block (e.g. "CHARACTER O"), so match on the leading
// word rather than requiring an exact match.
const CHROME_PATTERN = /^character\b/i;

// The equipped-item panel always reads "<slot name>" ("Head", "Chest", ...)
// directly above an "EQUIPPED" header, directly above the item's own name -
// so instead of enumerating every possible slot name, drop whichever block
// immediately precedes "EQUIPPED" along with "EQUIPPED" itself.
const EQUIPPED_HEADER_PATTERN = /^equipped$/i;

export function extractItemFields(blocks: OcrBlock[]): ItemFieldCandidates {
  const withoutChrome = blocks.filter((b) => !CHROME_PATTERN.test(b.text.trim()));
  const byY = [...withoutChrome].sort((a, b) => a.frame.y - b.frame.y);

  const equippedIndex = byY.findIndex((b) => EQUIPPED_HEADER_PATTERN.test(b.text.trim()));
  const sorted =
    equippedIndex === -1
      ? byY
      : byY.filter((_, i) => i !== equippedIndex && i !== equippedIndex - 1);

  const [name, type, ...rest] = sorted;

  // Every real affix/aspect line shares the tooltip's left text margin. A
  // sliver of background game-world text (a nameplate, etc.) that leaks in
  // at the ROI's edge sits further left than that margin, so use the type
  // line's left edge as the expected column and drop anything that starts
  // noticeably to the left of it.
  const COLUMN_TOLERANCE_PX = 40;
  const columnX = type?.frame.x;
  const aligned =
    columnX === undefined ? rest : rest.filter((b) => b.frame.x >= columnX - COLUMN_TOLERANCE_PX);

  const footerIndex = aligned.findIndex((b) => FOOTER_START_PATTERN.test(b.text));
  const affixBlocks = footerIndex === -1 ? aligned : aligned.slice(0, footerIndex);

  return {
    name,
    type,
    affixes: affixBlocks.map((b) => b.text),
  };
}
