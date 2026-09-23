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

export const itemConfig = {
  // Approximate Diablo 4 rarity text colors - placeholder values, needs
  // on-device calibration against real item-tooltip captures.
  rarityColors: {
    common: "#c8c8c8",
    magic: "#5bb0f5",
    rare: "#f5e14a",
    legendary: "#f59b42",
    unique: "#c9a86a",
  },
  // Max Euclidean RGB distance to accept a rarity color match.
  rarityColorThreshold: 40,
} as const;

export type ItemConfig = typeof itemConfig;
