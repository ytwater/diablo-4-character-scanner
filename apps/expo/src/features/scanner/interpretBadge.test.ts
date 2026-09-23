import { interpretBadge } from "./interpretBadge";

describe("interpretBadge", () => {
  it("reads n as paragon once the character is already level 70", () => {
    expect(interpretBadge(93, { level: 70, paragon: 12 })).toEqual({
      level: 70,
      paragon: 93,
      ambiguous: false,
    });
  });

  it("treats n > 70 as paragon even if not stored as 70 yet", () => {
    expect(interpretBadge(93, { level: 45, paragon: null })).toEqual({
      level: 70,
      paragon: 93,
      ambiguous: false,
    });
  });

  it("treats n <= 70 as level when not yet 70, flagged ambiguous", () => {
    expect(interpretBadge(70, { level: 45, paragon: null })).toEqual({
      level: 70,
      paragon: null,
      ambiguous: true,
    });
    expect(interpretBadge(45, { level: 30, paragon: null })).toEqual({
      level: 45,
      paragon: null,
      ambiguous: false,
    });
  });
});
