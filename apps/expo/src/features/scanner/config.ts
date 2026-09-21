export const scannerConfig = {
  targetFps: 8,
  // Normalized (0-1) region of interest, relative to the cropped/captured
  // frame. Placeholder values - tune against real device framing in Phase 3.
  roi: { x: 0.1, y: 0.15, width: 0.8, height: 0.5 },
  anchorText: "CHARACTER",
  // Similarity threshold (1 - normalizedLevenshteinDistance) to accept a
  // block as the anchor. Tune in Phase 3 against Task 5's fixtures.
  anchorFuzzyThreshold: 0.75,
  vote: {
    windowSize: 8,
    thresholds: {
      level: 3,
      title: 3,
      name: 5,
    },
  },
} as const;

export type ScannerConfig = typeof scannerConfig;
