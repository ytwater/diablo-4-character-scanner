export function createFieldVoter(opts: {
  windowSize: number;
  threshold: number;
}) {
  const window: string[] = [];
  let locked: string | null = null;

  return {
    vote(candidate: string | undefined) {
      if (locked != null || candidate == null) return;
      window.push(candidate);
      if (window.length > opts.windowSize) window.shift();

      const counts = new Map<string, number>();
      for (const v of window) counts.set(v, (counts.get(v) ?? 0) + 1);
      for (const [value, count] of counts) {
        if (count >= opts.threshold) {
          locked = value;
          break;
        }
      }
    },
    getLocked(): string | null {
      return locked;
    },
  };
}
