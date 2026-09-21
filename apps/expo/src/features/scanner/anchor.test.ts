import fixture from "./__fixtures__/ocr-blocks/character-sheet-01.json";
import { findAnchor } from "./anchor";
import { scannerConfig } from "./config";

describe("findAnchor", () => {
  it("finds the CHARACTER panel header in a real capture", () => {
    const anchor = findAnchor(
      fixture.blocks,
      scannerConfig.anchorText,
      scannerConfig.anchorFuzzyThreshold,
    );

    expect(anchor).toBeDefined();
    expect(anchor?.text.toUpperCase()).toContain("CHARACTER");
  });

  it("returns undefined when no block is close enough", () => {
    const anchor = findAnchor(
      [{ text: "totally unrelated", confidence: 1, frame: { x: 0, y: 0, width: 10, height: 10 } }],
      scannerConfig.anchorText,
      scannerConfig.anchorFuzzyThreshold,
    );

    expect(anchor).toBeUndefined();
  });
});
