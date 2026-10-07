import {
  classifyRarity,
  parseRarityFromAnyLine,
  parseRarityFromTypeLine,
} from "./rarity";

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

describe("parseRarityFromTypeLine", () => {
  it("parses a unique type line", () => {
    expect(parseRarityFromTypeLine("Unique Ring")).toBe("unique");
  });

  it("parses a magic type line with an Ancestral tier prefix", () => {
    expect(parseRarityFromTypeLine("Ancestral Magic Boots")).toBe("magic");
  });

  it("parses a legendary type line", () => {
    expect(parseRarityFromTypeLine("Ancestral Legendary Ring")).toBe(
      "legendary",
    );
  });

  it("parses mythic unique, not plain unique", () => {
    expect(
      parseRarityFromTypeLine("Ancestral Mythic Unique Quarterstaff"),
    ).toBe("mythicUnique");
  });

  it("parses a rare type line", () => {
    expect(parseRarityFromTypeLine("Rare Helm")).toBe("rare");
  });

  it("returns undefined for unrecognized text", () => {
    expect(parseRarityFromTypeLine("Some garbled OCR text")).toBeUndefined();
  });

  it("tolerates an OCR-misread punctuation mark between the two words", () => {
    expect(parseRarityFromTypeLine("Ancdèstral Mythic'Unique,")).toBe(
      "mythicUnique",
    );
  });
});

describe("parseRarityFromAnyLine", () => {
  it("finds the rarity word wherever it landed among several lines", () => {
    expect(
      parseRarityFromAnyLine([
        "Dlnn |7", // garbled type-line detection
        "Antihero ROD OF KEPELEKE", // garbled name
        "Ancdèstral Mythic'Unique,", // rarity word ended up as an affix line
        "Quarterstaff",
      ]),
    ).toBe("mythicUnique");
  });

  it("skips undefined entries and returns undefined when nothing matches", () => {
    expect(
      parseRarityFromAnyLine([undefined, "garbled", undefined]),
    ).toBeUndefined();
  });
});
