# Item Scanning — Design

**Goal:** Add an "Item" mode to the existing `/scan` screen that captures a
single Diablo 4 item tooltip and extracts: item name, rarity (via color
sampling), item type/slot, and a raw affix list — displayed the same way
the character scan displays its fields. This is the first time item
scanning has been scoped; it was explicitly out-of-scope for every prior
OCR phase and for the capture-based-scan pivot
(`docs/plans/2026-09-21-d4-capture-based-scan-design.md`).

The eventual goal (not built here) is scanning every equipped item on a
character, one at a time. This design builds the single-item capture
primitive only — sequencing through slots is a future UI concern.

No persistence, no multi-item/inventory-grid parsing, no structured affix
parsing (stat name + numeric value) — matches this project's established
"OCR + minimal geometric heuristics, display-only" philosophy.

## What's reused as-is

- `D4OcrRecognizer.recognize()` — same ML Kit call, no change.
- The capture UI shell in `scan.tsx` — camera preview, Take Picture →
  captured still + spinner → results/error + Retake. Item mode reuses
  this shell via a mode toggle.
- The `idle/capturing/processing/done/error` status shape, generalized
  into a shared hook both modes use.

## What's new

**UI (`scan.tsx`):** a segmented "Character" / "Item" toggle shown in the
`idle` state, above or below the Take Picture button. No ROI box is drawn
in item mode (see below), so the toggle also controls whether the ROI
guide box renders. The results panel branches on mode: the existing
3-field character view, or a new name/rarity/type/affix-list view for
items.

**No ROI crop for item mode.** Item tooltips appear wherever the user is
hovering/inspecting, unlike the character panel's fixed position. Item
mode runs full-frame OCR and lets block-position heuristics locate the
tooltip content, rather than requiring the user to align a moving tooltip
into a fixed on-screen box.

**`apps/expo/src/features/scanner/itemFields.ts`** (new, sibling to
`fields.ts`): pure function `extractItemFields(blocks: OcrBlock[])`:
1. Sort all blocks by `frame.y` ascending.
2. `name = blocks[0]` (topmost block = item name — tooltips place the
   name first; no fixed anchor text to match against, unlike
   `"CHARACTER"`).
3. `type = blocks[1]` (slot/type line, e.g. "Head", "Helm").
4. `affixes = blocks.slice(2).map(b => b.text)` — every remaining block,
   in on-screen order, as raw strings. No parsing into stat name/value.

Known risk, not solved here: gear categories differ in tooltip layout
(weapons show a DPS line, armor shows an Armor value, jewelry has
neither), so "type is the block right below the name" may not hold
uniformly. Expect an on-device tuning pass per category, the same kind
Phase 3 did for the character panel — this design ships the heuristic
and defers calibration to that pass.

**`apps/expo/src/features/scanner/config.ts`**: add an `itemConfig`
block (no ROI, since item mode doesn't crop):

```ts
itemConfig: {
  // Approximate Diablo 4 rarity text colors - placeholder values,
  // needs on-device calibration against real captures.
  rarityColors: {
    common: "#c8c8c8",
    magic: "#5bb0f5",
    rare: "#f5e14a",
    legendary: "#f59b42",
    unique: "#c9a86a",
  },
  // Max Euclidean RGB distance to accept a color match.
  rarityColorThreshold: 40,
}
```

**`apps/expo/src/features/scanner/rarity.ts`** (new): pure function
`classifyRarity(rgb: { r: number; g: number; b: number }): string |
undefined` — finds the closest entry in `itemConfig.rarityColors` within
`rarityColorThreshold`, else `undefined`. Unit-testable in isolation from
any native/OCR code.

**`D4OcrModule.kt`**: extend `recognizeImage` to accept a `mode` param
(`"character" | "item"`, or equivalently an `roi: RoiRecord?` that's
`null`/omitted for item mode meaning "don't crop"). When no crop is
requested, run recognition on the full upright (EXIF-rotated) bitmap.
Additionally, always compute and return an average RGB sample from the
topmost returned block's bounding box (cheap - only relevant for item
mode, harmless to compute unconditionally) so JS can classify rarity
without shipping raw pixel data across the bridge. Response shape gains
one field: `{ blocks, width, height, topBlockColor: { r, g, b } }`.

**`useCharacterScan.ts` → generalized**: add a `mode` parameter,
branching only at the two points that differ (whether to pass an ROI to
`recognizeImage`, and which field-extraction function to call), keeping
the capture/retake/status plumbing shared rather than duplicated into a
second hook.

## Data flow (item mode)

1. User taps "Item" toggle in idle state (no ROI box shown).
2. User hovers/inspects an item in-game, aligns the tooltip on screen,
   taps **Take Picture**.
3. `takePhoto()` → `D4Ocr.recognizeImage(photo.path, null)` (no crop,
   full-frame recognition) → `{ blocks, topBlockColor }`.
4. JS runs `extractItemFields(blocks)` for name/type/affixes, and
   `classifyRarity(topBlockColor)` for rarity.
5. `status: "done"`, results shown: name, rarity-colored label, type,
   affix list. Missing fields show `—`; empty affix list shows nothing
   (not an error).
6. **Retake** discards the photo and returns to `idle`, toggle state
   preserved.

## Error handling

- `takePhoto()`/`recognizeImage()` throwing → `status: "error"`, same
  Retake recovery as character mode.
- No blocks found at all → not an error: empty fields, `status: "done"`.
- Rarity color sampling inconclusive (no color within threshold) →
  `rarity: undefined`, shown as `—`, not an error.

## Testing

- `itemFields.test.ts` (new): pure unit tests against fixture block
  arrays — topmost-as-name, next-as-type, remainder-as-affixes. No
  camera/OCR involved.
- `rarity.test.ts` (new): `classifyRarity` against known hex inputs,
  once the color table is calibrated on-device.
- Native color sampling in `D4OcrModule.kt`: on-device only to verify,
  same as the rest of the native pipeline.
- No existing fixtures cover item tooltips (unlike the character panel's
  Phase 0 fixtures). First on-device pass needs real tooltip captures
  across a few gear categories (weapon, armor, jewelry) to validate the
  layout heuristic and calibrate rarity colors/threshold.

## Out of scope

- Persistence/export of scanned items.
- Inventory-grid or multi-item batch scanning.
- Structured affix parsing (stat name + numeric value) — raw text lines
  only.
- A "scan all slots" guided flow — this design builds the single-item
  capture primitive; sequencing through a character's slots is future
  work.
- iOS (matches every prior phase's stance — Android only, iOS untested).
