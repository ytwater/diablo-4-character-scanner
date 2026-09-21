import { castVote, createVoteState } from "./voting";

describe("castVote", () => {
  it("locks once a candidate reaches the threshold within the window", () => {
    let state = createVoteState<string>();
    state = castVote(state, "93", 8, 3);
    expect(state.locked).toBeUndefined();
    state = castVote(state, "93", 8, 3);
    expect(state.locked).toBeUndefined();
    state = castVote(state, "93", 8, 3);
    expect(state.locked).toBe("93");
  });

  it("survives a single bad frame without resetting the count", () => {
    let state = createVoteState<string>();
    state = castVote(state, "93", 8, 3);
    state = castVote(state, "9E", 8, 3); // one blurred/misread frame
    state = castVote(state, "93", 8, 3);
    state = castVote(state, "93", 8, 3);
    expect(state.locked).toBe("93");
  });

  it("keeps only the last windowSize votes", () => {
    let state = createVoteState<string>();
    // 3 votes for "A", then enough "B" votes to push "A" out of an 8-wide window
    for (let i = 0; i < 3; i++) state = castVote(state, "A", 8, 5);
    for (let i = 0; i < 5; i++) state = castVote(state, "B", 8, 5);
    expect(state.locked).toBe("B");
  });

  it("does not vote when the candidate is undefined", () => {
    let state = createVoteState<string>();
    state = castVote(state, "93", 8, 1);
    state = castVote(state, undefined, 8, 1);
    expect(state.window).toEqual(["93"]);
  });

  it("stays locked once locked, ignoring further votes", () => {
    let state = createVoteState<string>();
    for (let i = 0; i < 3; i++) state = castVote(state, "93", 8, 3);
    state = castVote(state, "77", 8, 3);
    expect(state.locked).toBe("93");
  });
});
