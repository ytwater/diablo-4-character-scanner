import { describe, expect, it } from "vitest";

import type { ItemCandidates } from "@acme/validators";

import { parseCandidatesFromModelText } from "./scan";

describe("parseCandidatesFromModelText", () => {
  it("parses clean JSON", () => {
    const result = parseCandidatesFromModelText(
      '{"level":"50","title":"Slayer","name":"Aldric"}',
      "character",
    );
    expect(result).toEqual({ level: "50", title: "Slayer", name: "Aldric" });
  });

  it("parses JSON wrapped in a markdown code fence", () => {
    const result = parseCandidatesFromModelText(
      '```json\n{"level":"50","title":"Slayer","name":"Aldric"}\n```',
      "character",
    );
    expect(result).toEqual({ level: "50", title: "Slayer", name: "Aldric" });
  });

  it("parses JSON preceded by prose", () => {
    const result = parseCandidatesFromModelText(
      'Here is the extracted data:\n{"level":"50","title":"Slayer","name":"Aldric"}',
      "character",
    );
    expect(result).toEqual({ level: "50", title: "Slayer", name: "Aldric" });
  });

  it("returns empty candidates for unparseable text", () => {
    const result = parseCandidatesFromModelText(
      "I cannot read this image.",
      "character",
    );
    expect(result).toEqual({});
  });

  it("defaults affixes to an empty array for item mode", () => {
    const result = parseCandidatesFromModelText(
      '{"name":"Doombringer","type":"Rare Sword"}',
      "item",
    );
    expect(result).toEqual({
      name: "Doombringer",
      type: "Rare Sword",
      rarity: "rare",
      affixes: [],
    });
  });

  it("throws on malformed JSON that isn't recoverable", () => {
    expect(() =>
      parseCandidatesFromModelText("{not json", "character"),
    ).toThrow();
  });

  // Workers AI parses a JSON-only reply itself and hands back an object in
  // `response`, despite its generated types declaring a string.
  it("accepts a response Workers AI already parsed into an object", () => {
    const result = parseCandidatesFromModelText(
      { level: "93", title: "Demonic Defender", name: "UDAN" },
      "character",
    );
    expect(result).toEqual({
      level: "93",
      title: "Demonic Defender",
      name: "UDAN",
    });
  });

  it("defaults affixes for an already-parsed item response", () => {
    const result = parseCandidatesFromModelText(
      { name: "Silent Crown", type: "Rare Helm" },
      "item",
    );
    expect(result).toEqual({
      name: "Silent Crown",
      type: "Rare Helm",
      rarity: "rare",
      affixes: [],
    });
  });

  it("returns empty candidates for a missing response", () => {
    expect(parseCandidatesFromModelText(undefined, "item")).toEqual({
      affixes: [],
    });
  });

  describe("item rarity", () => {
    const item = (fields: Record<string, unknown>) =>
      parseCandidatesFromModelText(
        { affixes: [], ...fields },
        "item",
      ) as ItemCandidates;

    it("normalizes the model's capitalized rarity to the enum value", () => {
      expect(item({ rarity: "Legendary" })).toMatchObject({
        rarity: "legendary",
      });
      expect(item({ rarity: "Mythic Unique" })).toMatchObject({
        rarity: "mythicUnique",
      });
    });

    it("prefers the rarity spelled out in the type line", () => {
      expect(
        item({
          type: "Ancestral Mythic Unique Quarterstaff",
          rarity: "Unique",
        }),
      ).toMatchObject({ rarity: "mythicUnique" });
      expect(item({ type: "Rare Helm", rarity: "Legendary" })).toMatchObject({
        rarity: "rare",
      });
    });

    it("drops a rarity it doesn't recognize", () => {
      expect(item({ rarity: "Shiny" }).rarity).toBeUndefined();
    });
  });

  it("throws on an already-parsed object that doesn't match the schema", () => {
    expect(() =>
      parseCandidatesFromModelText({ level: 93 }, "character"),
    ).toThrow();
  });
});
