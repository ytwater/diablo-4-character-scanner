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
  // Normalized (0-1) region of interest for item-tooltip captures, relative
  // to the captured photo. Placeholder values - tune against real device
  // framing the same way scannerConfig.roi was tuned.
  roi: { x: 0.3, y: 0.15, width: 0.45, height: 0.55 },
  // Approximate Diablo 4 rarity text colors - placeholder values, needs
  // on-device calibration against real item-tooltip captures.
  rarityColors: {
    common: "#c8c8c8",
    // Calibrated from an on-device magic-item capture (Task 11); see
    // useScan.native.ts's "[rarity-calibration]" debug log.
    magic: "#838ae8",
    rare: "#f5e14a",
    legendary: "#f59b42",
    // Calibrated from an on-device unique-item capture (Task 11); see
    // useScan.native.ts's "[rarity-calibration]" debug log.
    unique: "#d8b09b",
    // Calibrated from an on-device mythic-unique capture (Task 11); see
    // useScan.native.ts's "[rarity-calibration]" debug log.
    mythicUnique: "#d193b6",
  },
  // Max Euclidean RGB distance to accept a rarity color match.
  rarityColorThreshold: 40,
  // Approximate Diablo 4 aspect-text color (the italic legendary-aspect
  // paragraph in an item tooltip) - placeholder, needs on-device calibration
  // (Task 11) against real item-tooltip captures.
  aspectColor: "#e08a3e",
  // Max Euclidean RGB distance to accept an aspect color match.
  aspectColorThreshold: 40,
  // Minimum vertical gap (px) between two vertically-adjacent OCR blocks to
  // treat it as the implicit/affix divider line ML Kit doesn't report as its
  // own element - placeholder, tune on-device (Task 11).
  implicitDividerGapPx: 24,
} as const;

export type ItemConfig = typeof itemConfig;
