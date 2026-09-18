# Character Profile: Manual Name and Class Entry — Design

**Status:** designed, not implemented
**Branch:** `spike/d4-ocr-phase0`

## Why

Phase 0–2 established what the scanner can and cannot read from a Diablo 4
character sheet:

| Field | Reliability | Source |
| --- | --- | --- |
| Name | 93% (14/14 photos containing it) | Phase 0, re-confirmed 2026-09-18 |
| Title | 93% | Phase 0 |
| Level | 40% | Phase 0 — badge glyph, see below |
| Class | **0%** | Not rendered on the sheet at all |

Class is the blocker. Across all 15 character-sheet photos, OCR returned zero
class-name occurrences, because Diablo 4's character sheet never displays the
class as text. Item tooltips mention it only incidentally — 2 of 4 captured
tooltips contained "Spiritborn", purely because that item's aspect text names
the class. That is not a signal to build on.

The stat block is the one real class signal on the sheet, and it reads well
(all four stat labels on 14/15 photos). Dominant stat identifies Barbarian
(Strength) and Druid (Willpower) uniquely, but only narrows Intelligence to
{Necromancer, Sorcerer} and Dexterity to {Rogue, Spiritborn}. It is inference,
not reading, and a build stacking an off-class stat would mislead it.

**Decision: the user enters name and class, and can correct them at any time.**
This also sidesteps the item-parser name-ordering bug for the character flow.

## Scope

Single active character now. The record shape anticipates the eventual backend
with multiple characters, but none of that is built.

**Not building** (YAGNI): multi-character list, backend sync, class inference
from stats, storage migration.

## Data model

```ts
// src/features/character/types.ts
export const D4_CLASSES = ["Barbarian", "Druid", "Necromancer",
                           "Rogue", "Sorcerer", "Spiritborn"] as const;
export type D4Class = (typeof D4_CLASSES)[number];

export interface Character {
  id: string;         // uuid — so multi-character needs no migration later
  name: string;
  class: D4Class;
  title?: string;     // optional, manual — no longer scanned
  level?: number;     // scanned, best-effort
  updatedAt: string;  // ISO — lets a future backend sync resolve conflicts
}
```

`id` and `updatedAt` cost nothing now and mean the record doesn't change shape
when it moves to the backend.

## Storage

```ts
export interface CharacterRepository {
  getActive(): Promise<Character | null>;
  save(c: Character): Promise<void>;
  clear(): Promise<void>;
}
```

One implementation now: `secureStoreRepository`, a single JSON blob under
`d4.character.active`.

**Why SecureStore, despite the profile not being a secret:** it is the only
storage module installed, it is already autolinked into the built APK, and
`@better-auth/expo` already depends on it. Every alternative (AsyncStorage,
MMKV, expo-file-system, expo-sqlite) is a new native module requiring
`expo prebuild` plus a full Gradle rebuild and reinstall. The profile is far
under SecureStore's 2048-byte Android value limit. The repository interface
makes swapping later a new ~20-line file with no caller changes.

A `useCharacter()` hook wraps it: `{ character, isLoading, save, clear }`.
`isLoading` matters — SecureStore is async and the scan screen must not flash
the setup form before a stored profile resolves.

## Scan screen

Three states from `useCharacter()`:

1. `isLoading` → spinner
2. `character == null` → `<CharacterSetup />`, camera **not mounted**
3. otherwise → header chip + camera

Not mounting the camera during setup avoids holding it while a keyboard is up,
and sidesteps the buffer-pool pressure documented in Phase 2's perf work.

**Voters:** `nameVoter` and `titleVoter` removed; `levelVoter` kept.
`extractFields` keeps returning all three — it is one geometric pass and
name/title cost nothing extra — the screen simply stops voting on them. This
leaves a future scanned-vs-typed cross-check available without resurrecting
deleted code.

**Level write-back**, guarded so a locked level doesn't rewrite storage every
frame:

```ts
if (locked != null && locked !== String(character.level)) {
  void save({ ...character, level: Number(locked),
              updatedAt: new Date().toISOString() });
}
```

Level stays best-effort. At 40% it often won't lock, and that is normal, not an
error state.

**Header chip** — name on its own line, because D4 names can be long and
`UDAN` is a misleadingly short test case:

```
┌────────────────────────────┐
│ Thornwyn the Undying     ✎ │  name, numberOfLines={1}, tail ellipsis
│ Spiritborn · Lv 93         │  secondary; level omitted when unset
└────────────────────────────┘
```

Ellipsizing keeps a long name from pushing the edit affordance off-screen or
wrapping the chip to three lines. Tapping opens `CharacterSetup` prefilled in
edit mode, which also offers "Clear character".

Item-mode scanning is untouched.

## Error handling

- SecureStore throws (keystore unavailable, corrupt value) → `getActive()`
  catches, logs, returns `null`; the user sees setup rather than a crash.
- Failed `save()` surfaces inline ("Couldn't save — try again") and keeps the
  form open. Input is never silently discarded.
- A blob failing `JSON.parse` or class validation is treated as absent.
- Name trimmed, rejected if empty, capped at 64 chars.
- Class validated against `D4_CLASSES` on read as well as write.

## Testing

All unit-testable without a device:

- `repository.test.ts` — round-trip; corrupt JSON → `null`; throwing
  SecureStore → `null`; unknown class rejected
- `character.test.ts` — validation rules; `updatedAt` advances on save
- Level write-back extracted as a pure `nextCharacterFromLock(character,
  locked)` returning `Character | null`, so the write-only-when-changed rule is
  tested without rendering the screen

`voting.test.ts` and `fields.test.ts` are unaffected — removing the name/title
voters does not touch `extractFields`.

## Open item, unrelated but adjacent

`parseItem` fails to extract item names from real photo captures (0/4). ML Kit
block ordering is not stable: every real capture orders
rarity → name → EQUIPPED, while the single fixture the parser was written
against orders EQUIPPED → name → rarity, so the guard
`rarityLine.index > equippedIndex + 1` never holds. Deprioritised for the
character flow, which no longer depends on scanned names, but it still affects
item scanning.

## Character profile: device verification

Verified on a Pixel 10 Pro via the Metro dev client (2026-09-18).

| # | Check | Result |
| --- | --- | --- |
| 1 | Fresh install, open Scan → setup form, no camera preview | **Pass** |
| 2 | "Start scanning" disabled until name typed and class picked | **Pass** |
| 3 | Long name (`Thornwyn the Undying Scourge of Hatred`) → chip shows it on its own line, ellipsized, edit glyph still visible | **Pass** |
| 4 | Reopen app → profile persists, camera opens directly, no setup-form flash | **Pass** |
| 5 | Tap chip → prefilled edit form → Cancel returns unchanged | **Pass** |
| 6 | Point at character sheet → Level locks | **Did not lock** — expected. Mode detection worked (label read "Character sheet"), so the anchor and `extractFields` pipeline ran; the level vote never reached 3-of-8 consensus. Matches Phase 0's measured 40% level accuracy and `scannerConfig`'s own comment that level is best-effort. Not a regression. |
| 7 | Reopen → locked level persisted | N/A — no level locked in this session to persist |
| 8 | Tap chip → "Clear character" → setup form returns | **Pass**, after a fix (below) |

### Two bugs found and fixed during verification

1. **Camera permission requested before any profile existed.** The
   permission-request effect had no gate on `character`, and React hooks run
   on every render regardless of which branch is returned — so opening Scan
   for the first time prompted for camera access while the setup form was
   still meant to be showing, contradicting the design's "camera not
   mounted during setup." Fixed by gating the effect on `character != null
   && !isEditing`.
2. **"Clear character" left the old name and class showing.** Editing and
   clearing both render the same branch (`character == null || isEditing`),
   so `CharacterSetup` was never unmounted between them, and its
   `useState(existing?.name ?? "")` initializer — which only runs on mount —
   never re-ran. Fixed with `key={character?.id ?? "new"}` on
   `CharacterSetup`, forcing a fresh instance whenever the underlying
   character's identity changes.

Both confirmed fixed by repeating the failing sequence after the fix.

### Not covered

Level write-back persistence (step 7) needs a session where the level
actually locks, which a live handheld camera didn't reliably produce here.
Given Phase 0's 40% baseline, that would need either a steadier capture (a
tripod, or the anchor-located ROI cropping noted as Phase 1 follow-up) or
accepting that manual level entry may be worth adding alongside the scan,
matching the same reasoning that led to manual name and class entry.
