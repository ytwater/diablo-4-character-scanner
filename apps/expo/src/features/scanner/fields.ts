import type { TextBlock } from "./anchor";

// Real geometric relationship observed directly in
// __fixtures__/frame-blocks.json (captured 2026-09-17, 640x480 frames):
//
//   close-clean:
//     anchor ("CHARACTER")      frame = { x: 98,  y: 107, w: 60, h: 16 } -> bottom y = 123
//     name/title ("UDAN\n...")  frame = { x: 103, y: 150, w: 66, h: 28 }
//     -> y-gap (name.y - anchor bottom)   = 150 - 123 = 27
//     -> x-offset (name.x - anchor.x)     = 103 - 98  = 5
//
//   wide-shot:
//     anchor ("CHARACTER")      frame = { x: 105, y: 47,  w: 64, h: 16 } -> bottom y = 63
//     name/title ("UDAN\n...")  frame = { x: 110, y: 91,  w: 68, h: 29 }
//     -> y-gap (name.y - anchor bottom)   = 91 - 63 = 28
//     -> x-offset (name.x - anchor.x)     = 110 - 105 = 5
//
// Both real captures agree closely: the merged Name/Title block sits ~27-28px
// below the anchor's bottom edge, with its left edge only ~5px right of the
// anchor's left edge (essentially x-aligned, name indented slightly). The
// merged block's height (~28-29px) is roughly the anchor's height doubled,
// consistent with it being two lines of text ("Name\nTitle") in one ML Kit
// block, not two separate blocks.
//
//   angled-degraded (only 2 blocks total -- no merged Name/Title block at
//   all, real degraded-capture noise, not a shape we should force-fit):
//     anchor ("GARACTa")  frame = { x: 132, y: 143, w: 37, h: 9 } -> bottom y = 152
//     "DAN"               frame = { x: 152, y: 168, w: 10, h: 6 }
//     -> y-gap  = 168 - 152 = 16
//     -> x-offset = 152 - 132 = 20
//   This is a looser match than the clean fixtures (different zoom/angle
//   changes the scale), but "DAN" is still the only other block in the
//   frame, and it is below and roughly x-aligned with the anchor.
//
// Tolerances below are set generously enough to cover the range seen across
// all three real fixtures (y-gap 16-28, x-offset 5-20), while still being a
// "below and roughly x-aligned with the anchor" search -- not an exact match
// to any single fixture's numbers.
const NAME_BLOCK_Y_GAP_MIN = 0;
const NAME_BLOCK_Y_GAP_MAX = 60;
const NAME_BLOCK_X_OFFSET_MAX = 40;

export interface ExtractedFields {
  name?: string;
  title?: string;
  level?: string;
}

/**
 * Extracts Name/Title (and best-effort Level) from a frame's text blocks,
 * positioned relative to the already-found anchor ("CHARACTER" header)
 * block. Name and Title frequently arrive merged into a single ML Kit block
 * separated by "\n" -- see the header comment above for the real observed
 * layout this is based on.
 */
export function extractFields(
  blocks: TextBlock[],
  anchor: TextBlock,
): ExtractedFields {
  const anchorBottom = anchor.frame.y + anchor.frame.height;

  let nameBlock: TextBlock | null = null;
  let bestYGap = Infinity;

  for (const block of blocks) {
    if (block === anchor) continue;

    const yGap = block.frame.y - anchorBottom;
    const xOffset = Math.abs(block.frame.x - anchor.frame.x);

    if (
      yGap >= NAME_BLOCK_Y_GAP_MIN &&
      yGap <= NAME_BLOCK_Y_GAP_MAX &&
      xOffset <= NAME_BLOCK_X_OFFSET_MAX &&
      yGap < bestYGap
    ) {
      bestYGap = yGap;
      nameBlock = block;
    }
  }

  const fields: ExtractedFields = {};

  if (nameBlock != null) {
    const lines = nameBlock.text.split("\n");
    fields.name = lines[0];
    if (lines.length > 1 && lines[1] != null && lines[1].trim() !== "") {
      fields.title = lines[1];
    }
  }

  // Level: best-effort only, per the design doc (Phase 0 hit it only 33% of
  // the time even on high-res stills). None of the captured Phase 2 fixtures
  // contain a recognizable "Level"/"Lv" block at all, so there's no real
  // layout data yet to calibrate a position off of. Rather than invent
  // coordinates, look for an explicit textual marker if one ever shows up;
  // this intentionally returns undefined against all current fixtures.
  const levelBlock = blocks.find((block) => /\blv\.?\b|\blevel\b/i.test(block.text));
  if (levelBlock != null) {
    const match = /(\d+)/.exec(levelBlock.text);
    if (match) fields.level = match[1];
  }

  return fields;
}
