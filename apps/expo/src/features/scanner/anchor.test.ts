import { describe, expect, it } from "vitest";

import { findAnchor } from "./anchor";
import fixtures from "./__fixtures__/frame-blocks.json";

describe("findAnchor", () => {
  it("finds the CHARACTER header block in a clean, close real capture", () => {
    const sample = fixtures.find((f) => f.label === "close-clean")!;
    const anchor = findAnchor(sample.blocks);
    expect(anchor?.text.toUpperCase()).toContain("CHARACTER");
  });

  it("finds the CHARACTER header block in a wide-shot real capture", () => {
    const sample = fixtures.find((f) => f.label === "wide-shot")!;
    const anchor = findAnchor(sample.blocks);
    expect(anchor?.text.toUpperCase()).toContain("CHARACTER");
  });

  it("fuzzy-matches a badly degraded header in the angled-degraded capture", () => {
    // Real captured OCR noise: "CHARACTER" read as "GARACTa" (edit distance 4
    // from "character"). It's still by far the closest candidate in this
    // fixture (the other block, "DAN", is edit distance 8) so it should win.
    const sample = fixtures.find((f) => f.label === "angled-degraded")!;
    const anchor = findAnchor(sample.blocks);
    expect(anchor?.text).toBe("GARACTa");
  });

  it("returns null when no CHARACTER-like text is present", () => {
    const anchor = findAnchor([
      { text: "unrelated", frame: { x: 0, y: 0, width: 10, height: 10 } },
    ]);
    expect(anchor).toBeNull();
  });
});
