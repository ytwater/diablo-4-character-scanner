import type { OcrBlock } from "./anchor";
import { classifyLines } from "./classifyLines";
import { itemConfig } from "./config";

// Synthetic OcrBlock fixtures, hand-built inline. There is no real
// item-tooltip OCR-block capture data in this repo yet (temp-items/ raw
// screenshots referenced by the plan aren't available in this environment),
// so these blocks are constructed to exercise each classification rule
// directly rather than mirroring an actual on-device capture. Real-data
// calibration is deferred to Task 11.
function block(
  text: string,
  y: number,
  opts: { height?: number; color?: OcrBlock["color"] } = {},
): OcrBlock {
  return {
    text,
    confidence: 1,
    frame: { x: 0, y, width: 300, height: opts.height ?? 20 },
    color: opts.color,
  };
}

const ASPECT_RGB = { r: 0xe0, g: 0x8a, b: 0x3e }; // itemConfig.aspectColor, exact

describe("classifyLines", () => {
  it("classifies an item power line", () => {
    const lines = classifyLines([block("Item Power: 800", 0)]);
    expect(lines).toEqual([{ kind: "itemPower", text: "Item Power: 800" }]);
  });

  it("classifies an armor line", () => {
    const lines = classifyLines([block("1,234 Armor", 0)]);
    expect(lines.find((l) => l.text === "1,234 Armor")?.kind).toBe("armor");
  });

  it("classifies a DPS line (numeric range)", () => {
    const lines = classifyLines([block("120.5 - 180.2 Damage Per Second", 0)]);
    expect(lines[0]?.kind).toBe("dps");
  });

  it("classifies an empty socket line", () => {
    const lines = classifyLines([block("Empty Socket", 0)]);
    expect(lines[0]?.kind).toBe("socket");
  });

  it("classifies a plain affix line (leading + or %)", () => {
    const lines = classifyLines([block("+20% Damage", 0)]);
    expect(lines[0]?.kind).toBe("affix");
  });

  it("classifies a starred line as a Greater Affix, keeping the star in the text", () => {
    const lines = classifyLines([block("* +30% Movement Speed", 0)]);
    expect(lines[0]).toEqual({
      kind: "greater",
      text: "* +30% Movement Speed",
    });
  });

  it("falls back to 'other' for unrecognized text with no gap above it", () => {
    const lines = classifyLines([block("Some random unclassified string", 0)]);
    expect(lines[0]?.kind).toBe("other");
  });

  it("classifies aspect-colored text as aspect and merges consecutive aspect blocks", () => {
    // Two consecutive aspect-colored blocks (the aspect paragraph wraps
    // across multiple OCR blocks) should merge into a single "aspect" line
    // with concatenated text - the one genuinely tricky rule here.
    const blocks = [
      block("Aspect of Disobedience", 0, { color: ASPECT_RGB }),
      block("Your Golem gains 20% increased life.", 25, { color: ASPECT_RGB }),
      block("+15% Damage", 55), // unrelated affix directly after - must not merge
    ];
    const lines = classifyLines(blocks);
    const aspectLines = lines.filter((l) => l.kind === "aspect");
    expect(aspectLines).toHaveLength(1);
    expect(aspectLines[0]?.text).toBe(
      "Aspect of Disobedience Your Golem gains 20% increased life.",
    );
    expect(
      lines.some((l) => l.kind === "affix" && l.text === "+15% Damage"),
    ).toBe(true);
  });

  it("does not merge two aspect-colored blocks separated by a non-aspect block", () => {
    const blocks = [
      block("Aspect of Disobedience", 0, { color: ASPECT_RGB }),
      block("+15% Damage", 25),
      block("Aspect continuation text", 50, { color: ASPECT_RGB }),
    ];
    const lines = classifyLines(blocks);
    const aspectLines = lines.filter((l) => l.kind === "aspect");
    expect(aspectLines).toHaveLength(2);
  });

  it("classifies implicit lines above the largest vertical gap, affixes below it", () => {
    // Two implicit-region blocks tightly packed, then a big gap (the
    // divider ML Kit doesn't report as its own block), then two affix-region
    // blocks tightly packed. Gap must exceed itemConfig.implicitDividerGapPx.
    const bigGap = itemConfig.implicitDividerGapPx + 10;
    const blocks = [
      block("Maximum Life increased", 0, { height: 20 }), // implicit-region, unrecognized text
      block("Some other implicit text", 25, { height: 20 }), // implicit-region
      block("+30% Critical Strike Damage", 25 + 20 + bigGap, { height: 20 }), // starts with '+' -> affix anyway
      block("Random unclassified affix-region text", 25 + 20 + bigGap + 25, {
        height: 20,
      }), // affix-region, unrecognized text -> stays "other", not "implicit"
    ];
    const lines = classifyLines(blocks);

    expect(lines[0]?.kind).toBe("implicit");
    expect(lines[1]?.kind).toBe("implicit");
    expect(lines[2]?.kind).toBe("affix");
    expect(lines[3]?.kind).toBe("other");
  });

  it("classifies every line kind end-to-end from a realistic mixed block list", () => {
    const blocks = [
      block("Item Power: 725", 0),
      block("Unique Two-Handed Sword", 30, { height: 20 }),
      block("1,234 Armor", 60),
      block("120.5 - 180.2 Damage Per Second", 90),
      block("Empty Socket", 120),
      block("Aspect of the Umbral", 150, { color: ASPECT_RGB }),
      block("Damage is increased by 20%.", 175, { color: ASPECT_RGB }),
      block("+20% Damage", 300),
    ];
    const lines = classifyLines(blocks);

    expect(lines.find((l) => l.kind === "itemPower")).toBeTruthy();
    expect(lines.find((l) => l.kind === "armor")).toBeTruthy();
    expect(lines.find((l) => l.kind === "dps")).toBeTruthy();
    expect(lines.find((l) => l.kind === "socket")).toBeTruthy();
    expect(lines.find((l) => l.kind === "affix")).toBeTruthy();
    const aspectLines = lines.filter((l) => l.kind === "aspect");
    expect(aspectLines).toHaveLength(1);
    expect(aspectLines[0]?.text).toBe(
      "Aspect of the Umbral Damage is increased by 20%.",
    );
  });
});
