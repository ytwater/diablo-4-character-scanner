# Character Builder — Design

**Goal:** Turn the one-shot character and item scans into a persistent,
per-user character build. Step 1: enter name and class. Step 2: scan the
character sheet, then scan each equipped item into its slot until the
build is complete. Render the character as a Diablo 4-style paper doll
with in-game-looking item tooltips. Users can re-scan any item or the
character header, or edit name/level/paragon/title by hand.

Builds on `2026-09-22-item-scanning-design.md` (single-item capture) and
the character-panel scan from the earlier OCR phases.

## Decisions

| Question | Decision |
| --- | --- |
| Persistence | Server: Cloudflare Workers + D1 via Drizzle/oRPC |
| Ownership | Signed-in user (Google via better-auth); owner-only access |
| Item → slot | User taps a slot, then scans; "Next empty slot" shortcut |
| Item structure | Classify each line by kind; keep raw text, no value parsing |
| Photos | Not stored. Text only |
| Character portrait | Deferred; class silhouette for now, `portraitKey` reserved for R2 later |
| Before save | Preview → Save / Retake. No item text editing |
| Storage shape | `character` + `item` tables; item lines as a JSON column |
| Level range | 1–70, plus paragon (only at level 70) |

## Screens and flow

- **`/` — My Characters.** List of the user's characters (class icon,
  name, level/paragon, "7/11 slots") and **+ New Character**. Signed out:
  a Google sign-in prompt instead. Replaces the template's Posts screen.
- **`/character/new` — Step 1.** Name field and class picker (class tile
  grid). **Create** makes the character on the server and goes to it.
- **`/character/[id]` — the character screen.**
  - Header: name, "Level 42 · Title" or "Level 70 · Paragon 93 · Title",
    class. Tap to edit by hand or choose **Scan character sheet**.
  - Paper doll: class silhouette centered, slots arranged as in-game
    (armor left, jewelry and weapons right). Empty slots are outlined;
    filled slots show a rarity-colored frame and short name.
  - Tap a filled slot → the item tooltip with **Re-scan** / **Remove**.
    Tap an empty slot → go straight to scanning.
  - **Next empty slot** button.
  - After Create, a banner suggests scanning the character sheet. Step 2
    is a suggestion, not a required step.
- **`/character/[id]/scan?target=header|<slot>` — capture.** Reuses the
  `useScan` camera shell. `header` uses character mode with the ROI;
  a slot uses item mode. After capture, a preview (header fields or the
  rendered tooltip) with **Save** / **Retake**. Save sends it to the
  server and returns to the character screen.

Re-scanning the header replaces the fields it read. Fields it failed to
read keep their existing values. Class cannot change once items exist.

`/scan` stays as a developer screen.

## Level and paragon

- `level`: integer 1–70. `paragon`: integer ≥ 0, nullable, only allowed
  when `level === 70`. Below 70 it is hidden and stored as null.
- The character sheet badge shows character level below 70 and paragon
  level at 70, so one number is ambiguous. `interpretBadge(n, current)`
  resolves a badge value `n`:
  1. Stored character already level 70 → `paragon = n` (levels never go
     down).
  2. `n > 70` → `level = 70`, `paragon = n`.
  3. `n ≤ 70`, not yet 70 → `level = n`, flagged ambiguous. The preview
     shows a **"Max level — treat as Paragon n"** toggle, off by default.
- Manual editing always works as the fallback.

## Data model (`packages/db/src/schema.ts`)

Replaces `Post`.

- **`character`**: `id`, `userId` (foreign key to the better-auth `user`
  table, deleted along with the user), `name`, `class` (enum), `level`
  (1–70), `paragon` (nullable), `title` (nullable), `portraitKey`
  (nullable, unused for now), `createdAt`, `updatedAt`.
- **`item`**: `id`, `characterId` (foreign key, deleted along with the
  character), `slot` (enum), `name`, `rarity` (nullable enum), `typeLine`
  (nullable), `lines` (JSON text: `{ kind, text }[]`), `scannedAt`.
  **Unique index on `(characterId, slot)`.**

Line kinds: `itemPower`, `armor`, `dps`, `implicit`, `affix`, `greater`,
`tempered`, `aspect`, `socket`, `other`.

**Class → slots** lives in `packages/validators` and is shared by server
and app, together with a per-class paper-doll layout map. Classes:
Barbarian, Druid, Necromancer, Rogue, Sorcerer, Spiritborn, Paladin. Each
class has the armor and jewelry slots (helm, chest, gloves, pants, boots,
amulet, ring1, ring2) plus its own weapon slots. Barbarian, for example,
has two-hand bludgeoning, two-hand slashing, and dual-wield ×2. Check the
weapon slots against the game before building on them.

## API (`packages/api/src/router/character.ts`)

Every procedure uses `protectedProcedure` and checks that the caller owns
the character. Someone else's character returns NOT_FOUND.

- `list` — the user's characters with filled-slot counts
- `byId` — the character plus all items
- `create({ name, class })`
- `update({ id, name?, level?, paragon?, title? })` — shared by manual
  edits and header re-scans. Enforces the paragon ↔ level-70 rule.
- `delete({ id })`
- `upsertItem({ characterId, slot, ...item })` —
  `INSERT … ON CONFLICT(characterId, slot) DO UPDATE`. Rejects slots that
  aren't valid for the class (BAD_REQUEST).
- `removeItem({ characterId, slot })`

The Post router, schema and UI are deleted, and one new Drizzle migration
is generated.

## Scanning changes

The native module already returns a color for each block, so no Kotlin
changes are needed.

- **`scanner/interpretBadge.ts`** — the rule above. `/scan` switches to
  using it.
- **`scanner/classifyLines.ts`** (pure) — takes the blocks between the
  type line and the "Requires Level" footer (already isolated by
  `extractItemFields`) and tags them, checking rules in this order:
  - `itemPower`: `/item power/i`
  - `armor`: `/^\d[\d,]* armor$/i`
  - `dps`: `/damage per second/i` or a weapon-damage range
  - `socket`: `/empty socket/i` or a gem stat line in socket position
  - `aspect`: block color near the orange aspect/unique color (new
    `itemConfig.aspectColor`, same distance logic as `rarity.ts`).
    Consecutive aspect blocks merge into one paragraph.
  - `implicit`: affix-like lines above the largest vertical gap (the
    divider, which ML Kit doesn't report), with a tunable threshold in
    `itemConfig`
  - `affix`: lines starting with `+`, a digit, or `%`
  - `other`: fallback
  - `greater` / `tempered` are reserved kinds that version 1 never
    outputs, because they're marked by icons, not text.
- **`useScan` shapes:** item → `{ name, rarity, typeLine, lines }`;
  character → `{ name, title, level, paragon, badgeAmbiguous }`.
- Color and gap thresholds are placeholders. Plan one on-device tuning
  pass (a weapon, armor, jewelry and a unique) and add item OCR fixtures
  from `temp-items/`.

## Game-style rendering

- **`features/character/theme.ts`** — near-black background, parchment
  text, bronze frame, rarity colors taken from `itemConfig.rarityColors`.
  Apply **text and border colors with inline `style`** (NativeWind
  quirk); layout stays in className.
- **Fonts** via `expo-font`: a free serif display font (e.g. Cinzel) and
  a readable body font (e.g. Alegreya Sans). No Blizzard fonts or art.
- **`<ItemTooltip item>`** — rarity-colored top border and gradient
  header; name and type line in the rarity color; stat row for
  itemPower/armor/dps; implicits, a divider, then ◆ affixes; aspect in
  orange italic below a divider; sockets as hollow diamonds; icons for
  greater/tempered; `other` as plain text.
- **`<PaperDoll class items onSlotPress>`** — original SVG class
  silhouette in the center; slot tiles positioned by the layout map, with
  rarity-colored borders; scales to phone width with no horizontal
  scroll.
- **`<CharacterHeader>`** — name, level/paragon, title, and an edit
  pencil.

## Error handling

- A failed save keeps the preview on screen with a toast and Retry, so
  the scan isn't lost.
- A failed `byId` load shows a retry state.
- Signed out on a character route → back to `/`, which shows sign-in.
- A slot the class doesn't allow → server returns BAD_REQUEST. The app
  never sends one.
- An empty OCR result → preview says "Couldn't read this item" and offers
  only Retake.

## Testing

- **Unit (Jest):** `interpretBadge` (all three cases), `classifyLines`
  against item fixtures, `CLASS_SLOTS` ↔ layout consistency.
- **API:** procedures against local D1/Miniflare or in-memory SQLite:
  owner checks, invalid slot, re-scan upsert, the paragon rule, cascade
  deletes.
- **Component:** `<ItemTooltip>` for each line kind, and `<PaperDoll>`
  empty vs. filled.
- **Manual on the device:** create → header scan → all slots → re-scan a
  slot; the tuning pass.

## Risks

1. Google sign-in has not been tested on the device. Check it first.
2. The per-class weapon slot list needs checking against the game.
3. Line classification depends on uncalibrated thresholds. Anything
   misclassified falls back to `other`, which looks worse but loses no
   data.

## Build order

1. Check that auth works; remove Posts
2. Shared constants: classes, slots, layouts, line kinds
3. Schema, migration, character router, with tests
4. My Characters, `/character/new`, bare character screen with manual
   header edit
5. `interpretBadge`, header scan with preview
6. `classifyLines`, item scan, preview, `upsertItem`
7. `<ItemTooltip>`, `<PaperDoll>`, fonts, silhouettes
8. On-device tuning pass

## Out of scope

Portrait capture/R2, editing item text, greater/tempered icon detection,
stat/value parsing, sharing, character stats beyond level/paragon/title.
