import { describe, expect, it } from "vitest";

import { findAnchor } from "./anchor";
import { extractFields } from "./fields";
import fixtures from "./__fixtures__/frame-blocks.json";

describe("extractFields", () => {
  it("extracts name and title from the close-clean fixture (merged Name\\nTitle block)", () => {
    const sample = fixtures.find((f) => f.label === "close-clean")!;
    const anchor = findAnchor(sample.blocks);
    expect(anchor).not.toBeNull();
    const fields = extractFields(sample.blocks, anchor!);
    expect(fields.name).toBe("UDAN");
    // Real OCR noise: "Defender" misread as "Delender" in this capture --
    // that's genuine captured degradation, not something to normalize away.
    expect(fields.title).toBe("Demonic Delender");
  });

  it("extracts name and title from the wide-shot fixture (merged Name\\nTitle block)", () => {
    const sample = fixtures.find((f) => f.label === "wide-shot")!;
    const anchor = findAnchor(sample.blocks);
    expect(anchor).not.toBeNull();
    const fields = extractFields(sample.blocks, anchor!);
    expect(fields.name).toBe("UDAN");
    expect(fields.title).toBe("Demonic Defender");
  });

  it("does not throw on the angled-degraded fixture and best-effort matches the surviving name fragment", () => {
    // This fixture only has 2 blocks total: the degraded "GARACTa" header and
    // a separate small "DAN" block (presumably a truncated/degraded read of
    // "UDAN"). There's no newline-merged Name+Title block here at all, so a
    // clean "UDAN" + title extraction is not realistic -- the real capture
    // was simply too degraded for that. We assert the realistic outcome:
    // extraction doesn't throw, finds "DAN" as the best-effort name (it's the
    // only other block, and it's positioned below-and-near the anchor), and
    // title is not fabricated.
    const sample = fixtures.find((f) => f.label === "angled-degraded")!;
    const anchor = findAnchor(sample.blocks);
    expect(anchor).not.toBeNull();
    expect(() => extractFields(sample.blocks, anchor!)).not.toThrow();
    const fields = extractFields(sample.blocks, anchor!);
    expect(fields.name).toContain("DAN");
    expect(fields.title).toBeUndefined();
  });

  it("leaves level undefined when no level-like block is present (true for all captured fixtures so far)", () => {
    // Phase 0 measured only a 33% Level hit rate even on high-res stills; none
    // of the Phase 2 live-capture fixtures happen to contain a recognizable
    // Level block at all. Level is best-effort, not a gate -- this asserts
    // that reality rather than forcing a fake Level extraction.
    for (const sample of fixtures) {
      const anchor = findAnchor(sample.blocks);
      if (anchor == null) continue;
      const fields = extractFields(sample.blocks, anchor);
      expect(fields.level).toBeUndefined();
    }
  });
});
