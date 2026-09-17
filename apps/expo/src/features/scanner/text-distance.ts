/**
 * Shared string-similarity helpers for OCR output.
 *
 * Both the anchor search and the per-field voting need to treat "nearly the
 * same string" as the same thing, because live OCR rarely returns byte-identical
 * text twice in a row.
 */

export function levenshtein(a: string, b: string): number {
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
 * Canonical form for comparing two OCR reads of the same text.
 *
 * Case and spacing vary between frames without changing meaning, so they'd
 * otherwise split a vote across candidates that are really the same read.
 */
export function normalize(text: string): string {
  return text.trim().replace(/\s+/g, " ").toUpperCase();
}

/**
 * Whether two OCR reads are close enough to be treated as the same value.
 *
 * Tolerance scales with length: a one-character slip in "UDAN" is a much
 * bigger deal than one in a 40-character item affix line, so a flat edit
 * distance would be either too strict for long strings or too loose for short
 * ones.
 */
export function isSameReading(a: string, b: string, tolerance = 0.2): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return true;

  const longest = Math.max(na.length, nb.length);
  if (longest === 0) return true;

  // Very short strings get no fuzz at all -- at 4 characters, a single edit
  // is a quarter of the string and genuinely might be a different name.
  if (longest <= 4) return false;

  const allowed = Math.max(1, Math.floor(longest * tolerance));
  return levenshtein(na, nb) <= allowed;
}
