import fixture from "./__fixtures__/ocr-blocks/character-sheet-02.json";
import { findAnchor } from "./anchor";
import { extractFields } from "./fields";
import { scannerConfig } from "./config";

describe("extractFields", () => {
  it("extracts level, name, and title from a real capture", () => {
    const anchor = findAnchor(
      fixture.blocks,
      scannerConfig.anchorText,
      scannerConfig.anchorFuzzyThreshold,
    );
    if (!anchor) throw new Error("Anchor not found in fixture - fix Task 7 first");

    const fields = extractFields(fixture.blocks, anchor);

    expect(fields.level?.text).toContain("93");
    expect(fields.name?.text.toUpperCase()).toContain("UDAN");
    expect(fields.title?.text).toContain("Demonic Defender");
  });
});
