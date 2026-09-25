import { similarity } from "./anchor";
import itemNames from "./data/itemNames.json";

// Item names come from game data (see scripts/fetch-item-names.mjs): the
// fixed names of unique/mythic items, plus a vocabulary of every word
// generated names are built from, ordered most-common first.
const UNIQUES = itemNames.uniques.map((name) => ({
  name: name.toUpperCase(),
  key: letters(name),
}));
const PHRASES = itemNames.phrases.map((phrase) => ({
  words: phrase.split(" "),
  key: letters(phrase),
}));
const WORDS = itemNames.words;
const VOCAB = new Set(WORDS);

// A whole unique name must be this close (letters only) to be snapped to.
const UNIQUE_THRESHOLD = 0.8;
// A run of words containing a misread one must be this close (letters only)
// to a known multi-word name part to be replaced by it.
const PHRASE_THRESHOLD = 0.8;
const MAX_PHRASE_WORDS = 4;
// A single word may be at most this many edits, and this fraction of its
// length, from its replacement - ML Kit's misreads in the name font are a
// dropped or swapped glyph or two ("BOTS", "iONSON"), so anything further
// is more likely a word missing from the vocabulary than a misread.
const MAX_WORD_EDITS = 2;
const MAX_WORD_EDIT_RATIO = 0.34;

function letters(text: string): string {
  return text.toUpperCase().replace(/[^A-Z]/g, "");
}

function wordKey(token: string): string {
  return token.toUpperCase().replace(/[^A-Z']/g, "");
}

// similarity() is 1 - edits / longer length, and edits are at least the
// length difference - so a candidate whose length is too far off can't
// reach `threshold` and is skipped without computing its edit distance.
function lengthCanMatch(a: string, b: string, threshold: number): boolean {
  return (
    Math.abs(a.length - b.length) <=
    (1 - threshold) * Math.max(a.length, b.length)
  );
}

function levenshtein(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        (prev[j] ?? 0) + 1,
        (cur[j - 1] ?? 0) + 1,
        (prev[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[b.length] ?? 0;
}

function closestWord(key: string): string | undefined {
  const maxEdits = Math.min(
    MAX_WORD_EDITS,
    Math.floor(key.length * MAX_WORD_EDIT_RATIO),
  );
  if (maxEdits < 1) return undefined;
  let best: string | undefined;
  let bestEdits = maxEdits + 1;
  // WORDS is most-common first, so a strict "<" breaks ties toward the more
  // common word ("BOTS" -> "BOOTS", not a rarer one-edit neighbor).
  for (const word of WORDS) {
    if (Math.abs(word.length - key.length) > maxEdits) continue;
    const edits = levenshtein(key, word);
    if (edits < bestEdits) {
      best = word;
      bestEdits = edits;
      if (edits === 1) break;
    }
  }
  return best;
}

function snapPhrase(
  tokens: string[],
  start: number,
): { words: string[]; consumed: number } | undefined {
  for (
    let size = Math.min(MAX_PHRASE_WORDS, tokens.length - start);
    size >= 2;
    size--
  ) {
    const window = tokens.slice(start, start + size);
    if (window.every(isKnown)) continue;
    const key = letters(window.join(""));
    let best: { words: string[]; score: number } | undefined;
    for (const phrase of PHRASES) {
      if (Math.abs(phrase.words.length - size) > 1) continue;
      if (!lengthCanMatch(key, phrase.key, PHRASE_THRESHOLD)) continue;
      const score = similarity(key, phrase.key);
      if (!best || score > best.score) best = { words: phrase.words, score };
    }
    if (best && best.score >= PHRASE_THRESHOLD)
      return { words: best.words, consumed: size };
  }
  return undefined;
}

function isKnown(token: string): boolean {
  const key = wordKey(token);
  return key.length === 0 || VOCAB.has(key);
}

function correctWords(name: string): string {
  const tokens = name.split(/\s+/).filter(Boolean);

  // ML Kit sometimes splits a word at a wide glyph ("SUPRE MACY").
  const merged: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i] ?? "";
    const next = tokens[i + 1];
    if (
      next &&
      !isKnown(token) &&
      !isKnown(next) &&
      VOCAB.has(wordKey(token + next))
    ) {
      merged.push(token + next);
      i++;
    } else {
      merged.push(token);
    }
  }

  // Snap a run of words containing an unknown one to a known multi-word
  // part, so the misread word is corrected in context ("iONSON LINE" ->
  // "MONSOON LINE", where word-by-word "IONSON" is as close to "POISON").
  const phrased: string[] = [];
  for (let i = 0; i < merged.length; ) {
    const snap = snapPhrase(merged, i);
    if (snap) {
      phrased.push(...snap.words);
      i += snap.consumed;
    } else {
      phrased.push(merged[i] ?? "");
      i++;
    }
  }

  return phrased
    .map((token) => {
      const key = wordKey(token);
      if (key.length < 3 || VOCAB.has(key)) return token.toUpperCase();
      return closestWord(key) ?? token.toUpperCase();
    })
    .join(" ");
}

/**
 * Corrects ML Kit misreads in an item name using game data. A unique or
 * mythic item (per its type line) has a fixed name, so the whole name snaps
 * to the closest known one. Other names are generated from word pools, so
 * each unrecognized word is corrected to a close vocabulary word, if any.
 * Words that are already valid are never changed. Trailing Greater Affix
 * stars ("*") are kept.
 */
export function correctItemName(
  name: string,
  type: string | undefined,
): string {
  const stars = /(\s*\*)+\s*$/.exec(name)?.[0] ?? "";
  const base = name.slice(0, name.length - stars.length).trim();
  const suffix = stars.trim() ? ` ${stars.replace(/\s+/g, " ").trim()}` : "";

  if (type && /unique/i.test(type)) {
    const key = letters(base);
    let best: { name: string; score: number } | undefined;
    for (const unique of UNIQUES) {
      if (!lengthCanMatch(key, unique.key, UNIQUE_THRESHOLD)) continue;
      const score = similarity(key, unique.key);
      if (!best || score > best.score) best = { name: unique.name, score };
    }
    if (best && best.score >= UNIQUE_THRESHOLD) return best.name + suffix;
  }

  return correctWords(base) + suffix;
}
