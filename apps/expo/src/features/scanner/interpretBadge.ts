export interface BadgeResult {
  level: number;
  paragon: number | null;
  ambiguous: boolean;
}

/**
 * Resolves the character-sheet level/paragon badge, which shows character
 * level below 70 and paragon level at 70 — the same on-screen number means
 * two different things depending on state. See
 * docs/plans/2026-09-23-character-builder-design.md, "Level and paragon".
 */
export function interpretBadge(
  n: number,
  current: { level: number; paragon: number | null },
): BadgeResult {
  if (current.level === 70) {
    return { level: 70, paragon: n, ambiguous: false };
  }
  if (n > 70) {
    return { level: 70, paragon: n, ambiguous: false };
  }
  return { level: n, paragon: null, ambiguous: n === 70 };
}
