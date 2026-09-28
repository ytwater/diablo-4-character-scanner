import type { OcrBlock } from "./anchor";

export interface ItemFieldCandidates {
  name?: OcrBlock;
  type?: OcrBlock;
  affixes: string[];
  // Same blocks `affixes` is derived from, kept as full OcrBlocks (with
  // frame/color) so classifyLines can run against filtered, footer-free
  // data instead of the raw ROI capture.
  affixBlocks: OcrBlock[];
}

// Every Diablo 4 item tooltip has a "Requires Level" line directly below the
// affix list and above the Sell Value / Durability / Tempers / action-button
// footer, so it makes a reliable stop marker for where affixes end. The
// leading "R" is left out since ML Kit misreads it ("Dequires", "Pequires").
//
// A long tooltip instead gets cut off by a "Scroll Down" overlay, which ML
// Kit fuses with whatever half-hidden text it covers ("Only Ebewake Seroll
// Down") - nothing at or below it is readable, so it ends affixes too.
const FOOTER_START_PATTERN = /equires\s*level|s.?roll\s*d.?wn/i;

// The item-name font draws "O" as a circled glyph that ML Kit silently drops,
// turning "RING OF THE" into "RING F THE". A lone "F" is never a real word in
// an item name, so it's safe to restore.
function restoreDroppedO(text: string): string {
  return text.replace(/(^|\s)F(?=\s|$)/g, "$1OF");
}

// The type line can wrap ("Ancestral Legendary Chest" / "Armor"). A
// continuation sits tight under the previous line and, unlike the "850 Item
// Power" line that always follows the type, contains no digits.
function continuesTypeLine(prev: OcrBlock, next: OcrBlock): boolean {
  const gap = next.frame.y - (prev.frame.y + prev.frame.height);
  return !/\d/.test(next.text) && !isAllCaps(next.text) && gap < prev.frame.height;
}

// Tab labels from the always-visible character-screen tab bar ("CHARACTER",
// "Stats & Materials") can end up inside the ROI depending on framing and
// aren't part of the item itself. ML Kit sometimes fuses an adjacent tab
// icon into the same block (e.g. "CHARACTER O"), and the ROI's top edge can
// clip the leading letter of a word (e.g. "Materials" -> "aterials"), so
// match on a trailing substring rather than requiring an exact/full word.
const CHROME_PATTERN = /^character\b|^stats(\s*&.*)?$|materials?$|aterials$/i;

// The character level/paragon badge ("70(155)", "93 (87)") is a fixed,
// generic UI format that never legitimately starts an item tooltip line, so
// it's safe to drop regardless of framing - unlike the character's own
// name/title (which vary per character and can't be pattern-matched
// generically; those still require tighter framing to avoid capturing).
const LEVEL_BADGE_PATTERN = /^\d+\s*\(\d+\)/;

// The equipped-item panel always reads "<slot name>" ("Head", "Chest", ...)
// directly above an "EQUIPPED" header, directly above the item's own name -
// so instead of enumerating every possible slot name, drop whichever block
// immediately precedes "EQUIPPED" along with "EQUIPPED" itself.
const EQUIPPED_HEADER_PATTERN = /^equipped$/i;

// The item's name and type line render in a shouty all-caps style; the type
// line and everything below it (affixes) render in normal mixed case. A
// name that wraps onto a second line ("Speedy Boots of" / "Vigor") is still
// all-caps, so walking the all-caps run from the top reliably finds where
// the (possibly multi-line) name ends, instead of assuming it's always
// exactly one block.
function isAllCaps(text: string): boolean {
  const letters = text.replace(/[^a-zA-Z]/g, "");
  return letters.length > 0 && letters === letters.toUpperCase();
}

export function extractItemFields(blocks: OcrBlock[]): ItemFieldCandidates {
  const withoutChrome = blocks.filter((b) => {
    const text = b.text.trim();
    return !CHROME_PATTERN.test(text) && !LEVEL_BADGE_PATTERN.test(text);
  });
  const byY = [...withoutChrome].sort((a, b) => a.frame.y - b.frame.y);

  const equippedIndex = byY.findIndex((b) => EQUIPPED_HEADER_PATTERN.test(b.text.trim()));
  const withoutEquipped =
    equippedIndex === -1
      ? byY
      : byY.filter((_, i) => i !== equippedIndex && i !== equippedIndex - 1);

  // Every real tooltip line (name, type, affixes) shares the same left text
  // margin. Leaked background/side-panel text - the character portrait's
  // name/title, stat labels like "Weapon Damage" - sits at a distinctly
  // smaller x, wherever it happens to fall in y-order, so filter it out
  // using the name's own left edge as the reference column before doing
  // anything else with block order. Must run before name/type detection
  // (not just on the affix list afterward), since a leaked block can sort
  // between the name and the real type line and get mistaken for the type.
  const COLUMN_TOLERANCE_PX = 40;
  const columnX = withoutEquipped[0]?.frame.x;
  const sorted =
    columnX === undefined
      ? withoutEquipped
      : withoutEquipped.filter((b) => b.frame.x >= columnX - COLUMN_TOLERANCE_PX);

  // The first block is always (at least the start of) the name, regardless
  // of its own casing - only look at casing to decide whether to keep
  // extending the name into subsequent blocks.
  let nameEnd = 1;
  while (nameEnd < sorted.length && isAllCaps(sorted[nameEnd]?.text ?? "")) {
    nameEnd++;
  }
  const nameBlocks = sorted.slice(0, nameEnd);

  let typeEnd = nameEnd + 1;
  for (;;) {
    const prev = sorted[typeEnd - 1];
    const next = sorted[typeEnd];
    if (!prev || !next || !continuesTypeLine(prev, next)) break;
    typeEnd++;
  }
  const typeBlocks = sorted.slice(nameEnd, typeEnd);
  // Type lines are plain English ("Ancestral Mythic Unique Quarterstaff"),
  // so any diacritic is OCR noise ("Ancèstral") - strip it.
  const type: OcrBlock | undefined = typeBlocks[0]
    ? {
        ...typeBlocks[0],
        text: typeBlocks
          .map((b) => b.text)
          .join(" ")
          .normalize("NFD")
          .replace(/[̀-ͯ]/g, ""),
      }
    : undefined;
  const affixBlocks = sorted.slice(typeEnd);

  // Keep any trailing "*" as-is - it's the in-game Greater Affix star count
  // (one "*" per starred attribute), not OCR noise.
  const name: OcrBlock | undefined = nameBlocks[0]
    ? { ...nameBlocks[0], text: restoreDroppedO(nameBlocks.map((b) => b.text).join(" ")) }
    : undefined;

  const footerIndex = affixBlocks.findIndex((b) => FOOTER_START_PATTERN.test(b.text));
  const affixBlocksTrimmed =
    footerIndex === -1 ? affixBlocks : affixBlocks.slice(0, footerIndex);

  return {
    name,
    type,
    affixes: affixBlocksTrimmed.map((b) => b.text),
    affixBlocks: affixBlocksTrimmed,
  };
}
