import { classifyRarity } from "./rarity";

describe("classifyRarity", () => {
  it("classifies an exact rarity color match", () => {
    expect(classifyRarity({ r: 245, g: 225, b: 74 })).toBe("rare");
  });

  it("classifies a close (noisy) color match within threshold", () => {
    // legendary (#f59b42) nudged by a few units per channel
    expect(classifyRarity({ r: 240, g: 150, b: 70 })).toBe("legendary");
  });

  it("returns undefined when no color is within threshold", () => {
    expect(classifyRarity({ r: 0, g: 0, b: 0 })).toBeUndefined();
  });
});
