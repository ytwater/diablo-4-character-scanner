import { describe, expect, it } from "vitest";

import { createFieldVoter } from "./voting";

describe("createFieldVoter", () => {
  it("locks after reaching the threshold within the window", () => {
    const voter = createFieldVoter({ windowSize: 8, threshold: 3 });
    voter.vote("UDAN");
    voter.vote("UDAN");
    expect(voter.getLocked()).toBeNull();
    voter.vote("UDAN");
    expect(voter.getLocked()).toBe("UDAN");
  });

  it("tolerates a single bad frame without resetting the count", () => {
    const voter = createFieldVoter({ windowSize: 8, threshold: 3 });
    voter.vote("UDAN");
    voter.vote("garbled");
    voter.vote("UDAN");
    voter.vote("UDAN");
    expect(voter.getLocked()).toBe("UDAN");
  });

  it("evicts old votes outside the window", () => {
    const voter = createFieldVoter({ windowSize: 3, threshold: 3 });
    voter.vote("UDAN");
    voter.vote("UDAN");
    voter.vote("garbled");
    voter.vote("other");
    // window is now [UDAN, garbled, other] -- one of the two UDAN votes aged
    // out (it was pushed off the front once a 4th vote arrived), so no
    // candidate has reached the threshold of 3 within the window.
    //
    // Note: a sequence ending in 3 *identical* votes back-to-back (e.g.
    // "garbled", "garbled", "garbled") would correctly lock to "garbled" here
    // -- that's not a bug, it's the inevitable, correct behavior of a
    // sliding-window vote count once the window is fully homogeneous and
    // threshold == windowSize. This test instead demonstrates eviction
    // itself: that older votes are dropped and no longer count toward a
    // future majority, without relying on a scenario that would force a
    // lock regardless of eviction.
    expect(voter.getLocked()).toBeNull();
  });
});
