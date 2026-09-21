import type { OcrBlock } from "./anchor";

export interface FieldCandidates {
  level?: OcrBlock;
  title?: OcrBlock;
  name?: OcrBlock;
}

export function extractFields(blocks: OcrBlock[], anchor: OcrBlock): FieldCandidates {
  const below = blocks
    .filter((b) => b !== anchor && b.frame.y > anchor.frame.y + anchor.frame.height)
    .sort((a, b) => a.frame.y - b.frame.y);

  const level = below.find((b) => /\d{1,3}/.test(b.text.trim()));
  const remaining = below.filter((b) => b !== level);
  const [name, title] = remaining;

  return { level, name, title };
}
