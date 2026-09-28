import type { OcrBlock } from "./anchor";

export interface FieldCandidates {
  level?: OcrBlock;
  title?: OcrBlock;
  name?: OcrBlock;
}

// The level badge is a bare 1-3 digit number. Anything else with digits
// below the anchor - player nameplates ("DeathBeth | 70 (65)"), stat values
// ("3,809") - is never the level, name, or title.
const LEVEL_PATTERN = /^\d{1,3}$/;

export interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Where the level badge (the small number on a blue diamond) sits, for a
 * second, zoomed-in OCR pass when the first pass misses it: left of the
 * name, straddling the "CHARACTER" header's left edge, between the bottom of
 * the header and the bottom of the name. Sized relative to the anchor-to-name
 * offset rather than any block's height, since ML Kit fuses the header's tab
 * icons into its block and inflates that height unpredictably.
 */
export function findLevelBadgeRegion(
  anchor: OcrBlock,
  name: OcrBlock,
): Region | undefined {
  const span = name.frame.x - anchor.frame.x;
  if (span <= 0) return undefined;
  const top = anchor.frame.y + anchor.frame.height;
  const bottom = name.frame.y + name.frame.height;
  if (bottom <= top) return undefined;
  const left = anchor.frame.x - span * 1.5;
  return { x: left, y: top, width: span * 2, height: bottom - top };
}

// ML Kit sometimes takes the badge's diamond as upside down and reads "93" as
// "26" or "£6" - still a plausible level, so check the line's rotation.
const MAX_UPRIGHT_ANGLE = 45;

/** Picks the level from a second-pass OCR of the badge region, if read upright. */
export function pickBadgeLevel(blocks: OcrBlock[]): OcrBlock | undefined {
  return blocks.find(
    (b) =>
      LEVEL_PATTERN.test(b.text.trim()) &&
      Math.abs(b.angle ?? 0) <= MAX_UPRIGHT_ANGLE,
  );
}

export function extractFields(
  blocks: OcrBlock[],
  anchor: OcrBlock,
): FieldCandidates {
  // The level badge, name and title sit in a column under the "CHARACTER"
  // header - from just left of it (the badge) to a little past its right
  // edge. On a full-frame photo, nameplates and game-world text beside the
  // panel fall outside it.
  const columnLeft = anchor.frame.x - anchor.frame.width * 0.5;
  const columnRight = anchor.frame.x + anchor.frame.width * 1.5;
  const below = blocks
    .filter((b) => {
      const centerX = b.frame.x + b.frame.width / 2;
      return (
        b !== anchor &&
        b.frame.y > anchor.frame.y + anchor.frame.height &&
        centerX >= columnLeft &&
        centerX <= columnRight
      );
    })
    .sort((a, b) => a.frame.y - b.frame.y);

  const [name, title] = below.filter((b) => !/\d/.test(b.text));

  // The badge sits beside the name, so it can't be lower than the title -
  // anything further down is a stat value (e.g. Strength's "190"). If ML
  // Kit missed the badge, leave the level blank rather than guess.
  const levelLimit = title ? title.frame.y + title.frame.height : Infinity;
  const level = pickBadgeLevel(below.filter((b) => b.frame.y < levelLimit));

  return { level, name, title };
}
