import { describe, expect, it } from "vitest";

import type { TextBlock } from "./anchor";
import { detectMode } from "./detect-mode";

const block = (text: string): TextBlock => ({
  text,
  frame: { x: 0, y: 0, width: 10, height: 10 },
});

describe("detectMode", () => {
  it("prefers item mode when a tooltip overlays the character sheet", () => {
    // This is the real situation: captured frames contain both.
    expect(
      detectMode([block("CHARACTER G"), block("Head"), block("EQUIPPED"), block("SILENT CROWN")]),
    ).toBe("item");
  });

  it("detects character mode when only the sheet is visible", () => {
    expect(detectMode([block("CHARACTER"), block("UDAN\nDemonic Defender")])).toBe("character");
  });

  it("returns none when neither panel is in frame", () => {
    expect(detectMode([block("ESC"), block("TAB"), block("CAPS")])).toBe("none");
  });

  // Deliberately dropped an earlier assertion that prose containing the word
  // "equipped" should stay in character mode. Being that strict is what broke
  // on device: requiring an exact "EQUIPPED" line meant any OCR noise around
  // the word sent a real tooltip to character mode. D4's character sheet
  // doesn't render that word, so the tradeoff is worth it.
  it("still detects an item when the EQUIPPED header is OCR-mangled", () => {
    expect(
      detectMode([
        block("CHARACTER G"),
        block("Hand"),
        block("EQUIPPEDD ."),
        block("850 Item Power"),
      ]),
    ).toBe("item");
  });

  it("detects an item from Item Power alone", () => {
    expect(detectMode([block("CHARACTER"), block("850 Iten Power")])).toBe("item");
  });

  it("detects an item from a rarity line alone", () => {
    expect(detectMode([block("CHARACTER"), block("Unique Ring")])).toBe("item");
  });
});
