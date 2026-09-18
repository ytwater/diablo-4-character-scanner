import type { Character } from "./types";

/** Diablo 4's level cap, with headroom. Anything outside this is an OCR misread. */
const MIN_LEVEL = 1;
const MAX_LEVEL = 300;

/**
 * Returns the character to save when a level locks, or null when nothing
 * should be written. Called per frame, so it must be cheap and must not
 * rewrite storage when the value has not changed.
 */
export function nextCharacterFromLock(
  character: Character,
  locked: string | null,
): Character | null {
  if (locked == null) return null;

  if (!/^\d+$/.test(locked)) return null;
  const level = Number(locked);
  if (level < MIN_LEVEL || level > MAX_LEVEL) return null;
  if (level === character.level) return null;

  return { ...character, level, updatedAt: new Date().toISOString() };
}
