export const scannerConfig = {
  targetFps: 8,
  voteWindowSize: 8,
  lockThresholds: {
    name: 5,
    title: 5,
    level: 3, // best-effort per Phase 0 -- rarely reaches this, and that's fine
  },
} as const;
