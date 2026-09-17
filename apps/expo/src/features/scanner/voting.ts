import { isSameReading, normalize } from "./text-distance";

export interface FieldVoter {
  vote(candidate: string | undefined): void;
  getLocked(): string | null;
  /** The current front-runner, for showing progress before a value locks. */
  getLeading(): string | null;
}

/**
 * Accumulates per-frame OCR readings of one field and locks a value once it
 * has been seen enough times within a sliding window.
 *
 * Votes are clustered by similarity rather than counted by exact string
 * equality. Exact matching sounds right but fails in practice: live OCR
 * returns "UDAN", "UDAN", "UDAN", "UDA N" for the same text, which under
 * strict equality is three different candidates, so nothing ever reaches the
 * threshold and the field never settles. Clustering near-identical readings
 * is what makes a field actually lock. It matters more the longer the text
 * is -- an item affix line has far more characters for OCR to vary on than a
 * character name does.
 */
export function createFieldVoter(opts: {
  windowSize: number;
  threshold: number;
}): FieldVoter {
  const window: string[] = [];
  let locked: string | null = null;

  /**
   * The reading in the window with the most similar readings, plus that count.
   * The representative is the most frequent exact spelling within the cluster,
   * so a one-off garbled variant never becomes the value we report even if it
   * is the one that happened to tip the count over the threshold.
   */
  function leader(): { value: string; count: number } | null {
    let best: { value: string; count: number } | null = null;

    for (const candidate of window) {
      const cluster = window.filter((other) => isSameReading(candidate, other));

      const spellings = new Map<string, number>();
      for (const member of cluster) {
        spellings.set(member, (spellings.get(member) ?? 0) + 1);
      }
      let representative = candidate;
      let bestSpelling = 0;
      for (const [spelling, n] of spellings) {
        if (n > bestSpelling) {
          bestSpelling = n;
          representative = spelling;
        }
      }

      if (best == null || cluster.length > best.count) {
        best = { value: representative, count: cluster.length };
      }
    }

    return best;
  }

  return {
    vote(candidate: string | undefined) {
      if (locked != null) return;
      if (candidate == null || normalize(candidate).length === 0) return;

      window.push(candidate);
      if (window.length > opts.windowSize) window.shift();

      const front = leader();
      if (front != null && front.count >= opts.threshold) {
        locked = front.value;
      }
    },
    getLocked(): string | null {
      return locked;
    },
    getLeading(): string | null {
      return locked ?? leader()?.value ?? null;
    },
  };
}
