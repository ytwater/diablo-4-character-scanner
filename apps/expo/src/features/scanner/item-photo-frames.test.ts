import { describe, expect, it } from "vitest";

import type { TextBlock } from "./anchor";
import { detectMode } from "./detect-mode";
import frames from "./__fixtures__/item-photo-frames.json";

/**
 * Real ML Kit output captured on a Pixel 10 Pro from photos of item tooltips
 * (ItemFixtureCaptureTest). Distinct from item-frames.json, which came from
 * live camera frames and happens to contain a clean "EQUIPPED" in all six
 * samples — so those can't exercise OCR-noise tolerance.
 *
 * item-03 and item-04 are the ambiguous case: the tooltip overlays the
 * character sheet, so the frame contains both "CHARACTER" and item markers.
 */
describe("item tooltip photos, real device OCR", () => {
  const asBlocks = (text: string): TextBlock[] =>
    text.split("\n").map((t) => ({ text: t, x: 0, y: 0, width: 1, height: 1 }));

  for (const frame of frames) {
    it(`detects ${frame.label} as an item`, () => {
      expect(detectMode(asBlocks(frame.text))).toBe("item");
    });
  }
});
