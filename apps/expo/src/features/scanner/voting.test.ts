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
    voter.vote("zzzzzzzzzz");
    voter.vote("UDAN");
    voter.vote("UDAN");
    expect(voter.getLocked()).toBe("UDAN");
  });

  it("evicts old votes outside the window", () => {
    // windowSize 3, threshold 3: after the last three votes are all distinct
    // and dissimilar, no cluster can reach the threshold.
    const voter = createFieldVoter({ windowSize: 3, threshold: 3 });
    voter.vote("UDAN");
    voter.vote("UDAN");
    voter.vote("zzzzzzzzzz");
    voter.vote("yyyyyyyyyy");
    expect(voter.getLocked()).toBeNull();
  });

  // This is the failure actually observed on device: the read was essentially
  // correct every frame, but OCR jitter meant no two frames agreed exactly,
  // so strict-equality counting never reached the threshold and the field
  // never settled.
  it("locks despite per-frame OCR jitter that never repeats exactly", () => {
    const voter = createFieldVoter({ windowSize: 8, threshold: 4 });
    voter.vote("Demonic Defender");
    voter.vote("Demonic Delender");
    voter.vote("Demonic Defender ");
    voter.vote("demonic defender");
    expect(voter.getLocked()).not.toBeNull();
  });

  it("reports the most common spelling, not a one-off garbled variant", () => {
    const voter = createFieldVoter({ windowSize: 8, threshold: 4 });
    voter.vote("Demonic Defender");
    voter.vote("Demonic Defender");
    voter.vote("Demonic Delender");
    voter.vote("Demonic Defender");
    expect(voter.getLocked()).toBe("Demonic Defender");
  });

  it("does not merge genuinely different short values", () => {
    const voter = createFieldVoter({ windowSize: 8, threshold: 3 });
    voter.vote("UDAN");
    voter.vote("ODIN");
    voter.vote("ADAM");
    expect(voter.getLocked()).toBeNull();
  });

  it("exposes a leading candidate before it locks", () => {
    const voter = createFieldVoter({ windowSize: 8, threshold: 5 });
    voter.vote("Demonic Defender");
    voter.vote("Demonic Delender");
    expect(voter.getLocked()).toBeNull();
    expect(voter.getLeading()).toBe("Demonic Defender");
  });

  it("ignores empty and whitespace-only readings", () => {
    const voter = createFieldVoter({ windowSize: 8, threshold: 2 });
    voter.vote("");
    voter.vote("   ");
    voter.vote(undefined);
    expect(voter.getLeading()).toBeNull();
  });
});
