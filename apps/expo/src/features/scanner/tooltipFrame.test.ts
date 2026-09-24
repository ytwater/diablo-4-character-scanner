import type { ItemRarity } from "@acme/validators";

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
import { extractItemFields } from "./itemFields";
import { parseRarityFromAnyLine } from "./rarity";
import { blocksInFrame, findTooltipFrame } from "./tooltipFrame";

function block(
  text: string,
  x: number,
  y: number,
  width = 200,
  height = 20,
): OcrBlock {
  return { text, confidence: 1, frame: { x, y, width, height } };
}

describe("findTooltipFrame", () => {
  it("bounds the tooltip between the EQUIPPED header and the Unequip action", () => {
    const blocks = [
      block("EQUIPPED", 450, 100, 100),
      block("Unequip", 330, 900, 80),
    ];

    const frame = findTooltipFrame(blocks, 2000, 2000);

    expect(frame).toBeDefined();
    expect(frame?.top).toBe(120);
    expect(frame?.bottom).toBe(900);
    // Centered on the header; left edge steps past the Unequip button glyph.
    expect(frame?.left).toBe(330 - 20 * 2.5);
    expect(frame?.right).toBe(500 + (500 - (330 - 20 * 2.5)));
  });

  it("tolerates OCR noise in the header and a glyph fused onto Unequip", () => {
    const blocks = [
      block("EQUIPPFD", 450, 100, 100),
      block("P Unequip", 330, 900, 80),
    ];

    const frame = findTooltipFrame(blocks, 2000, 2000);

    expect(frame?.bottom).toBe(900);
  });

  it("does not mistake the 'Unique Equipped' footer line for the header", () => {
    const blocks = [
      block("EQUIPPED", 450, 100, 100),
      block("Unique Equipped", 600, 700),
      block("Unequip", 330, 900, 80),
    ];

    expect(findTooltipFrame(blocks, 2000, 2000)?.top).toBe(120);
  });

  it("extends to the image bottom when Unequip isn't found", () => {
    const frame = findTooltipFrame(
      [block("EQUIPPED", 450, 100, 100)],
      2000,
      1500,
    );

    expect(frame?.bottom).toBe(1500);
    expect(frame?.left).toBeLessThan(450);
    expect(frame?.right).toBeGreaterThan(550);
  });

  it("returns undefined without an EQUIPPED header", () => {
    expect(
      findTooltipFrame([block("Unequip", 330, 900)], 2000, 2000),
    ).toBeUndefined();
  });
});

describe("blocksInFrame", () => {
  it("keeps only blocks fully inside the frame", () => {
    const blocks = [
      block("EQUIPPED", 450, 100, 100),
      block("SILENT CROWN", 300, 150),
      block("Boh | 70 (155)", 0, 150), // nameplate left of the tooltip
      block("Unequip", 330, 900, 80),
      block("Unstoppable characters...", 300, 950), // keyword popup below
    ];
    const frame = findTooltipFrame(blocks, 2000, 2000);
    if (!frame) throw new Error("expected a frame");

    expect(blocksInFrame(blocks, frame).map((b) => b.text)).toEqual([
      "SILENT CROWN",
    ]);
  });
});

// Real ML Kit captures (phone photos of equipped-item tooltips, full frame).
// ML Kit silently drops the item-name font's circled "O" glyph (itemFields
// restores it for the standalone word "OF") and misreads its stylized "M".
// Names where that loses letters mid-word ("BOTS", "IDNIGHT", "HARIMINY",
// "iONSON") are excluded from the name check - fixing those needs matching
// against a known item-name list.
const fixtures: [
  string,
  { blocks: OcrBlock[]; width: number; height: number },
  string | null,
  string,
  ItemRarity,
][] = [
  ["01", tooltip01, null, "Ancestral Unique Helm", "unique"],
  [
    "02",
    tooltip02,
    "THALASSIC CUIRASS OF DEBILITATING TOXINS",
    "Ancestral Legendary Chest Armor",
    "legendary",
  ],
  ["03", tooltip03, "HESHA E KESUNGI", "Unique Gloves", "unique"],
  ["04", tooltip04, "TIBAULT'S WILL", "Unique Pants", "unique"],
  ["05", tooltip05, null, "Legendary Boots", "legendary"],
  [
    "06",
    tooltip06,
    "ROD OF KEPELEKE",
    "Ancestral Mythic Unique Quarterstaff",
    "mythicUnique",
  ],
  ["07", tooltip07, null, "Ancestral Legendary Amulet", "legendary"],
  ["08", tooltip08, null, "Unique Ring", "unique"],
  [
    "09",
    tooltip09,
    "ECHO CIRCLE OF FLEET WINGS",
    "Ancestral Legendary Ring",
    "legendary",
  ],
  ["10", tooltip10, "SPEEDY BOOTS OF VIGOR", "Ancestral Magic Boots", "magic"],
  ["11", tooltip11, "SILENT CROWN", "Rare Helm", "rare"],
  ["12", tooltip12, null, "Unique Ring", "unique"],
];

const letters = (s: string | undefined) =>
  (s ?? "").toUpperCase().replace(/[^A-Z]/g, "");

describe.each(fixtures)(
  "real capture item-tooltip-%s",
  (_id, fixture, name, type, rarity) => {
    const frame = findTooltipFrame(
      fixture.blocks,
      fixture.width,
      fixture.height,
    );
    const fields = extractItemFields(
      frame ? blocksInFrame(fixture.blocks, frame) : [],
    );

    it("finds the tooltip frame", () => {
      expect(frame?.unequip).toBeDefined();
    });

    if (name) {
      it("extracts the name", () => {
        expect(letters(fields.name?.text)).toBe(letters(name));
      });
    }

    it("extracts the full (possibly wrapped) type line", () => {
      expect(letters(fields.type?.text)).toBe(letters(type));
    });

    it("derives the rarity from text", () => {
      expect(
        parseRarityFromAnyLine([
          fields.type?.text,
          fields.name?.text,
          ...fields.affixes,
        ]),
      ).toBe(rarity);
    });

    it("stops affixes before the footer and the Scroll Down overlay", () => {
      for (const affix of fields.affixes) {
        expect(affix).not.toMatch(
          /equires level|scroll down|seroll down|account bound|unequip/i,
        );
      }
    });
  },
);
