import { describe, expect, it } from "vitest";

import { createCharacter, isD4Class, parseCharacter } from "./types";

describe("isD4Class", () => {
  it("accepts a known class", () => {
    expect(isD4Class("Spiritborn")).toBe(true);
  });

  it("rejects an unknown or wrongly-cased class", () => {
    expect(isD4Class("Paladin")).toBe(false);
    expect(isD4Class("spiritborn")).toBe(false);
  });
});

describe("createCharacter", () => {
  it("trims the name and stamps id and updatedAt", () => {
    const c = createCharacter({ name: "  UDAN  ", class: "Spiritborn" });
    expect(c.name).toBe("UDAN");
    expect(c.id).toMatch(/.+/);
    expect(Date.parse(c.updatedAt)).not.toBeNaN();
  });

  it("rejects an empty or whitespace-only name", () => {
    expect(() => createCharacter({ name: "   ", class: "Rogue" })).toThrow();
  });

  it("caps an overlong name at 64 characters", () => {
    const c = createCharacter({ name: "x".repeat(100), class: "Rogue" });
    expect(c.name).toHaveLength(64);
  });
});

describe("parseCharacter", () => {
  it("round-trips a valid record", () => {
    const c = createCharacter({ name: "UDAN", class: "Spiritborn" });
    expect(parseCharacter(JSON.parse(JSON.stringify(c)))).toEqual(c);
  });

  it("returns null for a record with an unknown class", () => {
    expect(parseCharacter({ id: "1", name: "UDAN", class: "Paladin", updatedAt: "x" })).toBeNull();
  });

  it("returns null for a non-object or missing name", () => {
    expect(parseCharacter(null)).toBeNull();
    expect(parseCharacter({ id: "1", class: "Rogue" })).toBeNull();
  });
});
