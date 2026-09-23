import { z } from "zod/v4";

export const ScanModeSchema = z.enum(["character", "item"]);
export type ScanMode = z.infer<typeof ScanModeSchema>;

export const CharacterCandidatesSchema = z.object({
  level: z.string().optional(),
  title: z.string().optional(),
  name: z.string().optional(),
});
export type CharacterCandidates = z.infer<typeof CharacterCandidatesSchema>;

export const ItemCandidatesSchema = z.object({
  name: z.string().optional(),
  type: z.string().optional(),
  rarity: z.string().optional(),
  affixes: z.array(z.string()).default([]),
});
export type ItemCandidates = z.infer<typeof ItemCandidatesSchema>;
