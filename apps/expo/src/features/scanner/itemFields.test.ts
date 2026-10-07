import type { OcrBlock } from "./anchor";
import { extractItemFields } from "./itemFields";

function block(text: string, y: number, x = 0): OcrBlock {
  return { text, confidence: 1, frame: { x, y, width: 100, height: 20 } };
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
    const blocks = [
      block("+120 Strength", 70),
      block("Silent Crown", 10),
      block("Head", 40),
    ];

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

  it("merges a wrapped, all-caps name across multiple blocks, keeping a trailing Greater Affix star", () => {
    const blocks = [
      block("SPEEDY BOOTS OF", 10),
      block("VIGOR *", 40),
      block("Ancestral Magic Boots", 70),
      block("900 Item Power", 100),
      block("801 Armor", 130),
    ];

    const result = extractItemFields(blocks);

    expect(result.name?.text).toBe("SPEEDY BOOTS OF VIGOR *");
    expect(result.type?.text).toBe("Ancestral Magic Boots");
    expect(result.affixes).toEqual(["900 Item Power", "801 Armor"]);
  });

  it("drops a leaked 'Stats & Materials' tab fragment, even clipped to 'aterials'", () => {
    const blocks = [
      block("ECHO OF", 5),
      block("FLEET WINGS", 15),
      block("aterials", 10), // clipped tab-bar leftover, sorts between the name lines
      block("Ancestral Legendary Ring", 40),
      block("900 Item Power", 70),
    ];

    const result = extractItemFields(blocks);

    expect(result.name?.text).toBe("ECHO OF FLEET WINGS");
    expect(result.type?.text).toBe("Ancestral Legendary Ring");
    expect(result.affixes).toEqual(["900 Item Power"]);
  });

  it("drops leaked character-panel text (name/title/stats) wherever it sorts, not just in the affix list", () => {
    const TOOLTIP_X = 400;
    const PANEL_X = 50; // far-left character portrait/stats column
    const blocks = [
      block("RING OF THE", 5, TOOLTIP_X),
      block("MIDNIGHT SUN", 15, TOOLTIP_X),
      block("DAN", 18, PANEL_X), // leaked character name fragment
      block("Unique Ring", 40, TOOLTIP_X),
      block("ic Defende", 45, PANEL_X), // leaked character title fragment
      block("850 Item Power", 70, TOOLTIP_X),
      block("apon Dama", 100, PANEL_X), // leaked "Weapon Damage" stat
      block("+996 Armor (780 - 980]", 130, TOOLTIP_X),
    ];

    const result = extractItemFields(blocks);

    expect(result.name?.text).toBe("RING OF THE MIDNIGHT SUN");
    expect(result.type?.text).toBe("Unique Ring");
    expect(result.affixes).toEqual([
      "850 Item Power",
      "+996 Armor (780 - 980]",
    ]);
  });

  it("restores the standalone 'OF' whose circled-O glyph ML Kit drops", () => {
    const blocks = [
      block("RING F THE", 10),
      block("MIDNIGHT SUN", 40),
      block("Unique Ring", 70),
      block("850 Item Power", 100),
    ];

    expect(extractItemFields(blocks).name?.text).toBe(
      "RING OF THE MIDNIGHT SUN",
    );
  });

  it("merges a type line that wraps onto a second line", () => {
    const blocks = [
      block("THALASSIC CUIRASS", 10),
      block("Ancestral Legendary Chest", 40),
      block("Armor", 65),
      block("900 Item Power", 90),
      block("3,506 Armor", 120),
    ];

    const result = extractItemFields(blocks);

    expect(result.type?.text).toBe("Ancestral Legendary Chest Armor");
    expect(result.affixes).toEqual(["900 Item Power", "3,506 Armor"]);
  });

  it("does not merge a digit-free affix into the type when there's a gap", () => {
    const blocks = [
      block("SILENT CROWN", 10),
      block("Rare Helm", 40),
      block("Unstoppable", 120),
    ];

    const result = extractItemFields(blocks);

    expect(result.type?.text).toBe("Rare Helm");
    expect(result.affixes).toEqual(["Unstoppable"]);
  });

  it("ends affixes at a misread 'Requires Level' footer", () => {
    const blocks = [
      block("SILENT CROWN", 10),
      block("Rare Helm", 40),
      block("+86 Dexterity", 70),
      block("Dequires Level 70", 100),
      block("Account Bound", 130),
    ];

    expect(extractItemFields(blocks).affixes).toEqual(["+86 Dexterity"]);
  });

  it("ends affixes at the 'Scroll Down' overlay, dropping the half-hidden text under it", () => {
    const blocks = [
      block("HARMONY OF EBEWAKA", 10),
      block("Ancestral Unique Helm", 40),
      block("+150 Dexterity", 70),
      block("Only Ebewake Seroll Down", 100),
      block("Guardians. In ae, utey wekeiwar for his", 130),
    ];

    expect(extractItemFields(blocks).affixes).toEqual(["+150 Dexterity"]);
  });

  it("drops a leaked level/paragon badge above the real name", () => {
    const blocks = [
      block("70(155)", 0), // leaked level/paragon badge
      block("AHAVARION,", 20),
      block("ROD OF KEPELEKE", 35),
      block("Ancestral Mythic Unique Quarterstaff", 60),
      block("900 Item Power", 90),
    ];

    const result = extractItemFields(blocks);

    expect(result.name?.text).toBe("AHAVARION, ROD OF KEPELEKE");
    expect(result.type?.text).toBe("Ancestral Mythic Unique Quarterstaff");
    expect(result.affixes).toEqual(["900 Item Power"]);
  });
});
