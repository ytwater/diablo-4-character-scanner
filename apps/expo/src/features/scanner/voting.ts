export interface VoteState<T> {
  window: T[];
  locked?: T;
}

export function createVoteState<T>(): VoteState<T> {
  return { window: [] };
}

export function castVote<T>(
  state: VoteState<T>,
  candidate: T | undefined,
  windowSize: number,
  threshold: number,
  isEqual: (a: T, b: T) => boolean = (a, b) => a === b,
): VoteState<T> {
  if (state.locked !== undefined) return state;
  if (candidate === undefined) return state;

  const window = [...state.window, candidate].slice(-windowSize);

  const groups: { value: T; count: number }[] = [];
  for (const item of window) {
    const existing = groups.find((g) => isEqual(g.value, item));
    if (existing) existing.count++;
    else groups.push({ value: item, count: 1 });
  }

  const winner = groups.find((g) => g.count >= threshold);
  return { window, locked: winner?.value };
}
