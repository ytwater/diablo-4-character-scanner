import { extractItemFields } from "./itemFields";
import type { OcrBlock } from "./anchor";

function block(text: string, y: number): OcrBlock {
  return { text, confidence: 1, frame: { x: 0, y, width: 100, height: 20 } };
}

describe("extractItemFields", () => {
  it("takes the topmost block as name, next as type, rest as affixes", () => {
    const blocks = [
      block("Silent Crown", 10),
      block("Head", 40),
      block("+120 Strength", 70),
      block("12% Damage Reduction", 100),
    ];

    const result = extractItemFields(blocks);

    expect(result.name?.text).toBe("Silent Crown");
    expect(result.type?.text).toBe("Head");
    expect(result.affixes).toEqual(["+120 Strength", "12% Damage Reduction"]);
  });

  it("sorts out-of-order blocks by y-position first", () => {
    const blocks = [block("+120 Strength", 70), block("Silent Crown", 10), block("Head", 40)];

    const result = extractItemFields(blocks);

    expect(result.name?.text).toBe("Silent Crown");
    expect(result.type?.text).toBe("Head");
    expect(result.affixes).toEqual(["+120 Strength"]);
  });

  it("returns empty/undefined fields for an empty block list", () => {
    const result = extractItemFields([]);

    expect(result.name).toBeUndefined();
    expect(result.type).toBeUndefined();
    expect(result.affixes).toEqual([]);
  });

  it("handles a single block (name only, no type/affixes)", () => {
    const result = extractItemFields([block("Silent Crown", 10)]);

    expect(result.name?.text).toBe("Silent Crown");
    expect(result.type).toBeUndefined();
    expect(result.affixes).toEqual([]);
  });
});
