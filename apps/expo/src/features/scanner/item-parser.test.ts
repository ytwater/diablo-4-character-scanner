import { describe, expect, it } from "vitest";

import fixtures from "./__fixtures__/item-frames.json";
import { parseItem } from "./item-parser";
import { isSameReading } from "./text-distance";

interface ItemFrameFixture {
  label: string;
  text: string;
}

const frames = fixtures as ItemFrameFixture[];

describe("parseItem against real captured OCR frames", () => {
  // Ground truth read off the source photo of this item.
  const GROUND_TRUTH = {
    name: "SILENT CROWN",
    rarity: "Rare",
    slot: "Helm",
    itemPower: 850,
    primary: { value: 1275, label: "Armor" },
    requiresLevel: 70,
    sellValue: 18257,
    affixes: [
      { stat: "Dexterity", value: 86, range: { min: 83, max: 99 } },
      { stat: "Maximum Life", value: 1204, range: { min: 1016, max: 1225 } },
      { stat: "Life Regeneration", value: 140, range: { min: 128, max: 153 } },
      { stat: "Lucky Hit Chance", value: 6.2, isPercent: true },
    ],
  };

  it("has fixtures to test against", () => {
    expect(frames.length).toBeGreaterThan(0);
  });

  for (const frame of frames) {
    describe(frame.label, () => {
      const parsed = parseItem(frame.text);

      // Asserted fuzzily on purpose. One captured frame genuinely reads
      // "SILENT CRWN" -- OCR dropped a character, which no parser can recover
      // from a single frame. Production resolves this the same way this
      // assertion does: by similarity across frames, where the correct
      // spelling outvotes the dropped-letter variant.
      it("reads the item name (within OCR tolerance)", () => {
        expect(parsed.name).toBeDefined();
        expect(isSameReading(parsed.name!, GROUND_TRUTH.name)).toBe(true);
      });

      it("reads rarity and slot", () => {
        expect(parsed.rarity).toBe(GROUND_TRUTH.rarity);
        expect(parsed.slot).toBe(GROUND_TRUTH.slot);
      });

      it("reads item power", () => {
        expect(parsed.itemPower).toBe(GROUND_TRUTH.itemPower);
      });

      it("reads the primary defensive stat", () => {
        expect(parsed.primary).toEqual(GROUND_TRUTH.primary);
      });

      it("reads requires level and sell value", () => {
        expect(parsed.requiresLevel).toBe(GROUND_TRUTH.requiresLevel);
        expect(parsed.sellValue).toBe(GROUND_TRUTH.sellValue);
      });

      // The point of the parser: bracket/sign OCR damage must not lose values.
      it("recovers every affix value despite delimiter damage", () => {
        for (const expected of GROUND_TRUTH.affixes) {
          const found = parsed.affixes.find((a) => a.stat === expected.stat);
          expect(found, `missing affix: ${expected.stat}`).toBeDefined();
          expect(found!.value).toBe(expected.value);
        }
      });

      it("recovers affix ranges written with mismatched brackets", () => {
        // "(128 - 153]" appears in the real captures -- an open paren where a
        // bracket belongs. The range must still parse.
        const regen = parsed.affixes.find((a) => a.stat === "Life Regeneration");
        expect(regen?.range).toEqual({ min: 128, max: 153 });
      });
    });
  }
});

describe("parseItem unit behaviour", () => {
  it("parses a wrapped multi-line item name", () => {
    const parsed = parseItem(
      ["EQUIPPED", "RING OF THE", "MIDNIGHT SUN", "Unique Ring", "850 Item Power"].join("\n"),
    );
    expect(parsed.name).toBe("RING OF THE MIDNIGHT SUN");
    expect(parsed.rarity).toBe("Unique");
    expect(parsed.slot).toBe("Ring");
  });

  it("detects the Scroll Down indicator", () => {
    expect(parseItem("EQUIPPED\nFoo\nRare Helm\nScroll Down").needsScroll).toBe(true);
    expect(parseItem("EQUIPPED\nFoo\nRare Helm").needsScroll).toBe(false);
  });

  it("repairs a '+' misread as 't'", () => {
    const parsed = parseItem("• t6.2% Lucky Hit Chance [6.0 - 8.0]%");
    expect(parsed.affixes[0]).toMatchObject({
      value: 6.2,
      isPercent: true,
      stat: "Lucky Hit Chance",
    });
  });

  it("does not treat prose lines as affixes", () => {
    const parsed = parseItem(
      [
        "Cast 2 Mobility or Macabre Skills. (2 times)",
        "Invoke the Spiritborn's Concussive Stomp Skill.",
        "(Overflow: Increase damage by 1% per Offering)",
      ].join("\n"),
    );
    expect(parsed.affixes).toHaveLength(0);
  });

  it("does not mistake 'Lord of Hatred Item' for a Rare rarity", () => {
    const parsed = parseItem("EQUIPPED\nSILENT CROWN\nRare Helm\nLord of Hatred Item");
    expect(parsed.rarity).toBe("Rare");
    expect(parsed.slot).toBe("Helm");
  });

  it("rejects numbers from outside the tooltip as affixes", () => {
    // These all appear in real captures: the character sheet's gold counter
    // and other players' level tags sit behind the item overlay.
    const parsed = parseItem(
      ["686,691,098 283", "Kaydos | 70 (29)", "70(29)", "1,275"].join("\n"),
    );
    expect(parsed.affixes).toHaveLength(0);
  });

  it("parses All Resist as the primary stat", () => {
    const parsed = parseItem("EQUIPPED\nRING\nUnique Ring\n138 All Resist");
    expect(parsed.primary).toEqual({ value: 138, label: "All Resist" });
  });
});
