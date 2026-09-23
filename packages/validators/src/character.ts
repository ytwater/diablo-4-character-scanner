import { z } from "zod/v4";

export const CharacterClassSchema = z.enum([
  "barbarian",
  "druid",
  "necromancer",
  "rogue",
  "sorcerer",
  "spiritborn",
  "paladin",
]);
export type CharacterClass = z.infer<typeof CharacterClassSchema>;

// Slots every class shares.
const ARMOR_AND_JEWELRY_SLOTS = [
  "helm",
  "chest",
  "gloves",
  "pants",
  "boots",
  "amulet",
  "ring1",
  "ring2",
] as const;

// Per-class weapon slots — VERIFY AGAINST THE GAME (design doc Risk 2)
// before building anything that depends on exact slot names.
const WEAPON_SLOTS: Record<CharacterClass, readonly string[]> = {
  barbarian: [
    "twoHandBludgeoning",
    "twoHandSlashing",
    "dualWield1",
    "dualWield2",
  ],
  druid: ["twoHandBludgeoning", "twoHandSlashing", "offHandFocus"],
  necromancer: ["twoHandScythe", "sword", "offHandFocus"],
  rogue: ["bow", "crossbow", "dualWield1", "dualWield2"],
  sorcerer: ["wand", "offHandFocus"],
  spiritborn: ["weaponGloves", "polearm"],
  paladin: ["oneHand", "shield"],
} as const;

export const ItemSlotSchema = z.enum([
  ...ARMOR_AND_JEWELRY_SLOTS,
  ...new Set(Object.values(WEAPON_SLOTS).flat()),
] as [string, ...string[]]);
export type ItemSlot = z.infer<typeof ItemSlotSchema>;

/** All valid slots for a class, in paper-doll display order. */
export function slotsForClass(cls: CharacterClass): ItemSlot[] {
  return [...ARMOR_AND_JEWELRY_SLOTS, ...WEAPON_SLOTS[cls]] as ItemSlot[];
}

export const ItemRaritySchema = z.enum([
  "common",
  "magic",
  "rare",
  "legendary",
  "unique",
]);
export type ItemRarity = z.infer<typeof ItemRaritySchema>;

export const ItemLineKindSchema = z.enum([
  "itemPower",
  "armor",
  "dps",
  "implicit",
  "affix",
  "greater",
  "tempered",
  "aspect",
  "socket",
  "other",
]);
export type ItemLineKind = z.infer<typeof ItemLineKindSchema>;

export const ItemLineSchema = z.object({
  kind: ItemLineKindSchema,
  text: z.string(),
});
export type ItemLine = z.infer<typeof ItemLineSchema>;
