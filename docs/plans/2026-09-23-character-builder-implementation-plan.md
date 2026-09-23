# Character Builder Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Turn the one-shot character/item scans into a persistent, per-user
character build — create a character (name + class), scan the header and each
equipped item into a paper-doll layout, render it with in-game-styled
tooltips — per `docs/plans/2026-09-23-character-builder-design.md`.

**Architecture:** New `character`/`item` D1 tables (Drizzle) replace the
template's `Post` table. A `character` oRPC router (owner-checked
`protectedProcedure`s) does CRUD plus `upsertItem`/`removeItem`. Class/slot
data is shared between server and app via `packages/validators`. The app gets
three new screens (`/` — My Characters, `/character/new`, `/character/[id]`)
plus a `/character/[id]/scan` capture route that reuses the existing
`useScan` native/web hooks, with a save step wired to the new router. Two new
pure functions (`interpretBadge`, `classifyLines`) turn raw OCR candidates
into character/item fields. Rendering is two new components
(`<ItemTooltip>`, `<PaperDoll>`) plus a small theme/font layer.

**Tech Stack:** Drizzle (D1/SQLite), oRPC, Zod, TanStack Query, Expo Router,
NativeWind, `expo-font`, `react-native-svg`, Jest (app), Vitest (api).

---

## Task 1: Confirm auth works; remove the Posts feature

Design doc Risk 1: "Google sign-in has not been tested on the device." The
whole app is now gated on being signed in, so this must work before anything
else is built on top of it.

**Step 1: Manual check**

Run `pnpm dev`, open the app on the Android device (`a`) and on web (`w`).
Sign in with Google on both. Confirm `authClient.useSession()` returns a user
on each. If it fails, stop and fix auth first — do not proceed on this plan
until sign-in works on at least Android + web.

**Step 2: Delete the Post feature**

Files:
- Modify: `packages/db/src/schema.ts` — remove `Post` and `CreatePostSchema`
  (keep `ScanEvent` and the `export * from "./auth-schema"`).
- Delete: `packages/api/src/router/post.ts`
- Modify: `packages/api/src/root.ts` — remove the `postRouter` import/entry.
- Modify: `apps/expo/src/app/index.tsx` — remove `PostCard`, `CreatePost`,
  `getFieldErrors`, the `postQuery`/`deletePostMutation` hooks, and the
  `<LegendList>` + `<CreatePost>` block. Leave `MobileAuth`,
  `EmailPasswordAuth`, and the `<ScanLink>` render for now — Task 5 replaces
  this file's default export with the My Characters screen.
- Delete: `apps/expo/src/app/post/[id].tsx`
- Delete: `apps/expo/src/app/index.test.tsx` if it only tests Post rendering
  (check first — the auth tests in it move to Task 5's test file).

**Step 3: Typecheck and lint**

Run: `pnpm -w typecheck && pnpm -w lint`
Expected: passes (the `@legendapp/list` and `ORPCError` imports in
`index.tsx` may now be unused — remove them).

**Step 4: Generate the migration that drops `post`**

Run: `pnpm db:generate`
Expected: a new file under `packages/db/drizzle/` with `DROP TABLE post`
(or a matching squash — check the generated SQL before committing).

**Step 5: Commit**

```bash
git add packages/db packages/api apps/expo/src/app
git commit -m "chore: remove template Post feature"
```

---

## Task 2: Shared class/slot/line-kind constants

**Files:**
- Create: `packages/validators/src/character.ts`
- Modify: `packages/validators/src/index.ts`
- Create: `packages/validators/src/character.test.ts`

**Step 1: Write the constants**

Check the weapon-slot list against the game before relying on it (design
doc Risk 2) — the values below are this plan's starting point, not verified.

```ts
// packages/validators/src/character.ts
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
```

**Step 2: Write the consistency test**

```ts
// packages/validators/src/character.test.ts
import { describe, expect, it } from "vitest";

import { CharacterClassSchema, slotsForClass } from "./character";

describe("slotsForClass", () => {
  it("returns a non-empty, de-duplicated slot list for every class", () => {
    for (const cls of CharacterClassSchema.options) {
      const slots = slotsForClass(cls);
      expect(slots.length).toBeGreaterThan(0);
      expect(new Set(slots).size).toBe(slots.length);
      expect(slots).toContain("helm");
    }
  });
});
```

**Step 3: Run the test**

Run: `pnpm --filter @acme/validators test`
Expected: PASS.

**Step 4: Export from the package barrel**

```ts
// packages/validators/src/index.ts
export * from "./character";
export * from "./scan";
```

(Remove the placeholder `unused` export while here — it's dead weight now
that a real shared type lives in this package.)

**Step 5: Typecheck and commit**

Run: `pnpm -w typecheck`

```bash
git add packages/validators
git commit -m "feat: add shared character class/slot/item-line constants"
```

---

## Task 3: `character`/`item` schema + migration

**Files:**
- Modify: `packages/db/src/schema.ts`

**Step 1: Add the tables**

```ts
// packages/db/src/schema.ts (add after ScanEvent, before the auth-schema re-export)
import { user } from "./auth-schema";

export const Character = sqliteTable("character", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  class: text("class").notNull(),
  level: integer("level").notNull().default(1),
  paragon: integer("paragon"),
  title: text("title"),
  portraitKey: text("portrait_key"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date()),
});

export const Item = sqliteTable(
  "item",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    characterId: text("character_id")
      .notNull()
      .references(() => Character.id, { onDelete: "cascade" }),
    slot: text("slot").notNull(),
    name: text("name").notNull(),
    rarity: text("rarity"),
    typeLine: text("type_line"),
    lines: text("lines", { mode: "json" }).notNull().$type<
      { kind: string; text: string }[]
    >(),
    scannedAt: integer("scanned_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("item_character_slot_idx").on(table.characterId, table.slot),
  ],
);
```

Add `uniqueIndex` to the top import line:
`import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";`

`class`/`slot`/`rarity` are stored as plain `text`, validated at the oRPC
boundary with the Zod enums from Task 2 — Drizzle/D1 has no native enum type,
and validating in the router keeps the DB layer simple (matches the
`ScanMode`/`CharacterCandidates` pattern already used for `scan`).

**Step 2: Generate and inspect the migration**

Run: `pnpm db:generate`
Expected: a new `packages/db/drizzle/000X_*.sql` creating `character` and
`item` with the FKs and unique index above. Read the generated SQL before
committing — confirm `ON DELETE CASCADE` made it onto both foreign keys.

**Step 3: Apply it locally**

Run: `pnpm db:migrate:local`
Expected: succeeds against the local D1/SQLite file.

**Step 4: Typecheck and commit**

Run: `pnpm --filter @acme/db typecheck`

```bash
git add packages/db
git commit -m "feat: add character and item tables"
```

---

## Task 4: `character` oRPC router (TDD)

**Files:**
- Create: `packages/api/src/router/character.ts`
- Create: `packages/api/src/router/character.test.ts`
- Modify: `packages/api/src/root.ts`

Check `packages/api/src/router/scan.test.ts` first for this repo's pattern of
testing a router handler directly (constructing a fake `context` and calling
`.handler()` — or, if that file drives against a real Miniflare D1 binding,
follow the same setup here instead of inventing a new harness).

**Step 1: Write the failing tests**

Cover, per the design doc's Testing section: owner checks (someone else's
character → `NOT_FOUND`), invalid slot for the class (`BAD_REQUEST`), the
re-scan upsert (`upsertItem` on an existing slot updates, not duplicates),
the paragon rule (`update` rejects `paragon` when `level < 70`, clears it
when `level` drops below 70), and cascade delete (deleting a character
removes its items).

```ts
// packages/api/src/router/character.test.ts
import { ORPCError } from "@orpc/server";
import { beforeEach, describe, expect, it } from "vitest";

import { createDb } from "@acme/db/client";
// ... set up an in-memory/Miniflare D1 instance the same way scan.test.ts does

import { characterRouter } from "./character";

function contextFor(userId: string, db: DB) {
  return {
    db,
    session: { user: { id: userId } },
  } as Parameters<(typeof characterRouter)["create"]["handler"]>[0]["context"];
}

describe("character router", () => {
  let db: DB;
  beforeEach(async () => {
    db = /* fresh migrated test db */;
  });

  it("creates and lists only the caller's characters", async () => {
    const ctx = contextFor("user-1", db);
    await characterRouter.create.handler({
      context: ctx,
      input: { name: "Lilith", class: "sorcerer" },
    });
    const list = await characterRouter.list.handler({ context: ctx, input: undefined });
    expect(list).toHaveLength(1);
    expect(list[0]?.name).toBe("Lilith");
  });

  it("returns NOT_FOUND for another user's character", async () => {
    const owner = contextFor("user-1", db);
    const created = await characterRouter.create.handler({
      context: owner,
      input: { name: "Lilith", class: "sorcerer" },
    });
    const intruder = contextFor("user-2", db);
    await expect(
      characterRouter.byId.handler({ context: intruder, input: { id: created.id } }),
    ).rejects.toThrow(ORPCError);
  });

  it("rejects a slot the class doesn't have", async () => {
    const ctx = contextFor("user-1", db);
    const created = await characterRouter.create.handler({
      context: ctx,
      input: { name: "Lilith", class: "sorcerer" },
    });
    await expect(
      characterRouter.upsertItem.handler({
        context: ctx,
        input: {
          characterId: created.id,
          slot: "twoHandSlashing", // barbarian-only
          name: "Whatever",
          lines: [],
        },
      }),
    ).rejects.toThrow(ORPCError);
  });

  it("upserts the same slot instead of duplicating", async () => {
    const ctx = contextFor("user-1", db);
    const created = await characterRouter.create.handler({
      context: ctx,
      input: { name: "Lilith", class: "sorcerer" },
    });
    await characterRouter.upsertItem.handler({
      context: ctx,
      input: { characterId: created.id, slot: "helm", name: "Old Helm", lines: [] },
    });
    await characterRouter.upsertItem.handler({
      context: ctx,
      input: { characterId: created.id, slot: "helm", name: "New Helm", lines: [] },
    });
    const full = await characterRouter.byId.handler({ context: ctx, input: { id: created.id } });
    expect(full.items.filter((i) => i.slot === "helm")).toHaveLength(1);
    expect(full.items.find((i) => i.slot === "helm")?.name).toBe("New Helm");
  });

  it("enforces the paragon/level-70 rule", async () => {
    const ctx = contextFor("user-1", db);
    const created = await characterRouter.create.handler({
      context: ctx,
      input: { name: "Lilith", class: "sorcerer" },
    });
    await expect(
      characterRouter.update.handler({
        context: ctx,
        input: { id: created.id, level: 50, paragon: 10 },
      }),
    ).rejects.toThrow(ORPCError);
  });

  it("cascades item deletes when a character is deleted", async () => {
    const ctx = contextFor("user-1", db);
    const created = await characterRouter.create.handler({
      context: ctx,
      input: { name: "Lilith", class: "sorcerer" },
    });
    await characterRouter.upsertItem.handler({
      context: ctx,
      input: { characterId: created.id, slot: "helm", name: "Helm", lines: [] },
    });
    await characterRouter.delete.handler({ context: ctx, input: { id: created.id } });
    await expect(
      characterRouter.byId.handler({ context: ctx, input: { id: created.id } }),
    ).rejects.toThrow(ORPCError);
  });
});
```

**Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @acme/api test`
Expected: FAIL — `character.ts` doesn't exist yet.

**Step 3: Implement the router**

```ts
// packages/api/src/router/character.ts
import { ORPCError } from "@orpc/server";
import { z } from "zod/v4";

import type { ItemSlot } from "@acme/validators";
import { count, eq } from "@acme/db";
import { Character, Item } from "@acme/db/schema";
import {
  CharacterClassSchema,
  ItemLineSchema,
  ItemRaritySchema,
  ItemSlotSchema,
  slotsForClass,
} from "@acme/validators";

import { protectedProcedure } from "../orpc";

async function requireOwnedCharacter(
  db: import("@acme/db/client").DB,
  userId: string,
  id: string,
) {
  const character = await db.query.Character.findFirst({
    where: eq(Character.id, id),
  });
  if (!character || character.userId !== userId) {
    throw new ORPCError("NOT_FOUND");
  }
  return character;
}

function assertValidSlot(cls: string, slot: ItemSlot) {
  if (!slotsForClass(cls as never).includes(slot)) {
    throw new ORPCError("BAD_REQUEST", { message: "Invalid slot for class" });
  }
}

export const characterRouter = {
  list: protectedProcedure.handler(async ({ context }) => {
    const userId = context.session.user.id;
    const characters = await context.db.query.Character.findMany({
      where: eq(Character.userId, userId),
    });
    return Promise.all(
      characters.map(async (c) => {
        const [row] = await context.db
          .select({ value: count() })
          .from(Item)
          .where(eq(Item.characterId, c.id));
        return { ...c, filledSlots: row?.value ?? 0 };
      }),
    );
  }),

  byId: protectedProcedure
    .input(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => {
      const character = await requireOwnedCharacter(
        context.db,
        context.session.user.id,
        input.id,
      );
      const items = await context.db.query.Item.findMany({
        where: eq(Item.characterId, character.id),
      });
      return { ...character, items };
    }),

  create: protectedProcedure
    .input(z.object({ name: z.string().min(1).max(64), class: CharacterClassSchema }))
    .handler(({ context, input }) => {
      return context.db
        .insert(Character)
        .values({ userId: context.session.user.id, name: input.name, class: input.class })
        .returning()
        .get();
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(64).optional(),
        level: z.number().int().min(1).max(70).optional(),
        paragon: z.number().int().min(0).nullable().optional(),
        title: z.string().nullable().optional(),
      }),
    )
    .handler(async ({ context, input }) => {
      const character = await requireOwnedCharacter(
        context.db,
        context.session.user.id,
        input.id,
      );
      const nextLevel = input.level ?? character.level;
      let nextParagon = input.paragon !== undefined ? input.paragon : character.paragon;
      if (nextLevel < 70) {
        if (input.paragon != null) {
          throw new ORPCError("BAD_REQUEST", {
            message: "Paragon only applies at level 70",
          });
        }
        nextParagon = null;
      }
      return context.db
        .update(Character)
        .set({
          name: input.name ?? character.name,
          level: nextLevel,
          paragon: nextParagon,
          title: input.title !== undefined ? input.title : character.title,
        })
        .where(eq(Character.id, character.id))
        .returning()
        .get();
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => {
      await requireOwnedCharacter(context.db, context.session.user.id, input.id);
      await context.db.delete(Character).where(eq(Character.id, input.id));
    }),

  upsertItem: protectedProcedure
    .input(
      z.object({
        characterId: z.string(),
        slot: ItemSlotSchema,
        name: z.string().min(1),
        rarity: ItemRaritySchema.optional(),
        typeLine: z.string().optional(),
        lines: z.array(ItemLineSchema),
      }),
    )
    .handler(async ({ context, input }) => {
      const character = await requireOwnedCharacter(
        context.db,
        context.session.user.id,
        input.characterId,
      );
      assertValidSlot(character.class, input.slot);
      return context.db
        .insert(Item)
        .values({
          characterId: character.id,
          slot: input.slot,
          name: input.name,
          rarity: input.rarity,
          typeLine: input.typeLine,
          lines: input.lines,
        })
        .onConflictDoUpdate({
          target: [Item.characterId, Item.slot],
          set: {
            name: input.name,
            rarity: input.rarity,
            typeLine: input.typeLine,
            lines: input.lines,
            scannedAt: new Date(),
          },
        })
        .returning()
        .get();
    }),

  removeItem: protectedProcedure
    .input(z.object({ characterId: z.string(), slot: ItemSlotSchema }))
    .handler(async ({ context, input }) => {
      await requireOwnedCharacter(context.db, context.session.user.id, input.characterId);
      await context.db
        .delete(Item)
        .where(and(eq(Item.characterId, input.characterId), eq(Item.slot, input.slot)));
    }),
};
```

(Add `and` to the `@acme/db` import used by `removeItem`.)

**Step 4: Register the router**

```ts
// packages/api/src/root.ts
import { authRouter } from "./router/auth";
import { characterRouter } from "./router/character";
import { scanRouter } from "./router/scan";

export const appRouter = {
  auth: authRouter,
  character: characterRouter,
  scan: scanRouter,
};

export type AppRouter = typeof appRouter;
```

**Step 5: Run the tests**

Run: `pnpm --filter @acme/api test`
Expected: PASS.

**Step 6: Typecheck, lint, commit**

Run: `pnpm --filter @acme/api typecheck && pnpm --filter @acme/api lint`

```bash
git add packages/api
git commit -m "feat: add character oRPC router with owner-scoped CRUD"
```

---

## Task 5: My Characters screen (`/`)

**Files:**
- Modify: `apps/expo/src/app/index.tsx`
- Create: `apps/expo/src/app/index.test.tsx` (or extend the surviving one from Task 1)

**Step 1: Replace the screen body**

Keep `MobileAuth`/`EmailPasswordAuth` from `index.tsx` as-is (they already
handle the signed-out state). Replace the post list with a character list:

```tsx
// apps/expo/src/app/index.tsx — replace the default export
function CharacterRow(props: {
  character: RouterOutputs["character"]["list"][number];
}) {
  return (
    <Link
      asChild
      href={{ pathname: "/character/[id]", params: { id: props.character.id } }}
    >
      <Pressable className="bg-muted flex flex-row items-center justify-between rounded-lg p-4">
        <View>
          <Text className="text-foreground text-lg font-semibold">
            {props.character.name}
          </Text>
          <Text className="text-muted-foreground capitalize">
            {props.character.class} · Level {props.character.level}
            {props.character.paragon != null && ` · Paragon ${props.character.paragon}`}
          </Text>
        </View>
        <Text className="text-muted-foreground">{props.character.filledSlots}/11 slots</Text>
      </Pressable>
    </Link>
  );
}

export default function Index() {
  const { data: session } = authClient.useSession();
  const charactersQuery = useQuery({
    ...orpc.character.list.queryOptions(),
    enabled: !!session,
  });

  return (
    <SafeAreaView className="bg-background">
      <Stack.Screen options={{ title: "My Characters" }} />
      <View className="bg-background h-full w-full p-4">
        <Text className="text-foreground pb-2 text-center text-5xl font-bold">
          Diablo 4 <Text className="text-primary">Scanner</Text>
        </Text>

        <MobileAuth />

        {session && (
          <>
            <Link href="/character/new" className="my-2 items-center rounded-sm bg-primary p-2 text-center">
              + New Character
            </Link>
            <LegendList
              data={charactersQuery.data ?? []}
              estimatedItemSize={72}
              keyExtractor={(item) => item.id}
              ItemSeparatorComponent={() => <View className="h-2" />}
              renderItem={(c) => <CharacterRow character={c.item} />}
            />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}
```

Keep `<ScanLink />` only if you still want `/scan` reachable as the
developer screen (design doc: "`/scan` stays as a developer screen") — place
it below the character list, not gating it on `session`.

**Step 2: Write a smoke test**

```tsx
// apps/expo/src/app/index.test.tsx
import { render, screen } from "@testing-library/react-native";

import Index from "./index";

jest.mock("~/utils/auth", () => ({
  authClient: { useSession: () => ({ data: null }) },
}));

it("shows sign-in prompt when signed out", () => {
  render(<Index />);
  expect(screen.getByText(/Not logged in/i)).toBeTruthy();
});
```

**Step 3: Run the test**

Run: `pnpm --filter @acme/expo test`
Expected: PASS.

**Step 4: Manual check**

Run `pnpm dev:web`, sign in, confirm the (empty) character list and "+ New
Character" link render.

**Step 5: Commit**

```bash
git add apps/expo/src/app/index.tsx apps/expo/src/app/index.test.tsx
git commit -m "feat: replace Posts home screen with My Characters"
```

---

## Task 6: `/character/new` — create flow

**Files:**
- Create: `apps/expo/src/app/character/new.tsx`

**Step 1: Implement the screen**

```tsx
// apps/expo/src/app/character/new.tsx
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, Stack } from "expo-router";
import { useMutation } from "@tanstack/react-query";

import type { CharacterClass } from "@acme/validators";
import { CharacterClassSchema } from "@acme/validators";

import { orpc } from "~/utils/api";

export default function NewCharacterScreen() {
  const [name, setName] = useState("");
  const [cls, setCls] = useState<CharacterClass>();

  const { mutate, isPending, error } = useMutation(
    orpc.character.create.mutationOptions({
      onSuccess: (character) => {
        router.replace({ pathname: "/character/[id]", params: { id: character.id } });
      },
    }),
  );

  return (
    <SafeAreaView className="bg-background h-full">
      <Stack.Screen options={{ title: "New Character" }} />
      <View className="gap-4 p-4">
        <TextInput
          className="border-input bg-background text-foreground rounded-md border px-3 py-2 text-lg"
          placeholder="Character name"
          value={name}
          onChangeText={setName}
        />
        <View className="flex-row flex-wrap gap-2">
          {CharacterClassSchema.options.map((option) => (
            <Pressable
              key={option}
              onPress={() => setCls(option)}
              className="rounded-full px-4 py-2"
              style={{ backgroundColor: cls === option ? "#ec4899" : "#3f3f46" }}
            >
              <Text className="capitalize text-white">{option}</Text>
            </Pressable>
          ))}
        </View>
        {error && <Text className="text-destructive">{error.message}</Text>}
        <Pressable
          disabled={!name || !cls || isPending}
          onPress={() => cls && mutate({ name, class: cls })}
          className="bg-primary items-center rounded-sm p-3"
        >
          <Text className="text-foreground font-semibold">Create</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
```

**Step 2: Manual check**

Create a character on web; confirm it navigates to `/character/<id>` (which
404s until Task 7 — that's expected here).

**Step 3: Commit**

```bash
git add apps/expo/src/app/character/new.tsx
git commit -m "feat: add character creation screen"
```

---

## Task 7: Bare `/character/[id]` screen with manual header edit

**Files:**
- Create: `apps/expo/src/app/character/[id]/index.tsx`
- Create: `apps/expo/src/features/character/CharacterHeader.tsx`

Build the plainest possible version first — text fields, no paper doll yet
(that's Task 10). This gets manual level/paragon/title editing working end
to end before scanning is layered on.

**Step 1: `<CharacterHeader>`**

```tsx
// apps/expo/src/features/character/CharacterHeader.tsx
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import type { RouterOutputs } from "~/utils/api";

type Character = RouterOutputs["character"]["byId"];

export function CharacterHeader(props: {
  character: Character;
  onSave: (patch: { name?: string; level?: number; paragon?: number | null; title?: string | null }) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(props.character.name);
  const [level, setLevel] = useState(String(props.character.level));
  const [paragon, setParagon] = useState(props.character.paragon?.toString() ?? "");
  const [title, setTitle] = useState(props.character.title ?? "");

  if (!editing) {
    return (
      <Pressable onPress={() => setEditing(true)} className="gap-1 p-2">
        <Text className="text-foreground text-2xl font-bold">{props.character.name}</Text>
        <Text className="text-muted-foreground">
          {props.character.level === 70 && props.character.paragon != null
            ? `Level 70 · Paragon ${props.character.paragon}`
            : `Level ${props.character.level}`}
          {props.character.title ? ` · ${props.character.title}` : ""}
        </Text>
        <Text className="text-muted-foreground capitalize">{props.character.class}</Text>
      </Pressable>
    );
  }

  return (
    <View className="gap-2 p-2">
      <TextInput className="border-input rounded-md border px-2 py-1" value={name} onChangeText={setName} />
      <TextInput
        className="border-input rounded-md border px-2 py-1"
        value={level}
        onChangeText={setLevel}
        keyboardType="number-pad"
        placeholder="Level"
      />
      {Number(level) === 70 && (
        <TextInput
          className="border-input rounded-md border px-2 py-1"
          value={paragon}
          onChangeText={setParagon}
          keyboardType="number-pad"
          placeholder="Paragon"
        />
      )}
      <TextInput className="border-input rounded-md border px-2 py-1" value={title} onChangeText={setTitle} placeholder="Title" />
      <Pressable
        className="bg-primary items-center rounded-sm p-2"
        onPress={() => {
          props.onSave({
            name,
            level: Number(level),
            paragon: Number(level) === 70 && paragon ? Number(paragon) : null,
            title: title || null,
          });
          setEditing(false);
        }}
      >
        <Text className="text-foreground">Save</Text>
      </Pressable>
    </View>
  );
}
```

**Step 2: The screen**

```tsx
// apps/expo/src/app/character/[id]/index.tsx
import { Link, Stack, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, View } from "react-native";

import { CharacterHeader } from "~/features/character/CharacterHeader";
import { orpc } from "~/utils/api";

export default function CharacterScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const characterQuery = useQuery(orpc.character.byId.queryOptions({ input: { id } }));

  const updateMutation = useMutation(
    orpc.character.update.mutationOptions({
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: orpc.character.byId.key({ input: { id } }) }),
    }),
  );

  if (characterQuery.isPending) {
    return (
      <SafeAreaView className="bg-background h-full items-center justify-center">
        <Text className="text-foreground">Loading…</Text>
      </SafeAreaView>
    );
  }
  if (characterQuery.isError || !characterQuery.data) {
    return (
      <SafeAreaView className="bg-background h-full items-center justify-center gap-2">
        <Text className="text-destructive">Couldn't load this character.</Text>
        <Text onPress={() => characterQuery.refetch()} className="text-primary">Retry</Text>
      </SafeAreaView>
    );
  }

  const character = characterQuery.data;

  return (
    <SafeAreaView className="bg-background h-full">
      <Stack.Screen options={{ title: character.name }} />
      <View className="p-4">
        <CharacterHeader character={character} onSave={(patch) => updateMutation.mutate({ id, ...patch })} />
        <Link
          href={{ pathname: "/character/[id]/scan", params: { id, target: "header" } }}
          className="text-primary py-2"
        >
          Scan character sheet
        </Link>
        {/* Task 10 replaces this list with <PaperDoll> */}
        {character.items.map((item) => (
          <Text key={item.id} className="text-foreground py-1">
            {item.slot}: {item.name}
          </Text>
        ))}
      </View>
    </SafeAreaView>
  );
}
```

**Step 3: Manual check**

Create a character, edit name/level/title by hand, confirm it persists
across a reload (re-fetch of `character.byId`).

**Step 4: Typecheck and commit**

```bash
git add apps/expo/src/features/character apps/expo/src/app/character
git commit -m "feat: add character screen with manual header edit"
```

---

## Task 8: `interpretBadge` + header scan capture (TDD)

**Files:**
- Create: `apps/expo/src/features/scanner/interpretBadge.ts`
- Create: `apps/expo/src/features/scanner/interpretBadge.test.ts`
- Create: `apps/expo/src/app/character/[id]/scan.native.tsx`
- Create: `apps/expo/src/app/character/[id]/scan.web.tsx`
- Create: `apps/expo/src/app/character/[id]/scan.tsx` (platform-less fallback, copy the comment/pattern from `apps/expo/src/app/scan.tsx`)

**Step 1: Write the failing tests for `interpretBadge`**

```ts
// apps/expo/src/features/scanner/interpretBadge.test.ts
import { interpretBadge } from "./interpretBadge";

describe("interpretBadge", () => {
  it("reads n as paragon once the character is already level 70", () => {
    expect(interpretBadge(93, { level: 70, paragon: 12 })).toEqual({
      level: 70,
      paragon: 93,
      ambiguous: false,
    });
  });

  it("treats n > 70 as paragon even if not stored as 70 yet", () => {
    expect(interpretBadge(93, { level: 45, paragon: null })).toEqual({
      level: 70,
      paragon: 93,
      ambiguous: false,
    });
  });

  it("treats n <= 70 as level when not yet 70, flagged ambiguous", () => {
    expect(interpretBadge(70, { level: 45, paragon: null })).toEqual({
      level: 70,
      paragon: null,
      ambiguous: true,
    });
    expect(interpretBadge(45, { level: 30, paragon: null })).toEqual({
      level: 45,
      paragon: null,
      ambiguous: false,
    });
  });
});
```

**Step 2: Run to verify failure**

Run: `pnpm --filter @acme/expo test interpretBadge`
Expected: FAIL — module not found.

**Step 3: Implement**

```ts
// apps/expo/src/features/scanner/interpretBadge.ts
export interface BadgeResult {
  level: number;
  paragon: number | null;
  ambiguous: boolean;
}

/**
 * Resolves the character-sheet level/paragon badge, which shows character
 * level below 70 and paragon level at 70 — the same on-screen number means
 * two different things depending on state. See
 * docs/plans/2026-09-23-character-builder-design.md, "Level and paragon".
 */
export function interpretBadge(
  n: number,
  current: { level: number; paragon: number | null },
): BadgeResult {
  if (current.level === 70) {
    return { level: 70, paragon: n, ambiguous: false };
  }
  if (n > 70) {
    return { level: 70, paragon: n, ambiguous: false };
  }
  return { level: n, paragon: null, ambiguous: n === 70 };
}
```

**Step 4: Run to verify pass**

Run: `pnpm --filter @acme/expo test interpretBadge`
Expected: PASS.

**Step 5: Wire up the scan-header capture screens**

Both platform files follow the existing `scan.native.tsx`/`scan.web.tsx`
shells (camera capture vs. upload), locked to `mode="character"`, with a
save step added after `status === "done"`. Native:

```tsx
// apps/expo/src/app/character/[id]/scan.native.tsx
import { useRef, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Camera, useCameraDevice, useCameraPermission } from "react-native-vision-camera";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { scannerConfig } from "~/features/scanner/config";
import { interpretBadge } from "~/features/scanner/interpretBadge";
import { useScan } from "~/features/scanner/useScan";
import { orpc } from "~/utils/api";

export default function CharacterScanScreen() {
  const { id, target } = useLocalSearchParams<{ id: string; target: string }>();
  const isHeader = target === "header";
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice("back");
  const cameraRef = useRef<Camera>(null);
  const { candidates, status, photoPath, error, capture, retake } = useScan(
    isHeader ? "character" : "item",
    cameraRef,
  );
  const queryClient = useQueryClient();
  const [treatAsParagon, setTreatAsParagon] = useState(false);

  const characterQuery = orpc.character.byId.queryOptions({ input: { id } });
  const currentCharacter = queryClient.getQueryData(characterQuery.queryKey);

  const updateMutation = useMutation(orpc.character.update.mutationOptions());
  const upsertItemMutation = useMutation(orpc.character.upsertItem.mutationOptions());

  const save = async () => {
    if (isHeader) {
      const c = candidates as { level?: string; title?: string; name?: string };
      const patch: Record<string, unknown> = {};
      if (c.name) patch.name = c.name;
      if (c.title) patch.title = c.title;
      const n = c.level ? parseInt(c.level, 10) : undefined;
      if (n && currentCharacter) {
        const badge = interpretBadge(n, {
          level: currentCharacter.level,
          paragon: currentCharacter.paragon,
        });
        patch.level = treatAsParagon ? 70 : badge.level;
        patch.paragon = treatAsParagon ? n : badge.paragon;
      }
      await updateMutation.mutateAsync({ id, ...patch });
    } else {
      const c = candidates as { name?: string; type?: string; rarity?: string; affixes: string[] };
      await upsertItemMutation.mutateAsync({
        characterId: id,
        slot: target as never,
        name: c.name ?? "Unknown item",
        typeLine: c.type,
        rarity: c.rarity as never,
        lines: c.affixes.map((text) => ({ kind: "other" as const, text })),
      });
    }
    await queryClient.invalidateQueries({ queryKey: characterQuery.queryKey });
    router.back();
  };

  if (!hasPermission) {
    void requestPermission();
    return (
      <View className="bg-background h-full w-full items-center justify-center">
        <Text className="text-foreground">Requesting camera permission…</Text>
      </View>
    );
  }
  if (!device) {
    return (
      <View className="bg-background h-full w-full items-center justify-center">
        <Text className="text-foreground">No camera device found.</Text>
      </View>
    );
  }

  return (
    <View className="h-full w-full">
      <Stack.Screen options={{ title: isHeader ? "Scan Character Sheet" : "Scan Item" }} />
      {status !== "idle" && photoPath ? (
        <Image source={{ uri: photoPath }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <Camera ref={cameraRef} style={StyleSheet.absoluteFill} device={device} isActive photo />
      )}
      {status === "idle" && (
        <View
          className="absolute"
          style={{
            left: `${scannerConfig.roi.x * 100}%`,
            top: `${scannerConfig.roi.y * 100}%`,
            width: `${scannerConfig.roi.width * 100}%`,
            height: `${scannerConfig.roi.height * 100}%`,
            borderWidth: 2,
            borderColor: "#22d3ee",
          }}
        />
      )}
      {status === "idle" && (
        <View className="absolute inset-x-4 bottom-16 items-center">
          <Pressable onPress={() => void capture()} className="rounded-full bg-cyan-400 px-6 py-3">
            <Text style={{ color: "#000" }}>Take Picture</Text>
          </Pressable>
        </View>
      )}
      {status === "done" && (
        <View className="absolute inset-x-4 bottom-16 gap-2 rounded-lg bg-black/60 p-3">
          {isHeader && (candidates as { level?: string }).level && (
            <Pressable onPress={() => setTreatAsParagon((v) => !v)}>
              <Text style={{ color: treatAsParagon ? "#22d3ee" : "#fff" }}>
                {treatAsParagon ? "☑" : "☐"} Max level — treat as Paragon
              </Text>
            </Pressable>
          )}
          <Pressable onPress={() => void save()} className="items-center rounded-full bg-cyan-400 px-6 py-3">
            <Text style={{ color: "#000" }}>Save</Text>
          </Pressable>
          <Pressable onPress={retake} className="items-center rounded-full bg-zinc-700 px-6 py-3">
            <Text style={{ color: "#fff" }}>Retake</Text>
          </Pressable>
        </View>
      )}
      {status === "error" && (
        <View className="absolute inset-x-4 bottom-16 rounded-lg bg-black/60 p-3">
          <Text style={{ color: "#fff" }}>Error: {error}</Text>
          <Pressable onPress={retake} className="items-center rounded-full bg-cyan-400 px-6 py-3">
            <Text style={{ color: "#000" }}>Retake</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
```

`scan.web.tsx` mirrors this using `useScan` from `useScan.web.ts` and the
file-upload/paste shell from `apps/expo/src/app/scan.web.tsx` instead of the
`Camera` component — same `save()` logic, different capture UI. Write it by
copying that file's upload/paste markup and swapping in this screen's
`save`/`candidates`/`target` handling.

**Step 6: Manual check**

On the character screen, tap "Scan character sheet", capture/upload a real
D4 character-sheet screenshot, confirm Save updates the header and returns.

**Step 7: Commit**

```bash
git add apps/expo/src/features/scanner/interpretBadge.ts apps/expo/src/features/scanner/interpretBadge.test.ts apps/expo/src/app/character/[id]/scan.native.tsx apps/expo/src/app/character/[id]/scan.web.tsx apps/expo/src/app/character/[id]/scan.tsx
git commit -m "feat: add interpretBadge and character-sheet scan capture"
```

---

## Task 9: `classifyLines` + item scan target (TDD)

**Files:**
- Modify: `apps/expo/src/features/scanner/config.ts` (add `aspectColor`, gap threshold)
- Create: `apps/expo/src/features/scanner/classifyLines.ts`
- Create: `apps/expo/src/features/scanner/classifyLines.test.ts`
- Modify: `apps/expo/src/app/character/[id]/scan.native.tsx` / `.web.tsx` (already slot-aware from Task 8 — this task makes `lines` real instead of all-`other`)

**Step 1: Add the new config values**

```ts
// apps/expo/src/features/scanner/config.ts — inside itemConfig
aspectColor: "#e08a3e", // placeholder — tune on-device (Task 11)
aspectColorThreshold: 40,
// Minimum vertical gap (px) between two blocks to treat it as the divider
// ML Kit doesn't report — placeholder, tune on-device.
implicitDividerGapPx: 24,
```

**Step 2: Write the failing tests against fixtures**

Reuse the `__fixtures__/ocr-blocks/*.json` pattern already in this
directory — add 3-4 new item-tooltip fixture files under
`apps/expo/src/features/scanner/__fixtures__/item-blocks/` captured from
`temp-items/` (per the design doc's testing note), one each for a weapon,
armor, jewelry, and a unique/aspect item.

```ts
// apps/expo/src/features/scanner/classifyLines.test.ts
import { classifyLines } from "./classifyLines";
import weaponFixture from "./__fixtures__/item-blocks/weapon-01.json";

it("classifies item power, affixes, and the fallback", () => {
  const lines = classifyLines(weaponFixture.blocks);
  expect(lines.find((l) => l.kind === "itemPower")).toBeTruthy();
  expect(lines.some((l) => l.kind === "affix")).toBe(true);
  expect(lines.every((l) => l.kind !== undefined)).toBe(true);
});
```

Add one test per rule in the design doc's `classifyLines` list (`itemPower`,
`armor`, `dps`, `socket`, `aspect` merge-of-consecutive-blocks, `implicit`
via the gap threshold, `affix`, `other` fallback) — this is the bulk of
Task 9's test file; don't skip the aspect-merging case, it's the one
genuinely tricky rule.

**Step 3: Run to verify failure**

Run: `pnpm --filter @acme/expo test classifyLines`
Expected: FAIL.

**Step 4: Implement**

```ts
// apps/expo/src/features/scanner/classifyLines.ts
import type { ItemLine, ItemLineKind } from "@acme/validators";
import type { OcrBlock } from "./anchor";
import { itemConfig } from "./config";

function colorNear(color: OcrBlock["color"], hex: string, threshold: number): boolean {
  if (!color) return false;
  const n = parseInt(hex.replace("#", ""), 16);
  const target = { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
  const d = Math.sqrt(
    (color.r - target.r) ** 2 + (color.g - target.g) ** 2 + (color.b - target.b) ** 2,
  );
  return d <= threshold;
}

function classifyOne(block: OcrBlock): ItemLineKind {
  const text = block.text.trim();
  if (/item power/i.test(text)) return "itemPower";
  if (/^\d[\d,]* armor$/i.test(text)) return "armor";
  if (/damage per second/i.test(text) || /\d+(\.\d+)?\s*-\s*\d+(\.\d+)?/.test(text)) return "dps";
  if (/empty socket/i.test(text)) return "socket";
  if (colorNear(block.color, itemConfig.aspectColor, itemConfig.aspectColorThreshold)) return "aspect";
  if (/^[+\d%]/.test(text)) return "affix";
  return "other";
}

/** Classifies the affix-region blocks `extractItemFields` already isolated. */
export function classifyLines(blocks: OcrBlock[]): ItemLine[] {
  const sorted = [...blocks].sort((a, b) => a.frame.y - b.frame.y);

  // The biggest vertical gap between consecutive blocks stands in for the
  // divider ML Kit doesn't report as its own element. Lines above it are
  // implicits; find it before per-line classification can override kinds
  // like affix/aspect that take priority regardless of position.
  let dividerIndex = -1;
  let maxGap = itemConfig.implicitDividerGapPx;
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i]!.frame.y - (sorted[i - 1]!.frame.y + sorted[i - 1]!.frame.height);
    if (gap > maxGap) {
      maxGap = gap;
      dividerIndex = i;
    }
  }

  const result: ItemLine[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const block = sorted[i]!;
    let kind = classifyOne(block);
    if (kind === "other" && dividerIndex !== -1 && i < dividerIndex) {
      kind = "implicit";
    }

    const prev = result[result.length - 1];
    if (kind === "aspect" && prev?.kind === "aspect") {
      prev.text = `${prev.text} ${block.text}`;
      continue;
    }
    result.push({ kind, text: block.text });
  }
  return result;
}
```

**Step 5: Run to verify pass**

Run: `pnpm --filter @acme/expo test classifyLines`
Expected: PASS. Iterate on the regexes/thresholds against the fixtures
until every rule's test passes — this is exactly the kind of tuning the
design doc flags as uncalibrated, so it's fine if thresholds move here.

**Step 6: Wire `classifyLines` into the item-scan save path**

In `character/[id]/scan.native.tsx`/`.web.tsx`'s `save()`, replace the
placeholder `lines: c.affixes.map((text) => ({ kind: "other", text }))` with
`lines: classifyLines(rawBlocksFromUseScan)`. This requires `useScan` to also
expose the raw `OcrBlock[]` it already computes internally (native) or — on
web, since Workers AI has no block-level output — fall back to
`c.affixes.map((text) => ({ kind: "other" as const, text }))` there, since
there are no blocks/colors to classify against on the web path. Document this
native/web split with a one-line comment where the fallback lives.

**Step 7: Typecheck, lint, commit**

```bash
git add apps/expo/src/features/scanner apps/expo/src/app/character
git commit -m "feat: add classifyLines and wire it into item-scan saves"
```

---

## Task 10: `<ItemTooltip>`, `<PaperDoll>`, theme, fonts

**Files:**
- Create: `apps/expo/src/features/character/theme.ts`
- Create: `apps/expo/src/features/character/ItemTooltip.tsx`
- Create: `apps/expo/src/features/character/ItemTooltip.test.tsx`
- Create: `apps/expo/src/features/character/PaperDoll.tsx`
- Create: `apps/expo/src/features/character/PaperDoll.test.tsx`
- Modify: `apps/expo/src/app/character/[id]/index.tsx` (swap the plain item list for `<PaperDoll>`)
- Modify: `apps/expo/package.json`, `apps/expo/app.config.ts`

**Step 1: Install fonts and SVG**

Run: `pnpm --filter @acme/expo add expo-font react-native-svg @expo-google-fonts/cinzel @expo-google-fonts/alegreya-sans`

**Step 2: Theme**

```ts
// apps/expo/src/features/character/theme.ts
// Text/border colors here are applied with inline `style`, never className —
// see the NativeWind color/border quirk noted for this app.
export const characterTheme = {
  background: "#0a0a0f",
  parchment: "#e8dcc0",
  bronzeFrame: "#7a5c34",
  rarity: {
    common: "#c8c8c8",
    magic: "#5bb0f5",
    rare: "#f5e14a",
    legendary: "#f59b42",
    unique: "#c9a86a",
  },
} as const;
```

**Step 3: `<ItemTooltip>` (TDD)**

Write the test first against each line kind rendering something
recognizable, then implement:

```tsx
// apps/expo/src/features/character/ItemTooltip.test.tsx
import { render, screen } from "@testing-library/react-native";

import { ItemTooltip } from "./ItemTooltip";

it("renders name, rarity color, and each line kind", () => {
  render(
    <ItemTooltip
      item={{
        name: "Doombringer",
        rarity: "unique",
        typeLine: "Two-Handed Sword",
        lines: [
          { kind: "itemPower", text: "Item Power: 800" },
          { kind: "affix", text: "+20% Damage" },
          { kind: "aspect", text: "Aspect of Doom" },
          { kind: "other", text: "Something unclassified" },
        ],
      }}
    />,
  );
  expect(screen.getByText("Doombringer")).toBeTruthy();
  expect(screen.getByText("Aspect of Doom")).toBeTruthy();
  expect(screen.getByText("Something unclassified")).toBeTruthy();
});
```

```tsx
// apps/expo/src/features/character/ItemTooltip.tsx
import { Text, View } from "react-native";

import type { ItemLine, ItemRarity } from "@acme/validators";

import { characterTheme } from "./theme";

export function ItemTooltip(props: {
  item: { name: string; rarity?: ItemRarity; typeLine?: string; lines: ItemLine[] };
}) {
  const rarityColor = props.item.rarity ? characterTheme.rarity[props.item.rarity] : characterTheme.parchment;

  return (
    <View
      style={{
        backgroundColor: characterTheme.background,
        borderTopWidth: 3,
        borderTopColor: rarityColor,
        borderColor: characterTheme.bronzeFrame,
        borderWidth: 1,
        padding: 12,
        gap: 4,
      }}
    >
      <Text style={{ color: rarityColor, fontFamily: "Cinzel_700Bold", fontSize: 18 }}>
        {props.item.name}
      </Text>
      {props.item.typeLine && (
        <Text style={{ color: rarityColor, fontFamily: "AlegreyaSans_400Regular" }}>
          {props.item.typeLine}
        </Text>
      )}
      {props.item.lines.map((line, i) => (
        <Text
          key={i}
          style={{
            color: line.kind === "aspect" ? characterTheme.rarity.legendary : characterTheme.parchment,
            fontStyle: line.kind === "aspect" ? "italic" : "normal",
            fontFamily: "AlegreyaSans_400Regular",
          }}
        >
          {line.kind === "affix" ? "◆ " : ""}
          {line.kind === "socket" ? "◇ " : ""}
          {line.text}
        </Text>
      ))}
    </View>
  );
}
```

Run: `pnpm --filter @acme/expo test ItemTooltip` — iterate until it passes.

**Step 4: `<PaperDoll>` (TDD)**

```tsx
// apps/expo/src/features/character/PaperDoll.test.tsx
import { render, screen } from "@testing-library/react-native";

import { PaperDoll } from "./PaperDoll";

it("renders one tile per class slot, empty vs filled", () => {
  const onSlotPress = jest.fn();
  render(
    <PaperDoll
      characterClass="sorcerer"
      items={[{ slot: "helm", name: "Circlet", rarity: "rare" }]}
      onSlotPress={onSlotPress}
    />,
  );
  expect(screen.getByText("Circlet")).toBeTruthy();
  expect(screen.getAllByTestId(/slot-/).length).toBeGreaterThan(1);
});
```

```tsx
// apps/expo/src/features/character/PaperDoll.tsx
import { Pressable, Text, View } from "react-native";

import type { CharacterClass, ItemRarity, ItemSlot } from "@acme/validators";
import { slotsForClass } from "@acme/validators";

import { characterTheme } from "./theme";

// Rough grid layout: armor/jewelry left column, weapons right column.
// Placeholder positions — replace with a real per-class layout map once
// there's a silhouette to align against (design doc: "layout map" is
// out-of-scope-for-v1 detail, this ships the simplest thing that works).
export function PaperDoll(props: {
  characterClass: CharacterClass;
  items: { slot: ItemSlot; name: string; rarity?: ItemRarity }[];
  onSlotPress: (slot: ItemSlot) => void;
}) {
  const slots = slotsForClass(props.characterClass);
  const bySlot = new Map(props.items.map((i) => [i.slot, i]));

  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {slots.map((slot) => {
        const item = bySlot.get(slot);
        const borderColor = item?.rarity ? characterTheme.rarity[item.rarity] : "#52525b";
        return (
          <Pressable
            key={slot}
            testID={`slot-${slot}`}
            onPress={() => props.onSlotPress(slot)}
            style={{
              width: 96,
              height: 64,
              borderWidth: 2,
              borderColor,
              borderStyle: item ? "solid" : "dashed",
              alignItems: "center",
              justifyContent: "center",
              padding: 4,
            }}
          >
            <Text style={{ color: item ? borderColor : "#71717a" }} numberOfLines={2}>
              {item ? item.name : slot}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
```

Run: `pnpm --filter @acme/expo test PaperDoll` — iterate until it passes.
A real class silhouette + per-class positioned layout is explicitly a later
polish pass — this ships a scrollable grid that's correct, not pretty.

**Step 5: Load fonts and wire `<PaperDoll>` into the character screen**

```tsx
// apps/expo/src/app/_layout.tsx — add font loading before rendering the Stack
import { useFonts } from "expo-font";
import { Cinzel_700Bold } from "@expo-google-fonts/cinzel";
import { AlegreyaSans_400Regular } from "@expo-google-fonts/alegreya-sans";
// ...
const [fontsLoaded] = useFonts({ Cinzel_700Bold, AlegreyaSans_400Regular });
if (!fontsLoaded) return null;
```

In `apps/expo/src/app/character/[id]/index.tsx`, replace the placeholder
`character.items.map(...)` text list with:

```tsx
<PaperDoll
  characterClass={character.class}
  items={character.items}
  onSlotPress={(slot) => {
    const existing = character.items.find((i) => i.slot === slot);
    if (existing) {
      // Task 10 follow-up: navigate to a tooltip view with Re-scan/Remove.
      // For now, tapping a filled slot re-scans it directly.
    }
    router.push({ pathname: "/character/[id]/scan", params: { id, target: slot } });
  }}
/>
```

Tapping a filled slot showing the tooltip-with-Re-scan/Remove (rather than
jumping straight to scanning) is worth a follow-up screen but isn't required
for this plan's scope — note it as a known gap rather than building it now,
matching this task's "ships correct, not exhaustive" framing.

**Step 6: Typecheck, lint, run full app test suite, commit**

```bash
pnpm --filter @acme/expo typecheck
pnpm --filter @acme/expo lint
pnpm --filter @acme/expo test
git add apps/expo
git commit -m "feat: add ItemTooltip and PaperDoll rendering"
```

---

## Task 11: On-device tuning pass

Not scripted — matches the design doc's build order step 8 and Phase 3's
precedent for tuning against a live game session.

**Step 1:** Run `pnpm dev`, install on the physical Android device.

**Step 2:** Create a character, scan its header, confirm level/title/name
land correctly and `interpretBadge`'s ambiguous case surfaces the "treat as
Paragon" toggle when expected.

**Step 3:** Scan one item of each kind called out in the design doc: a
weapon, an armor piece, a jewelry piece, and a unique/aspect item. For each,
check `classifyLines`'s output against what's actually on screen — item
power, armor/dps stat rows, implicits vs. affixes, the aspect paragraph,
sockets.

**Step 4:** Tune `itemConfig.aspectColor`/`aspectColorThreshold` and
`implicitDividerGapPx` in `apps/expo/src/features/scanner/config.ts` based on
Step 3, adding the real captured blocks as new fixtures in
`apps/expo/src/features/scanner/__fixtures__/item-blocks/` and re-running
`classifyLines.test.ts` after each change.

**Step 5:** Once satisfied, commit:

```bash
git add apps/expo/src/features/scanner
git commit -m "fix: tune classifyLines thresholds against real D4 items"
```

---

## Task 12: Final workspace verification

**Step 1:** Run `pnpm -w typecheck && pnpm -w lint && pnpm -w test`
Expected: passes across `@acme/db`, `@acme/api`, `@acme/validators`,
`@acme/expo`.

**Step 2:** Run `pnpm db:migrate:remote` only after confirming with the user
that they want the remote D1 database migrated now (this touches the real
production database).

**Step 3:** Report done, and flag remaining known gaps per the design doc's
"Out of scope" and this plan's Task 10 note: portrait capture, in-place item
text editing, greater/tempered icon detection, stat/value parsing, a real
per-class paper-doll silhouette/layout (current version is a plain grid),
and the filled-slot tooltip view with Re-scan/Remove.
