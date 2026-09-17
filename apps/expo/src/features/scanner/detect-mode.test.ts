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

  it("does not treat the word equipped inside prose as a tooltip", () => {
    expect(detectMode([block("CHARACTER"), block("items equipped by you")])).toBe("character");
  });
});
