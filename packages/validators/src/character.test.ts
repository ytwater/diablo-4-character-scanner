import { describe, expect, it } from "vitest";

import { CharacterClassSchema, slotsForClass } from "./character";

describe("slotsForClass", () => {
  it("returns a non-empty, de-duplicated slot list for every class", () => {
    for (const cls of CharacterClassSchema.options) {
      const slots = slotsForClass(cls);
      expect(slots.length).toBeGreaterThan(0);
      expect(new Set(slots).size).toBe(slots.length);
      expect(slots).toContain("helm");
    }
  });
});
