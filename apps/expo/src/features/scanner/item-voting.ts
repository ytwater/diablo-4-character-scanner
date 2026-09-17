import type { ItemAffix, ParsedItem } from "./item-parser";
import { scannerConfig } from "./config";
import { isSameReading } from "./text-distance";
import { createFieldVoter, type FieldVoter } from "./voting";

/**
 * Accumulates parsed item tooltips across frames.
 *
 * Voting happens on *parsed* values rather than raw OCR text. That's the whole
 * point of parsing first: "+1,204 Maximum Life [1,016 - 1,225]" and
 * "+1,204 Maximum Life (1,016 - 1,225]" are different strings but identical
 * data, so raw-text voting would split them while value voting agrees
 * immediately.
 */

export interface VotedAffix {
  stat: string;
  value: number;
  isPercent: boolean;
  range?: { min: number; max: number };
  /** How many frames have agreed on this affix's value. */
  agreement: number;
}

export interface VotedItem {
  name: string | null;
  rarity: string | null;
  slot: string | null;
  itemPower: number | null;
  primary: { value: number; label: string } | null;
  requiresLevel: number | null;
  sellValue: number | null;
  affixes: VotedAffix[];
  needsScroll: boolean;
  framesSeen: number;
}

export interface ItemVoter {
  observe(parsed: ParsedItem): void;
  getResult(): VotedItem;
  reset(): void;
}

/** Serializes an affix so equal readings produce an equal vote key. */
function affixKey(affix: ItemAffix): string {
  const range = affix.range != null ? `${affix.range.min}-${affix.range.max}` : "";
  return `${affix.value}|${affix.isPercent ? "%" : ""}|${range}`;
}

function parseAffixKey(stat: string, key: string): VotedAffix | null {
  const [rawValue, pct, range] = key.split("|");
  const value = Number(rawValue);
  if (!Number.isFinite(value)) return null;

  const affix: VotedAffix = {
    stat,
    value,
    isPercent: pct === "%",
    agreement: 0,
  };

  if (range != null && range.length > 0) {
    const [min, max] = range.split("-").map(Number);
    if (Number.isFinite(min) && Number.isFinite(max)) {
      affix.range = { min: min!, max: max! };
    }
  }
  return affix;
}

export function createItemVoter(
  opts: { windowSize?: number; threshold?: number } = {},
): ItemVoter {
  const windowSize = opts.windowSize ?? scannerConfig.voteWindowSize;
  const threshold = opts.threshold ?? scannerConfig.lockThresholds.name;

  const makeVoter = () => createFieldVoter({ windowSize, threshold });

  let scalars: Record<string, FieldVoter>;
  /** Affixes are keyed by stat name, matched fuzzily so OCR jitter in the
   *  stat label ("Maximum Life" / "Maximurn Life") doesn't create a duplicate. */
  let affixVoters: { stat: string; voter: FieldVoter; seen: number }[];
  let framesSeen: number;
  let needsScroll: boolean;

  function reset() {
    scalars = {
      name: makeVoter(),
      rarity: makeVoter(),
      slot: makeVoter(),
      itemPower: makeVoter(),
      primary: makeVoter(),
      requiresLevel: makeVoter(),
      sellValue: makeVoter(),
    };
    affixVoters = [];
    framesSeen = 0;
    needsScroll = false;
  }

  reset();

  function voterForStat(stat: string) {
    const existing = affixVoters.find((a) => isSameReading(a.stat, stat));
    if (existing != null) {
      existing.seen += 1;
      return existing;
    }
    const created = { stat, voter: makeVoter(), seen: 1 };
    affixVoters.push(created);
    return created;
  }

  function leadingNumber(key: string): number | null {
    const raw = scalars[key]!.getLeading();
    if (raw == null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  return {
    observe(parsed: ParsedItem) {
      framesSeen += 1;
      // Sticky: once the game has told us the tooltip is truncated, a frame
      // that happens to miss the indicator shouldn't clear the warning.
      if (parsed.needsScroll) needsScroll = true;

      if (parsed.name != null) scalars.name!.vote(parsed.name);
      if (parsed.rarity != null) scalars.rarity!.vote(parsed.rarity);
      if (parsed.slot != null) scalars.slot!.vote(parsed.slot);
      if (parsed.itemPower != null) scalars.itemPower!.vote(String(parsed.itemPower));
      if (parsed.requiresLevel != null)
        scalars.requiresLevel!.vote(String(parsed.requiresLevel));
      if (parsed.sellValue != null) scalars.sellValue!.vote(String(parsed.sellValue));
      if (parsed.primary != null)
        scalars.primary!.vote(`${parsed.primary.value}|${parsed.primary.label}`);

      for (const affix of parsed.affixes) {
        voterForStat(affix.stat).voter.vote(affixKey(affix));
      }
    },

    getResult(): VotedItem {
      const primaryRaw = scalars.primary!.getLeading();
      let primary: { value: number; label: string } | null = null;
      if (primaryRaw != null) {
        const [value, label] = primaryRaw.split("|");
        const n = Number(value);
        if (Number.isFinite(n) && label != null) primary = { value: n, label };
      }

      const affixes: VotedAffix[] = [];
      for (const entry of affixVoters) {
        const key = entry.voter.getLeading();
        if (key == null) continue;
        const affix = parseAffixKey(entry.stat, key);
        if (affix != null) {
          affix.agreement = entry.seen;
          affixes.push(affix);
        }
      }

      return {
        name: scalars.name!.getLeading(),
        rarity: scalars.rarity!.getLeading(),
        slot: scalars.slot!.getLeading(),
        itemPower: leadingNumber("itemPower"),
        primary,
        requiresLevel: leadingNumber("requiresLevel"),
        sellValue: leadingNumber("sellValue"),
        affixes,
        needsScroll,
        framesSeen,
      };
    },

    reset,
  };
}
