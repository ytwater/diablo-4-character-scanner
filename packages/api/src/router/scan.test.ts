import { describe, expect, it } from "vitest";

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
      affixes: [],
    });
  });

  it("throws on malformed JSON that isn't recoverable", () => {
    expect(() =>
      parseCandidatesFromModelText("{not json", "character"),
    ).toThrow();
  });
});
