import type { OcrBlock } from "./anchor";
import fixture from "./__fixtures__/ocr-blocks/character-sheet-02.json";
import { findAnchor } from "./anchor";
import { scannerConfig } from "./config";
import { extractFields, findLevelBadgeRegion, pickBadgeLevel } from "./fields";

function block(text: string, x: number, y: number): OcrBlock {
  return { text, confidence: 1, frame: { x, y, width: 200, height: 40 } };
}

describe("extractFields", () => {
  it("extracts level, name, and title from a real capture", () => {
    const anchor = findAnchor(
      fixture.blocks,
      scannerConfig.anchorText,
      scannerConfig.anchorFuzzyThreshold,
    );
    if (!anchor)
      throw new Error("Anchor not found in fixture - fix Task 7 first");

    const fields = extractFields(fixture.blocks, anchor);

    expect(fields.level?.text).toContain("93");
    expect(fields.name?.text.toUpperCase()).toContain("UDAN");
    expect(fields.title?.text).toContain("Demonic Defender");
  });

  const anchor = block("CHARACTER G", 400, 0);

  it("skips player nameplates when picking the name and title", () => {
    const blocks = [
      anchor,
      block("TWC> DeathBeth | 70 (65)", 0, 60),
      block("93", 300, 90),
      block("UDAN", 450, 100),
      block("Demonic Defender", 420, 160),
    ];

    const fields = extractFields(blocks, anchor);

    expect(fields.level?.text).toBe("93");
    expect(fields.name?.text).toBe("UDAN");
    expect(fields.title?.text).toBe("Demonic Defender");
  });

  it("leaves the level blank rather than taking a nameplate or stat number", () => {
    const blocks = [
      anchor,
      block("DeathBeth | 70 (65)", 0, 60),
      block("UDAN", 450, 100),
      block("Demonic Defender", 420, 160),
      block("Weapon Damage", 420, 300),
      block("3,809", 420, 340),
      block("190", 600, 500), // Strength value
    ];

    const fields = extractFields(blocks, anchor);

    expect(fields.level).toBeUndefined();
    expect(fields.name?.text).toBe("UDAN");
  });
});

describe("findLevelBadgeRegion", () => {
  it("spans left of the header's left edge, from the header's bottom to the name's bottom", () => {
    const header = block("CHARACTER G", 400, 0); // bottom at 40
    const name = block("UDAN", 500, 100); // 100px right of the header

    expect(findLevelBadgeRegion(header, name)).toEqual({
      x: 250,
      y: 40,
      width: 200,
      height: 100,
    });
  });

  it("returns undefined when the name isn't right of and below the header", () => {
    expect(
      findLevelBadgeRegion(block("CHARACTER", 400, 0), block("UDAN", 300, 100)),
    ).toBeUndefined();
    expect(
      findLevelBadgeRegion(
        block("CHARACTER", 400, 100),
        block("UDAN", 500, 50),
      ),
    ).toBeUndefined();
  });
});

describe("pickBadgeLevel", () => {
  it("takes a bare number read upright", () => {
    expect(pickBadgeLevel([{ ...block("93", 0, 0), angle: 2 }])?.text).toBe(
      "93",
    );
  });

  it("rejects a number ML Kit read upside down", () => {
    // "93" rotated 180 degrees reads as "26" / "£6".
    expect(
      pickBadgeLevel([{ ...block("26", 0, 0), angle: -175 }]),
    ).toBeUndefined();
  });

  it("rejects anything that isn't a bare 1-3 digit number", () => {
    expect(
      pickBadgeLevel([block("93)", 0, 0), block("1,501", 0, 50)]),
    ).toBeUndefined();
  });
});

// Line-level ML Kit captures of one character (level 93, UDAN, Demonic
// Defender), full frame. ML Kit misses the small level badge in several of
// these; a miss must come back blank, never as some other number.
const sheets = Array.from({ length: 14 }, (_, i) =>
  String(i + 1).padStart(2, "0"),
);

describe.each(sheets)("real capture character-sheet-%s", (id) => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const capture = require(
    `./__fixtures__/character-sheets/character-sheet-${id}.json`,
  ) as {
    blocks: OcrBlock[];
  };
  const anchor = findAnchor(
    capture.blocks,
    scannerConfig.anchorText,
    scannerConfig.anchorFuzzyThreshold,
  );
  const fields = anchor ? extractFields(capture.blocks, anchor) : {};

  it("never reports a wrong level", () => {
    expect([undefined, "93"]).toContain(fields.level?.text.trim());
  });

  // 06 (anchor not read) and 13 (sheet cut off) have no fields to find.
  if (id !== "06" && id !== "13") {
    it("extracts the name and title", () => {
      expect(fields.name?.text).toBe("UDAN");
      expect(fields.title?.text).toBe("Demonic Defender");
    });
  }
});

// Real second-pass captures: each photo's badge region (from
// findLevelBadgeRegion on its first pass) recognized at 1x and 3x. The
// scanner tries 1x, then 3x. 11's badge is outside the photo.
const badges = [
  "01",
  "02",
  "03",
  "04",
  "05",
  "07",
  "08",
  "09",
  "10",
  "11",
  "12",
  "14",
];

describe("level badge second pass on real captures", () => {
  const levels = badges.map((id) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pass = require(
      `./__fixtures__/level-badges/character-sheet-${id}.json`,
    ) as {
      x1: { blocks: OcrBlock[] };
      x3: { blocks: OcrBlock[] };
    };
    return (pickBadgeLevel(pass.x1.blocks) ?? pickBadgeLevel(pass.x3.blocks))
      ?.text;
  });

  it("never reports a wrong level", () => {
    for (const level of levels) expect([undefined, "93"]).toContain(level);
  });

  it("recovers the level on most captures", () => {
    expect(levels.filter((l) => l === "93").length).toBeGreaterThanOrEqual(9);
  });
});

describe.each(sheets.filter((id) => badges.includes(id)))(
  "badge region on real capture character-sheet-%s",
  (id) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const capture = require(
      `./__fixtures__/character-sheets/character-sheet-${id}.json`,
    ) as {
      blocks: OcrBlock[];
    };
    const anchor = findAnchor(
      capture.blocks,
      scannerConfig.anchorText,
      scannerConfig.anchorFuzzyThreshold,
    );
    const name = anchor && extractFields(capture.blocks, anchor).name;
    const badge = capture.blocks.find((b) => b.text.trim() === "93");

    it("contains the badge whenever the first pass did read it", () => {
      const region =
        anchor && name ? findLevelBadgeRegion(anchor, name) : undefined;
      expect(region).toBeDefined();
      if (!badge || !region) return;
      expect(badge.frame.x).toBeGreaterThanOrEqual(region.x);
      expect(badge.frame.y).toBeGreaterThanOrEqual(region.y);
      expect(badge.frame.x + badge.frame.width).toBeLessThanOrEqual(
        region.x + region.width,
      );
      expect(badge.frame.y + badge.frame.height).toBeLessThanOrEqual(
        region.y + region.height,
      );
    });
  },
);
