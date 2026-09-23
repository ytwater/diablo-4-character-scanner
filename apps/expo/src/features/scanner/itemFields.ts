import type { OcrBlock } from "./anchor";

export interface ItemFieldCandidates {
  name?: OcrBlock;
  type?: OcrBlock;
  affixes: string[];
}

export function extractItemFields(blocks: OcrBlock[]): ItemFieldCandidates {
  const sorted = [...blocks].sort((a, b) => a.frame.y - b.frame.y);
  const [name, type, ...rest] = sorted;

  return {
    name,
    type,
    affixes: rest.map((b) => b.text),
  };
}
