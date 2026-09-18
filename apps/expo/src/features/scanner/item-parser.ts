/**
 * Parses a Diablo 4 item tooltip out of raw ML Kit text.
 *
 * Why parse rather than vote on raw strings, as the character sheet does:
 * measured against real captured frames, every numeric value came back correct
 * while the errors landed almost entirely in delimiters -- "[" read as "(",
 * "]" as ")", "+" as "t". Item text has a known grammar
 * ("+VALUE Stat [MIN - MAX]"), so parsing against that grammar recovers the
 * meaning despite mangled punctuation. Voting then happens on parsed values,
 * where a bracket misread can't split the vote at all.
 */

/** Rarities are a closed set, which makes them a reliable structural landmark. */
const RARITIES = [
  "Mythic Unique",
  "Unique",
  "Legendary",
  "Ancestral",
  "Rare",
  "Magic",
  "Common",
] as const;

export interface ItemAffix {
  /** The rolled value, e.g. 1204 for "+1,204 Maximum Life". */
  value: number;
  /** True for "+6.2% Lucky Hit Chance". */
  isPercent: boolean;
  /** The stat name, e.g. "Maximum Life". */
  stat: string;
  /** The possible roll range, when the tooltip shows one. */
  range?: { min: number; max: number };
}

export interface ParsedItem {
  name?: string;
  rarity?: string;
  /** e.g. "Helm", "Ring" -- whatever followed the rarity. */
  slot?: string;
  itemPower?: number;
  /** e.g. { value: 1275, label: "Armor" } or { value: 138, label: "All Resist" }. */
  primary?: { value: number; label: string };
  affixes: ItemAffix[];
  requiresLevel?: number;
  sellValue?: number;
  /** True when the tooltip is truncated and the game is showing "Scroll Down". */
  needsScroll: boolean;
}

/** Strips thousands separators and parses. Returns null for unparseable input. */
function num(raw: string): number | null {
  const cleaned = raw.replace(/,/g, "").trim();
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Repairs the specific substitutions OCR actually made on this content.
 * Deliberately narrow: only touches characters in positions where the grammar
 * says a "+" or a bracket belongs, so legitimate parentheses elsewhere in the
 * tooltip ("(2 times)", "(Overflow: ...)") are left alone.
 */
function repairAffixLine(line: string): string {
  return (
    line
      // Leading bullet glyphs ML Kit emits for the affix diamonds.
      .replace(/^[\s•·◆*]+/, "")
      // "t6.2%" / "f86" -> "+6.2%" / "+86": a leading letter where a sign belongs.
      .replace(/^[tf](?=\d)/i, "+")
      .trim()
  );
}

/** Matches "[83-99]", "(1,016 - 1,225]", "[6.0 - 8.0]" -- either bracket style. */
const RANGE = /[[({]\s*([\d.,]+)\s*-\s*([\d.,]+)\s*[\])}]?/;

const BULLET = /^[\s•·◆*]+/;

/**
 * True when `next` is plausibly the tail of an affix that OCR split in two.
 *
 * ML Kit's line breaks don't match the tooltip's logical lines, and where a
 * given affix breaks changes from frame to frame. Real captures include
 * "+140 Life Regeneration (128 -" / "153]" and "+6.2%" / "Lucky Hit Chance
 * [6.0 - 8.0]%"; without rejoining these, an affix silently loses its range or
 * its stat name.
 *
 * These rules are deliberately narrow rather than a general "brackets look
 * unbalanced" test. A closing bracket is sometimes itself misread as a digit
 * ("8.0]%" -> "8.01%"), which leaves a line looking permanently unbalanced --
 * a balance-based rule then swallows every following line, eating "Sell Value"
 * and friends.
 */
function continuesPrevious(prev: string, next: string): boolean {
  const prevBody = prev.replace(BULLET, "").trim();

  // "...Regeneration (128 -" + "153]"
  if (/-\s*$/.test(prev) && /^[\d.,]/.test(next)) return true;

  // "+6.2%" + "Lucky Hit Chance [6.0 - 8.0]%"
  if (/^[+-]?[\d.,]+%?$/.test(prevBody) && /^[A-Za-z]/.test(next)) return true;

  // "...Life [1,016" + "- 1,225]"
  if (/[[({][\d.,\s]*$/.test(prev) && /^[-\d.,]/.test(next)) return true;

  return false;
}

/** Rejoins OCR lines into logical tooltip lines. */
function unwrapLines(lines: string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    const prev = out[out.length - 1];
    if (prev != null && !BULLET.test(line) && continuesPrevious(prev, line)) {
      out[out.length - 1] = `${prev} ${line}`.replace(/\s+/g, " ");
    } else {
      out.push(line);
    }
  }
  return out;
}

function parseAffix(rawLine: string): ItemAffix | null {
  const line = repairAffixLine(rawLine);

  // Must start with an optional sign then a number -- that's what separates an
  // affix from prose lines like "Cast 2 Mobility or Macabre Skills."
  const head = /^([+-]?)([\d.,]+)(%?)\s+(.+)$/.exec(line);
  if (head == null) return null;

  const value = num(head[2]!);
  if (value == null) return null;

  const isPercent = head[3] === "%";
  let rest = head[4]!;

  let range: { min: number; max: number } | undefined;
  const rangeMatch = RANGE.exec(rest);
  if (rangeMatch != null) {
    const min = num(rangeMatch[1]!);
    const max = num(rangeMatch[2]!);
    if (min != null && max != null) range = { min, max };
    rest = rest.slice(0, rangeMatch.index);
  }

  // Trim the trailing "+" that precedes some ranges ("Dexterity +[83-99]")
  // and any stray percent/bracket left at the end.
  const stat = rest
    .replace(/[+\-\s%[\](){}]+$/, "")
    .replace(/\s+/g, " ")
    .trim();

  // A real affix names a stat in words. Requiring that rejects numbers picked
  // up from outside the tooltip -- captured frames include the character
  // sheet's gold counter ("686,691,098  283") and other players' level tags
  // ("Kaydos | 70 (29)") sitting behind the overlay, which otherwise parse as
  // nonsense affixes. Proper spatial cropping to the tooltip region would be
  // the more complete fix; this is the cheap guard that works today.
  if (!/^[A-Za-z]/.test(stat)) return null;
  if ((stat.match(/[A-Za-z]/g) ?? []).length < 3) return null;

  return { value, isPercent, stat, ...(range != null ? { range } : {}) };
}

function findRarityLine(lines: string[]): { index: number; rarity: string; slot?: string } | null {
  for (let i = 0; i < lines.length; i++) {
    for (const rarity of RARITIES) {
      // Anchored at line start so "Lord of Hatred Item" can't match "Rare".
      const re = new RegExp(`^${rarity}\\b\\s*(.*)$`, "i");
      const m = re.exec(lines[i]!.trim());
      if (m != null) {
        const slot = m[1]!.trim();
        return {
          index: i,
          rarity,
          ...(slot.length > 0 ? { slot } : {}),
        };
      }
    }
  }
  return null;
}

export function parseItem(rawText: string): ParsedItem {
  const lines = unwrapLines(
    rawText
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0),
  );

  const item: ParsedItem = {
    affixes: [],
    needsScroll: /scroll\s*down/i.test(rawText),
  };

  const rarityLine = findRarityLine(lines);
  if (rarityLine != null) {
    item.rarity = rarityLine.rarity;
    if (rarityLine.slot != null) item.slot = rarityLine.slot;
  }

  // The name sits between the EQUIPPED header and the rarity line, and wraps
  // across lines for longer names ("RING OF THE" / "MIDNIGHT SUN"), so take
  // everything in between rather than assuming a single line.
  // Tolerant of trailing OCR noise ("EQUIPPEDD ."). An exact-match test here
  // silently loses the item name whenever the header picks up a stray glyph.
  const equippedIndex = lines.findIndex((l) => /^equipp?e?d\b/i.test(l));
  if (equippedIndex >= 0 && rarityLine != null && rarityLine.index > equippedIndex + 1) {
    const name = lines
      .slice(equippedIndex + 1, rarityLine.index)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (name.length > 0) item.name = name;
  }

  for (const line of lines) {
    const power = /^([\d.,]+)\s+Ite[mn]n?\s+Power/i.exec(line);
    if (power != null) {
      const n = num(power[1]!);
      if (n != null) item.itemPower = n;
      continue;
    }

    const requires = /Requires\s+Level\s+([\d,]+)/i.exec(line);
    if (requires != null) {
      const n = num(requires[1]!);
      if (n != null) item.requiresLevel = n;
      continue;
    }

    const sell = /Sell\s+Value:?\s+([\d.,]+)/i.exec(line);
    if (sell != null) {
      const n = num(sell[1]!);
      if (n != null) item.sellValue = n;
      continue;
    }

    // The defensive headline stat: "1,275 Armor", "138 All Resist".
    const primary = /^([\d.,]+)\s+(Armor|All\s+Resist)$/i.exec(line);
    if (primary != null) {
      const n = num(primary[1]!);
      if (n != null) item.primary = { value: n, label: primary[2]!.replace(/\s+/g, " ") };
      continue;
    }

    const affix = parseAffix(line);
    if (affix != null) item.affixes.push(affix);
  }

  return item;
}
