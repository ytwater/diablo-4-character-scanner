export interface TextBlock {
  text: string;
  frame: { x: number; y: number; width: number; height: number };
}

const ANCHOR_TEXT = "character";

// Calibrated against the real fixtures in __fixtures__/frame-blocks.json:
// the degraded "GARACTa" reading of the header (angled-degraded fixture) is
// edit distance 4 from "character", while every other block's first word in
// every fixture is edit distance >= 7. A threshold of 4 catches the degraded
// header without risking false positives on the rest of the sheet's text.
const MAX_EDIT_DISTANCE = 4;

function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = 0; i <= a.length; i++) dp[i]![0] = i;
  for (let j = 0; j <= b.length; j++) dp[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + cost,
      );
    }
  }
  return dp[a.length]![b.length]!;
}

/**
 * Finds the "CHARACTER" header block among a frame's recognized text blocks,
 * tolerating OCR noise via fuzzy (edit-distance) matching on the block's
 * first word. Returns null if nothing resembles it closely enough.
 */
export function findAnchor(blocks: TextBlock[]): TextBlock | null {
  let best: TextBlock | null = null;
  let bestDistance = Infinity;

  for (const block of blocks) {
    // The header sometimes reads with trailing OCR noise (e.g. "CHARACTER G"
    // or "CHARACTER O M" -- observed in Phase 0's raw output). Compare only
    // the leading token against "character".
    const firstWord = block.text.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
    const distance = levenshtein(firstWord, ANCHOR_TEXT);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = block;
    }
  }

  return bestDistance <= MAX_EDIT_DISTANCE ? best : null;
}
