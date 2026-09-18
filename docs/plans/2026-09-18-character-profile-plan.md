# Character Profile Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let the user type their character's name and class, stored on the
device and editable at any time, and stop scanning the name and title.

**Architecture:** A `Character` record behind a `CharacterRepository` interface
with one SecureStore-backed implementation. The scan screen gates on the stored
profile: no profile means a setup form and no camera; a profile means a header
chip plus the camera. The level voter survives and writes its locked value back
to the record; the name and title voters are deleted.

**Tech Stack:** Expo Router, React Native, `expo-secure-store`, Vitest.

Design reference: `docs/plans/2026-09-18-character-profile-design.md`

---

## Conventions this codebase uses

Read these before starting; they are not obvious from the file tree.

- Tests are Vitest, colocated as `<name>.test.ts` beside the source. There is
  no `vitest.config.*` — config lives in `package.json`. Run everything with
  `pnpm vitest run` from `apps/expo`, or one file with
  `pnpm vitest run src/features/scanner/voting.test.ts`.
- **There is no React testing library installed.** Do not write component
  render tests — they cannot run. Push logic into pure functions and test
  those; verify UI on the device in Task 8.
- `pnpm lint` and `pnpm typecheck` both **fail on `main` already** (55 lint
  errors, plus a `D1Database` type error in `packages/db`). That is
  pre-existing. Check you have not *added* failures by comparing counts before
  and after; do not try to fix the existing ones in this plan.
- Styling is a `StyleSheet.create` block at the bottom of the file, dark theme,
  `color: "white"` on black. Match it; do not introduce NativeWind classes into
  `scan.tsx`, which does not use them.

---

### Task 1: The Character type and its validation

**Files:**
- Create: `apps/expo/src/features/character/types.ts`
- Create: `apps/expo/src/features/character/types.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";

import { createCharacter, isD4Class, parseCharacter } from "./types";

describe("isD4Class", () => {
  it("accepts a known class", () => {
    expect(isD4Class("Spiritborn")).toBe(true);
  });

  it("rejects an unknown or wrongly-cased class", () => {
    expect(isD4Class("Paladin")).toBe(false);
    expect(isD4Class("spiritborn")).toBe(false);
  });
});

describe("createCharacter", () => {
  it("trims the name and stamps id and updatedAt", () => {
    const c = createCharacter({ name: "  UDAN  ", class: "Spiritborn" });
    expect(c.name).toBe("UDAN");
    expect(c.id).toMatch(/.+/);
    expect(Date.parse(c.updatedAt)).not.toBeNaN();
  });

  it("rejects an empty or whitespace-only name", () => {
    expect(() => createCharacter({ name: "   ", class: "Rogue" })).toThrow();
  });

  it("caps an overlong name at 64 characters", () => {
    const c = createCharacter({ name: "x".repeat(100), class: "Rogue" });
    expect(c.name).toHaveLength(64);
  });
});

describe("parseCharacter", () => {
  it("round-trips a valid record", () => {
    const c = createCharacter({ name: "UDAN", class: "Spiritborn" });
    expect(parseCharacter(JSON.parse(JSON.stringify(c)))).toEqual(c);
  });

  it("returns null for a record with an unknown class", () => {
    expect(parseCharacter({ id: "1", name: "UDAN", class: "Paladin", updatedAt: "x" })).toBeNull();
  });

  it("returns null for a non-object or missing name", () => {
    expect(parseCharacter(null)).toBeNull();
    expect(parseCharacter({ id: "1", class: "Rogue" })).toBeNull();
  });
});
```

**Step 2: Run it and watch it fail**

Run: `cd apps/expo && pnpm vitest run src/features/character/types.test.ts`
Expected: FAIL — cannot resolve `./types`.

**Step 3: Implement**

```ts
export const D4_CLASSES = [
  "Barbarian",
  "Druid",
  "Necromancer",
  "Rogue",
  "Sorcerer",
  "Spiritborn",
] as const;

export type D4Class = (typeof D4_CLASSES)[number];

export const MAX_NAME_LENGTH = 64;

export interface Character {
  id: string;
  name: string;
  class: D4Class;
  title?: string;
  level?: number;
  updatedAt: string;
}

export function isD4Class(value: unknown): value is D4Class {
  return typeof value === "string" && (D4_CLASSES as readonly string[]).includes(value);
}

/**
 * Hermes has no crypto.randomUUID, and pulling in expo-crypto would mean a new
 * native module and a full rebuild. Uniqueness only has to hold within one
 * device's stored characters, so this is sufficient.
 */
function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createCharacter(input: {
  name: string;
  class: D4Class;
  title?: string;
  level?: number;
}): Character {
  const name = input.name.trim().slice(0, MAX_NAME_LENGTH);
  if (name.length === 0) throw new Error("Character name is required");

  return {
    id: newId(),
    name,
    class: input.class,
    title: input.title?.trim() || undefined,
    level: input.level,
    updatedAt: new Date().toISOString(),
  };
}

export function parseCharacter(value: unknown): Character | null {
  if (typeof value !== "object" || value == null) return null;
  const c = value as Record<string, unknown>;

  if (typeof c.id !== "string" || c.id.length === 0) return null;
  if (typeof c.name !== "string" || c.name.trim().length === 0) return null;
  if (!isD4Class(c.class)) return null;
  if (typeof c.updatedAt !== "string") return null;

  return {
    id: c.id,
    name: c.name,
    class: c.class,
    title: typeof c.title === "string" ? c.title : undefined,
    level: typeof c.level === "number" ? c.level : undefined,
    updatedAt: c.updatedAt,
  };
}
```

**Step 4: Run and confirm green**

Run: `pnpm vitest run src/features/character/types.test.ts`
Expected: PASS, 8 tests.

**Step 5: Commit**

```bash
git add apps/expo/src/features/character/types.ts apps/expo/src/features/character/types.test.ts
git commit -m "feat: add Character type with validation"
```

---

### Task 2: The SecureStore repository

**Files:**
- Create: `apps/expo/src/features/character/repository.ts`
- Create: `apps/expo/src/features/character/repository.test.ts`

**Step 1: Write the failing test**

`expo-secure-store` is a native module and cannot run under Vitest, so mock it.

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async (k: string) => store.get(k) ?? null),
  setItemAsync: vi.fn(async (k: string, v: string) => void store.set(k, v)),
  deleteItemAsync: vi.fn(async (k: string) => void store.delete(k)),
}));

const SecureStore = await import("expo-secure-store");
const { secureStoreRepository, CHARACTER_KEY } = await import("./repository");
const { createCharacter } = await import("./types");

describe("secureStoreRepository", () => {
  beforeEach(() => {
    store.clear();
    vi.clearAllMocks();
  });

  it("returns null when nothing is stored", async () => {
    expect(await secureStoreRepository.getActive()).toBeNull();
  });

  it("round-trips a saved character", async () => {
    const c = createCharacter({ name: "UDAN", class: "Spiritborn" });
    await secureStoreRepository.save(c);
    expect(await secureStoreRepository.getActive()).toEqual(c);
  });

  it("returns null when the stored value is not valid JSON", async () => {
    store.set(CHARACTER_KEY, "{not json");
    expect(await secureStoreRepository.getActive()).toBeNull();
  });

  it("returns null when the stored record fails validation", async () => {
    store.set(CHARACTER_KEY, JSON.stringify({ id: "1", name: "UDAN", class: "Paladin" }));
    expect(await secureStoreRepository.getActive()).toBeNull();
  });

  it("returns null rather than throwing when SecureStore fails", async () => {
    vi.mocked(SecureStore.getItemAsync).mockRejectedValueOnce(new Error("keystore unavailable"));
    expect(await secureStoreRepository.getActive()).toBeNull();
  });

  it("propagates a save failure so the form can surface it", async () => {
    vi.mocked(SecureStore.setItemAsync).mockRejectedValueOnce(new Error("disk full"));
    const c = createCharacter({ name: "UDAN", class: "Rogue" });
    await expect(secureStoreRepository.save(c)).rejects.toThrow();
  });

  it("clears the stored character", async () => {
    await secureStoreRepository.save(createCharacter({ name: "UDAN", class: "Rogue" }));
    await secureStoreRepository.clear();
    expect(await secureStoreRepository.getActive()).toBeNull();
  });
});
```

Note the asymmetry, and keep it: a **read** failure degrades to `null` because
showing the setup form is a reasonable fallback, while a **write** failure
throws so the form can tell the user their input was not saved.

**Step 2: Run it and watch it fail**

Run: `pnpm vitest run src/features/character/repository.test.ts`
Expected: FAIL — cannot resolve `./repository`.

**Step 3: Implement**

```ts
import * as SecureStore from "expo-secure-store";

import type { Character } from "./types";
import { parseCharacter } from "./types";

export const CHARACTER_KEY = "d4.character.active";

export interface CharacterRepository {
  getActive(): Promise<Character | null>;
  save(character: Character): Promise<void>;
  clear(): Promise<void>;
}

/**
 * SecureStore is used for convenience, not secrecy: it is the only storage
 * module already autolinked into the build. Swapping to AsyncStorage later
 * means a new file implementing this interface and nothing else.
 */
export const secureStoreRepository: CharacterRepository = {
  async getActive() {
    try {
      const raw = await SecureStore.getItemAsync(CHARACTER_KEY);
      if (raw == null) return null;
      return parseCharacter(JSON.parse(raw));
    } catch {
      // A corrupt or unreadable profile is treated as absent; the user sees
      // the setup form rather than a crash.
      return null;
    }
  },

  async save(character) {
    await SecureStore.setItemAsync(CHARACTER_KEY, JSON.stringify(character));
  },

  async clear() {
    await SecureStore.deleteItemAsync(CHARACTER_KEY);
  },
};
```

**Step 4: Run and confirm green**

Run: `pnpm vitest run src/features/character/repository.test.ts`
Expected: PASS, 7 tests.

**Step 5: Commit**

```bash
git add apps/expo/src/features/character/repository.ts apps/expo/src/features/character/repository.test.ts
git commit -m "feat: add SecureStore-backed character repository"
```

---

### Task 3: The level write-back rule

Pure function so the "only write when the level actually changed" rule is
testable without rendering the scan screen.

**Files:**
- Create: `apps/expo/src/features/character/level-writeback.ts`
- Create: `apps/expo/src/features/character/level-writeback.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";

import { nextCharacterFromLock } from "./level-writeback";
import { createCharacter } from "./types";

const base = createCharacter({ name: "UDAN", class: "Spiritborn" });

describe("nextCharacterFromLock", () => {
  it("returns an updated character when a new level locks", () => {
    const next = nextCharacterFromLock(base, "93");
    expect(next?.level).toBe(93);
  });

  it("returns null when the locked level matches what is stored", () => {
    expect(nextCharacterFromLock({ ...base, level: 93 }, "93")).toBeNull();
  });

  it("returns null when nothing has locked yet", () => {
    expect(nextCharacterFromLock(base, null)).toBeNull();
  });

  it("returns null for a non-numeric or out-of-range read", () => {
    expect(nextCharacterFromLock(base, "9E")).toBeNull();
    expect(nextCharacterFromLock(base, "0")).toBeNull();
    expect(nextCharacterFromLock(base, "301")).toBeNull();
  });

  it("advances updatedAt", () => {
    const next = nextCharacterFromLock({ ...base, updatedAt: "2020-01-01T00:00:00.000Z" }, "93");
    expect(next!.updatedAt > "2020-01-01T00:00:00.000Z").toBe(true);
  });
});
```

The range guard matters: Phase 0 measured level at 40%, so bad reads are the
normal case, and OCR noise like `9E` or a stray digit must not be written to
the profile.

**Step 2: Run it and watch it fail**

Run: `pnpm vitest run src/features/character/level-writeback.test.ts`
Expected: FAIL — cannot resolve `./level-writeback`.

**Step 3: Implement**

```ts
import type { Character } from "./types";

/** Diablo 4's level cap, with headroom. Anything outside this is an OCR misread. */
const MIN_LEVEL = 1;
const MAX_LEVEL = 300;

/**
 * Returns the character to save when a level locks, or null when nothing
 * should be written. Called per frame, so it must be cheap and must not
 * rewrite storage when the value has not changed.
 */
export function nextCharacterFromLock(
  character: Character,
  locked: string | null,
): Character | null {
  if (locked == null) return null;

  if (!/^\d+$/.test(locked)) return null;
  const level = Number(locked);
  if (level < MIN_LEVEL || level > MAX_LEVEL) return null;
  if (level === character.level) return null;

  return { ...character, level, updatedAt: new Date().toISOString() };
}
```

**Step 4: Run and confirm green**

Run: `pnpm vitest run src/features/character/level-writeback.test.ts`
Expected: PASS, 5 tests.

**Step 5: Commit**

```bash
git add apps/expo/src/features/character/level-writeback.ts apps/expo/src/features/character/level-writeback.test.ts
git commit -m "feat: add guarded level write-back rule"
```

---

### Task 4: The useCharacter hook

Thin glue over the repository. No test — hook testing needs a renderer that is
not installed, and there is no logic here that is not already covered by Tasks
1–3. Task 8 verifies it on the device.

**Files:**
- Create: `apps/expo/src/features/character/useCharacter.ts`

**Step 1: Implement**

```ts
import { useCallback, useEffect, useState } from "react";

import type { Character } from "./types";
import { secureStoreRepository } from "./repository";

export function useCharacter() {
  const [character, setCharacter] = useState<Character | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    void secureStoreRepository.getActive().then((stored) => {
      if (cancelled) return;
      setCharacter(stored);
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const save = useCallback(async (next: Character) => {
    // Write first: if storage rejects, the caller surfaces the error and in-
    // memory state still matches what is actually persisted.
    await secureStoreRepository.save(next);
    setCharacter(next);
  }, []);

  const clear = useCallback(async () => {
    await secureStoreRepository.clear();
    setCharacter(null);
  }, []);

  return { character, isLoading, save, clear };
}
```

**Step 2: Typecheck**

Run: `pnpm typecheck 2>&1 | grep -c "features/character"`
Expected: `0` — no new errors in this directory. (The `D1Database` error in
`packages/db` is pre-existing; ignore it.)

**Step 3: Commit**

```bash
git add apps/expo/src/features/character/useCharacter.ts
git commit -m "feat: add useCharacter hook"
```

---

### Task 5: The setup and edit form

**Files:**
- Create: `apps/expo/src/features/character/CharacterSetup.tsx`

Handles both first-time setup and editing, since the fields are identical.

**Step 1: Implement**

```tsx
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import type { Character, D4Class } from "./types";
import { createCharacter, D4_CLASSES, MAX_NAME_LENGTH } from "./types";

interface Props {
  existing: Character | null;
  onSave: (character: Character) => Promise<void>;
  onClear?: () => Promise<void>;
  onCancel?: () => void;
}

export function CharacterSetup({ existing, onSave, onClear, onCancel }: Props) {
  const [name, setName] = useState(existing?.name ?? "");
  const [klass, setKlass] = useState<D4Class | null>(existing?.class ?? null);
  const [title, setTitle] = useState(existing?.title ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const canSubmit = name.trim().length > 0 && klass != null && !isSaving;

  async function submit() {
    if (klass == null) return;
    setIsSaving(true);
    setError(null);

    try {
      // Editing keeps the existing id so a future backend sees one character
      // updated rather than a new one created.
      const next: Character = existing
        ? { ...existing, name: name.trim().slice(0, MAX_NAME_LENGTH), class: klass,
            title: title.trim() || undefined, updatedAt: new Date().toISOString() }
        : createCharacter({ name, class: klass, title });

      await onSave(next);
    } catch {
      setError("Couldn't save — try again.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>
        {existing ? "Edit character" : "Who are you playing?"}
      </Text>

      <Text style={styles.label}>Character name</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="e.g. Thornwyn the Undying"
        placeholderTextColor="rgba(255,255,255,0.35)"
        maxLength={MAX_NAME_LENGTH}
        autoCapitalize="characters"
        autoCorrect={false}
      />

      <Text style={styles.label}>Class</Text>
      {D4_CLASSES.map((c) => (
        <Pressable
          key={c}
          style={[styles.classRow, klass === c && styles.classRowSelected]}
          onPress={() => setKlass(c)}
        >
          <Text style={styles.classText}>{c}</Text>
          {klass === c && <Text style={styles.classText}>✓</Text>}
        </Pressable>
      ))}

      <Text style={styles.label}>Title (optional)</Text>
      <TextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        placeholder="e.g. Demonic Defender"
        placeholderTextColor="rgba(255,255,255,0.35)"
        autoCorrect={false}
      />

      {error != null && <Text style={styles.error}>{error}</Text>}

      <Pressable
        style={[styles.primaryButton, !canSubmit && styles.buttonDisabled]}
        disabled={!canSubmit}
        onPress={() => void submit()}
      >
        <Text style={styles.primaryButtonText}>
          {isSaving ? "Saving…" : existing ? "Save" : "Start scanning"}
        </Text>
      </Pressable>

      {onCancel != null && (
        <Pressable style={styles.secondaryButton} onPress={onCancel}>
          <Text style={styles.secondaryButtonText}>Cancel</Text>
        </Pressable>
      )}

      {onClear != null && (
        <Pressable style={styles.secondaryButton} onPress={() => void onClear()}>
          <Text style={styles.dangerText}>Clear character</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 8, backgroundColor: "black", flexGrow: 1 },
  heading: { color: "white", fontSize: 22, fontWeight: "600", marginBottom: 8 },
  label: { color: "rgba(255,255,255,0.55)", marginTop: 12 },
  input: {
    color: "white",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  classRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  classRowSelected: { borderColor: "white", backgroundColor: "rgba(255,255,255,0.08)" },
  classText: { color: "white", fontSize: 16 },
  primaryButton: {
    marginTop: 24,
    backgroundColor: "white",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryButtonText: { color: "black", fontSize: 16, fontWeight: "600" },
  buttonDisabled: { opacity: 0.35 },
  secondaryButton: { marginTop: 12, paddingVertical: 12, alignItems: "center" },
  secondaryButtonText: { color: "rgba(255,255,255,0.7)" },
  dangerText: { color: "#ff6b6b" },
  error: { color: "#ff6b6b", marginTop: 12 },
});
```

**Step 2: Typecheck, then commit**

```bash
pnpm typecheck 2>&1 | grep -c "features/character"   # expect 0
git add apps/expo/src/features/character/CharacterSetup.tsx
git commit -m "feat: add character setup and edit form"
```

---

### Task 6: The header chip

**Files:**
- Create: `apps/expo/src/features/character/CharacterChip.tsx`

Name on its own line: D4 names can be long, and a long one must not push the
edit affordance off-screen or wrap the chip to three lines.

**Step 1: Implement**

```tsx
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { Character } from "./types";

export function CharacterChip({
  character,
  onEdit,
}: {
  character: Character;
  onEdit: () => void;
}) {
  const subtitle = [character.class, character.level != null ? `Lv ${character.level}` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <Pressable style={styles.chip} onPress={onEdit} hitSlop={8}>
      <View style={styles.textColumn}>
        <Text style={styles.name} numberOfLines={1} ellipsizeMode="tail">
          {character.name}
        </Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
      <Text style={styles.edit}>✎</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    position: "absolute",
    top: 12,
    left: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  // Lets the name ellipsize instead of shoving the edit glyph out of the chip.
  textColumn: { flex: 1, minWidth: 0 },
  name: { color: "white", fontSize: 16, fontWeight: "600" },
  subtitle: { color: "rgba(255,255,255,0.55)", fontSize: 13, marginTop: 2 },
  edit: { color: "white", fontSize: 18 },
});
```

**Step 2: Typecheck, then commit**

```bash
pnpm typecheck 2>&1 | grep -c "features/character"   # expect 0
git add apps/expo/src/features/character/CharacterChip.tsx
git commit -m "feat: add character header chip"
```

---

### Task 7: Wire it into the scan screen

**Files:**
- Modify: `apps/expo/src/app/scan.tsx`

**Step 1: Remove the name and title voters**

In `scan.tsx`, delete the `nameVoter` and `titleVoter` `useRef` blocks, the
`name` and `title` `useState` lines, and their `EMPTY_FIELD` usage. Keep
`levelVoter` and the `level` state.

In `onBlocks`, inside the `detected === "character"` branch, delete the
`nameVoter.current.vote(...)` and `titleVoter.current.vote(...)` calls and the
`setName`/`setTitle` calls. **Leave `extractFields` as it is** — it does one
geometric pass and returning name/title costs nothing, so a future
scanned-vs-typed cross-check needs no deleted code resurrected.

In the render block, delete the `<FieldRow label="Name" .../>` and
`<FieldRow label="Title" .../>` lines, keeping the Level row.

**Step 2: Add the profile gate**

Add imports and the hook:

```tsx
import { CharacterChip } from "../features/character/CharacterChip";
import { CharacterSetup } from "../features/character/CharacterSetup";
import { nextCharacterFromLock } from "../features/character/level-writeback";
import { useCharacter } from "../features/character/useCharacter";
```

```tsx
const { character, isLoading, save, clear } = useCharacter();
const [isEditing, setIsEditing] = useState(false);
```

Add these returns **before** the `hasPermission` check, so the camera is never
mounted while the form is up — that avoids holding the camera behind a keyboard
and the buffer-pool pressure recorded in the Phase 2 perf notes:

```tsx
if (isLoading) {
  return (
    <View style={styles.centered}>
      <Stack.Screen options={{ title: "Scan" }} />
      <Text style={styles.dim}>Loading…</Text>
    </View>
  );
}

if (character == null || isEditing) {
  return (
    <View style={styles.fill}>
      <Stack.Screen options={{ title: character == null ? "Set up" : "Edit" }} />
      <CharacterSetup
        existing={character}
        onSave={async (next) => {
          await save(next);
          setIsEditing(false);
        }}
        onCancel={character != null ? () => setIsEditing(false) : undefined}
        onClear={
          character != null
            ? async () => {
                await clear();
                setIsEditing(false);
              }
            : undefined
        }
      />
    </View>
  );
}
```

**Step 3: Add the chip and the level write-back**

Render the chip inside the outer `<View style={styles.fill}>`, after `<Camera>`:

```tsx
<CharacterChip character={character} onEdit={() => setIsEditing(true)} />
```

Add the write-back effect. It must be an effect, not part of `onBlocks`:
`onBlocks` runs on the frame-processor callback and `character` would be stale
inside it.

```tsx
useEffect(() => {
  if (character == null) return;
  const next = nextCharacterFromLock(character, level.locked);
  if (next != null) void save(next);
}, [character, level.locked, save]);
```

**Step 4: Verify nothing regressed**

```bash
cd apps/expo
pnpm vitest run                       # expect 84 passed, unchanged
pnpm typecheck 2>&1 | tail -3         # expect only the pre-existing D1Database error
pnpm lint 2>&1 | tail -3              # expect 55 problems, the pre-existing count
```

If the lint count rose above 55, fix what you added. Do not touch the rest.

**Step 5: Commit**

```bash
git add apps/expo/src/app/scan.tsx
git commit -m "feat: gate scanning on a character profile"
```

---

### Task 8: Verify on the device

Unit tests cannot cover any of the UI here, so this task is the real check. Do
not skip it.

**Step 1: Build and install**

```bash
cd apps/expo/android && ./gradlew :app:assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Confirm a device is attached first with `adb devices`. It has dropped off USB
mid-run before; if the list is empty, reconnect and check the screen is
unlocked.

**Step 2: Walk the flow and check each**

1. Fresh install, open Scan → the setup form appears, **no camera preview**.
2. "Start scanning" is disabled until a name is typed and a class picked.
3. Enter a long name (e.g. `Thornwyn the Undying Scourge of Hatred`) → save →
   the chip shows the name on its own line, ellipsized, with the edit glyph
   still visible and tappable.
4. Kill and reopen the app → the profile is still there and the camera opens
   directly, with no flash of the setup form.
5. Tap the chip → the form opens prefilled → Cancel returns to the camera
   unchanged.
6. Point at the character sheet → the Level row still populates and can lock.
   When it locks, the chip's `Lv` updates.
7. Reopen the app → the locked level persisted.
8. Tap the chip → "Clear character" → the setup form returns.

**Step 3: Record the result**

Append a short "Character profile: device verification" section to
`docs/plans/2026-09-18-character-profile-design.md` noting which of the eight
checks passed, and anything surprising. If step 6 never locks a level, that is
expected at Phase 0's measured 40% — note it, do not chase it here.

**Step 4: Commit**

```bash
git add docs/plans/2026-09-18-character-profile-design.md
git commit -m "docs: record character profile device verification"
```

---

## Out of scope

Multi-character lists, backend sync, class inference from the stat block, and
storage migration. Also out of scope: the `parseItem` name-ordering bug noted
at the bottom of the design doc — it affects item scanning, not this flow.
