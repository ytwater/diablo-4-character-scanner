export const scannerConfig = {
  // NOTE: the scanText plugin's ML Kit call costs ~500-700ms per invocation
  // (see Phase 2 Task 7 notes) -- a real ceiling of ~1.4-2 calls/sec,
  // regardless of this target. Setting targetFps below that ceiling (rather
  // than at the original 8 the design doc assumed) is what actually lets the
  // camera's buffer pool recover between calls instead of running out and
  // stalling the preview.
  targetFps: 2,
  voteWindowSize: 8,
  lockThresholds: {
    name: 5,
    title: 5,
    level: 3, // best-effort per Phase 0 -- rarely reaches this, and that's fine
  },
} as const;
