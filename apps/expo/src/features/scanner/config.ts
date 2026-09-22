export const scannerConfig = {
  // Normalized (0-1) region of interest, relative to the captured photo.
  // Placeholder values - tune against real device framing once the
  // capture-based pipeline is on-device tested.
  roi: { x: 0.1, y: 0.15, width: 0.8, height: 0.5 },
  anchorText: "CHARACTER",
  // Similarity threshold (1 - normalizedLevenshteinDistance) to accept a
  // block as the anchor. Tune in Phase 3 against Task 5's fixtures.
  anchorFuzzyThreshold: 0.75,
} as const;

export type ScannerConfig = typeof scannerConfig;
