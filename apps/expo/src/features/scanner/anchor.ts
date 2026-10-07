import type { Rgb } from "./rarity";

export interface OcrBlock {
  text: string;
  confidence: number;
  frame: { x: number; y: number; width: number; height: number };
  color?: Rgb;
  // Line rotation in degrees; near +/-180 means ML Kit read it upside down.
  angle?: number;
}

function levenshtein(a: string, b: string): number {
  // Two-row DP: `prev` is row i-1, `curr` is row i.
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr.push(
        Math.min(
          (prev[j] ?? 0) + 1,
          (curr[j - 1] ?? 0) + 1,
          (prev[j - 1] ?? 0) + cost,
        ),
      );
    }
    prev = curr;
  }
  return prev[b.length] ?? 0;
}

export function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

// ML Kit blocks the "CHARACTER" header together with adjacent text on the
// same line (e.g. "CHARACTER G"), so a strict whole-block fuzzy match against
// "CHARACTER" alone scores too low - check substring containment first, and
// only fall back to fuzzy whole-string comparison for OCR noise within the
// header word itself.
export function findAnchor(
  blocks: OcrBlock[],
  anchorText: string,
  threshold: number,
): OcrBlock | undefined {
  const anchorUpper = anchorText.toUpperCase();
  let best: OcrBlock | undefined;
  let bestScore = 0;

  for (const block of blocks) {
    const textUpper = block.text.trim().toUpperCase();
    const score = textUpper.includes(anchorUpper)
      ? 1
      : similarity(textUpper, anchorUpper);
    if (score >= threshold && score > bestScore) {
      best = block;
      bestScore = score;
    }
  }

  return best;
}
