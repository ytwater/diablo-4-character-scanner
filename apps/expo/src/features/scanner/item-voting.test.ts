import { describe, expect, it } from "vitest";

import fixtures from "./__fixtures__/item-frames.json";
import { parseItem } from "./item-parser";
import { createItemVoter } from "./item-voting";

const frames = (fixtures as { label: string; text: string }[]).map((f) => f.text);

describe("createItemVoter across the real captured frames", () => {
  function voteAllFrames() {
    const voter = createItemVoter();
    for (const text of frames) voter.observe(parseItem(text));
    return voter.getResult();
  }

  it("settles on the correct item identity", () => {
    const result = voteAllFrames();
    // One frame reads "SILENT CRWN"; the majority spelling must win.
    expect(result.name).toBe("SILENT CROWN");
    expect(result.rarity).toBe("Rare");
    expect(result.slot).toBe("Helm");
  });

  it("settles on the correct numeric values", () => {
    const result = voteAllFrames();
    expect(result.itemPower).toBe(850);
    expect(result.primary).toEqual({ value: 1275, label: "Armor" });
    expect(result.requiresLevel).toBe(70);
    expect(result.sellValue).toBe(18257);
  });

  it("recovers every affix with its roll range", () => {
    const result = voteAllFrames();
    const byStat = new Map(result.affixes.map((a) => [a.stat, a]));

    expect(byStat.get("Dexterity")).toMatchObject({
      value: 86,
      range: { min: 83, max: 99 },
    });
    expect(byStat.get("Maximum Life")).toMatchObject({
      value: 1204,
      range: { min: 1016, max: 1225 },
    });
    expect(byStat.get("Life Regeneration")).toMatchObject({
      value: 140,
      range: { min: 128, max: 153 },
    });
    expect(byStat.get("Lucky Hit Chance")).toMatchObject({
      value: 6.2,
      isPercent: true,
    });
  });

  it("does not invent duplicate affixes from OCR jitter in stat names", () => {
    const result = voteAllFrames();
    // Four real affixes on this item; jittered stat spellings must merge.
    expect(result.affixes.length).toBeLessThanOrEqual(5);
  });

  it("counts frames observed", () => {
    const result = voteAllFrames();
    expect(result.framesSeen).toBe(frames.length);
  });
});

describe("createItemVoter behaviour", () => {
  it("votes on parsed values, so bracket damage does not split the vote", () => {
    const voter = createItemVoter({ windowSize: 8, threshold: 2 });
    // Same data, different delimiter damage per frame.
    voter.observe(parseItem("• +140 Life Regeneration [128 - 153]"));
    voter.observe(parseItem("• +140 Life Regeneration (128 - 153]"));

    const affixes = voter.getResult().affixes;
    expect(affixes).toHaveLength(1);
    expect(affixes[0]).toMatchObject({
      value: 140,
      range: { min: 128, max: 153 },
    });
  });

  it("keeps the scroll warning once seen, even if later frames miss it", () => {
    const voter = createItemVoter();
    voter.observe(parseItem("EQUIPPED\nRING\nUnique Ring\nScroll Down"));
    voter.observe(parseItem("EQUIPPED\nRING\nUnique Ring"));
    expect(voter.getResult().needsScroll).toBe(true);
  });

  it("clears accumulated state on reset", () => {
    const voter = createItemVoter();
    voter.observe(parseItem("EQUIPPED\nSILENT CROWN\nRare Helm\n850 Item Power"));
    expect(voter.getResult().name).not.toBeNull();

    voter.reset();
    const after = voter.getResult();
    expect(after.name).toBeNull();
    expect(after.affixes).toHaveLength(0);
    expect(after.framesSeen).toBe(0);
  });
});
