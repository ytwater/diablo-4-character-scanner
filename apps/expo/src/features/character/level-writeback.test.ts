import { describe, expect, it } from "vitest";

import { nextCharacterFromLock } from "./level-writeback";
import { createCharacter } from "./types";

const base = createCharacter({ name: "UDAN", class: "Spiritborn" });

describe("nextCharacterFromLock", () => {
  it("returns an updated character when a new level locks", () => {
    const next = nextCharacterFromLock(base, "93");
    expect(next?.level).toBe(93);
  });

  it("returns null when the locked level matches what is stored", () => {
    expect(nextCharacterFromLock({ ...base, level: 93 }, "93")).toBeNull();
  });

  it("returns null when nothing has locked yet", () => {
    expect(nextCharacterFromLock(base, null)).toBeNull();
  });

  it("returns null for a non-numeric or out-of-range read", () => {
    expect(nextCharacterFromLock(base, "9E")).toBeNull();
    expect(nextCharacterFromLock(base, "0")).toBeNull();
    expect(nextCharacterFromLock(base, "301")).toBeNull();
  });

  it("advances updatedAt", () => {
    const next = nextCharacterFromLock({ ...base, updatedAt: "2020-01-01T00:00:00.000Z" }, "93");
    expect(next).not.toBeNull();
    const updatedAt = next?.updatedAt ?? "";
    expect(updatedAt > "2020-01-01T00:00:00.000Z").toBe(true);
  });
});
