import type { OcrBlock } from "./anchor";
import tooltip01 from "./__fixtures__/item-tooltips/item-tooltip-01.json";
import tooltip02 from "./__fixtures__/item-tooltips/item-tooltip-02.json";
import tooltip03 from "./__fixtures__/item-tooltips/item-tooltip-03.json";
import tooltip04 from "./__fixtures__/item-tooltips/item-tooltip-04.json";
import tooltip05 from "./__fixtures__/item-tooltips/item-tooltip-05.json";
import tooltip06 from "./__fixtures__/item-tooltips/item-tooltip-06.json";
import tooltip07 from "./__fixtures__/item-tooltips/item-tooltip-07.json";
import tooltip08 from "./__fixtures__/item-tooltips/item-tooltip-08.json";
import tooltip09 from "./__fixtures__/item-tooltips/item-tooltip-09.json";
import tooltip10 from "./__fixtures__/item-tooltips/item-tooltip-10.json";
import tooltip11 from "./__fixtures__/item-tooltips/item-tooltip-11.json";
import tooltip12 from "./__fixtures__/item-tooltips/item-tooltip-12.json";
import itemNames from "./data/itemNames.json";
import { extractItemFields } from "./itemFields";
import { correctItemName } from "./itemName";
import { blocksInFrame, findTooltipFrame } from "./tooltipFrame";

describe("correctItemName", () => {
  it("snaps a unique's misread name to the known unique name", () => {
    expect(
      correctItemName("HARIMINY OF EBEWAKA", "Ancestral Unique Helm"),
    ).toBe("HARMONY OF EBEWAKA");
    expect(correctItemName("RING OF THE IDNIGHT SUN", "Unique Ring")).toBe(
      "RING OF THE MIDNIGHT SUN",
    );
  });

  it("matches mythic uniques too", () => {
    expect(
      correctItemName(
        "ROD OF KEPELEKF",
        "Ancestral Mythic Unique Quarterstaff",
      ),
    ).toBe("ROD OF KEPELEKE");
  });

  it("leaves a unique alone when nothing is close", () => {
    expect(correctItemName("ZZZ QQQ", "Unique Ring")).toBe("ZZZ QQQ");
  });

  it("corrects individual misread words of a generated name", () => {
    expect(correctItemName("GHOSTWALKER BOTS", "Legendary Boots")).toBe(
      "GHOSTWALKER BOOTS",
    );
  });

  it("rejoins a word ML Kit split in two, keeping a Greater Affix star", () => {
    expect(
      correctItemName(
        "iONSON LINE OF SUPRE MACY *",
        "Ancestral Legendary Amulet",
      ),
    ).toBe("MONSOON LINE OF SUPREMACY *");
  });

  it("never rewrites words that are already valid", () => {
    expect(correctItemName("SILENT CROWN", "Rare Helm")).toBe("SILENT CROWN");
    expect(
      correctItemName("SPEEDY BOOTS OF VIGOR *", "Ancestral Magic Boots"),
    ).toBe("SPEEDY BOOTS OF VIGOR *");
  });

  it("leaves an unknown word alone rather than forcing a distant match", () => {
    expect(
      correctItemName(
        "THALASSIC CUIRASS OF DEBILITATING TOXINS",
        "Ancestral Legendary Chest Armor",
      ),
    ).toBe("THALASSIC CUIRASS OF DEBILITATING TOXINS");
  });
});

describe("item name data", () => {
  it("maps every known unique name to itself", () => {
    for (const name of itemNames.uniques) {
      expect(correctItemName(name.toUpperCase(), "Unique Ring")).toBe(
        name.toUpperCase(),
      );
    }
  });
});

// End to end on real ML Kit captures: frame -> fields -> name correction.
const fixtures: [
  string,
  { blocks: OcrBlock[]; width: number; height: number },
  string,
][] = [
  ["01", tooltip01, "HARMONY OF EBEWAKA"],
  ["02", tooltip02, "THALASSIC CUIRASS OF DEBILITATING TOXINS"],
  ["03", tooltip03, "HESHA E KESUNGI"],
  ["04", tooltip04, "TIBAULT'S WILL"],
  ["05", tooltip05, "GHOSTWALKER BOOTS"],
  ["06", tooltip06, "ROD OF KEPELEKE"],
  ["07", tooltip07, "MONSOON LINE OF SUPREMACY *"],
  ["08", tooltip08, "RING OF THE MIDNIGHT SUN"],
  ["09", tooltip09, "ECHO CIRCLE OF FLEET WINGS"],
  ["10", tooltip10, "SPEEDY BOOTS OF VIGOR *"],
  ["11", tooltip11, "SILENT CROWN"],
  ["12", tooltip12, "RING OF THE MIDNIGHT SUN"],
];

describe.each(fixtures)(
  "real capture item-tooltip-%s",
  (_id, fixture, expected) => {
    it("reads the exact item name", () => {
      const frame = findTooltipFrame(
        fixture.blocks,
        fixture.width,
        fixture.height,
      );
      const fields = extractItemFields(
        frame ? blocksInFrame(fixture.blocks, frame) : [],
      );
      expect(correctItemName(fields.name?.text ?? "", fields.type?.text)).toBe(
        expected,
      );
    });
  },
);
