export interface OcrBlock {
  text: string;
  confidence: number;
  frame: { x: number; y: number; width: number; height: number };
}

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

function similarity(a: string, b: string): number {
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
    const score = textUpper.includes(anchorUpper) ? 1 : similarity(textUpper, anchorUpper);
    if (score >= threshold && score > bestScore) {
      best = block;
      bestScore = score;
    }
  }

  return best;
}
