import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { InferRouterInitialContext } from "@orpc/server";
import { call, ORPCError } from "@orpc/server";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";

import type { DB } from "@acme/db/client";
import * as schema from "@acme/db/schema";

import { characterRouter } from "./character";

// Test-only harness: this repo has no existing D1/Miniflare test harness
// (checked scan.test.ts and the wider codebase — neither miniflare,
// better-sqlite3, nor @cloudflare/vitest-pool-workers were wired up
// anywhere before this file). better-sqlite3 + drizzle-orm/better-sqlite3
// implements the same Drizzle SQLite-dialect query-builder API
// (`.query.X.findMany`, `.insert().returning().get()`, etc.) as the real
// `DB` type from `@acme/db/client` (drizzle-orm/d1), so it stands in for a
// real D1 binding here without pulling in Miniflare/Workers runtime. The
// router code itself only ever imports the `DB` type, never this driver.
const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../db/drizzle",
);

function createTestDb(): DB {
  const sqlite = new Database(":memory:");
  // D1/production enforces the FK `ON DELETE CASCADE`s declared in the
  // schema; better-sqlite3 does not enforce foreign keys unless told to.
  sqlite.pragma("foreign_keys = ON");

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf-8");
    sqlite.exec(sql.replaceAll("--> statement-breakpoint", ""));
  }

  return drizzle(sqlite, { schema, casing: "snake_case" }) as unknown as DB;
}

type CharacterRouterContext = InferRouterInitialContext<typeof characterRouter>;

function contextFor(userId: string, db: DB): CharacterRouterContext {
  return {
    db,
    session: { user: { id: userId } },
  } as CharacterRouterContext;
}

async function seedUser(db: DB, id: string) {
  await db.insert(schema.user).values({
    id,
    name: "Test",
    email: `${id}@example.com`,
    emailVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

describe("character router", () => {
  let db: DB;

  beforeEach(async () => {
    db = createTestDb();
    await seedUser(db, "user-1");
    await seedUser(db, "user-2");
  });

  it("creates and lists only the caller's characters", async () => {
    const ctx = contextFor("user-1", db);
    await call(
      characterRouter.create,
      { name: "Lilith", class: "sorcerer" },
      { context: ctx },
    );
    const list = await call(characterRouter.list, undefined, { context: ctx });
    expect(list).toHaveLength(1);
    expect(list[0]?.name).toBe("Lilith");
  });

  it("returns NOT_FOUND for another user's character", async () => {
    const owner = contextFor("user-1", db);
    const created = await call(
      characterRouter.create,
      { name: "Lilith", class: "sorcerer" },
      { context: owner },
    );
    const intruder = contextFor("user-2", db);
    await expect(
      call(characterRouter.byId, { id: created.id }, { context: intruder }),
    ).rejects.toThrow(ORPCError);
  });

  it("rejects a slot the class doesn't have", async () => {
    const ctx = contextFor("user-1", db);
    const created = await call(
      characterRouter.create,
      { name: "Lilith", class: "sorcerer" },
      { context: ctx },
    );
    await expect(
      call(
        characterRouter.upsertItem,
        {
          characterId: created.id,
          slot: "twoHandSlashing", // barbarian-only
          name: "Whatever",
          lines: [],
        },
        { context: ctx },
      ),
    ).rejects.toThrow(ORPCError);
  });

  it("upserts the same slot instead of duplicating", async () => {
    const ctx = contextFor("user-1", db);
    const created = await call(
      characterRouter.create,
      { name: "Lilith", class: "sorcerer" },
      { context: ctx },
    );
    await call(
      characterRouter.upsertItem,
      { characterId: created.id, slot: "helm", name: "Old Helm", lines: [] },
      { context: ctx },
    );
    await call(
      characterRouter.upsertItem,
      { characterId: created.id, slot: "helm", name: "New Helm", lines: [] },
      { context: ctx },
    );
    const full = await call(
      characterRouter.byId,
      { id: created.id },
      { context: ctx },
    );
    expect(full.items.filter((i) => i.slot === "helm")).toHaveLength(1);
    expect(full.items.find((i) => i.slot === "helm")?.name).toBe("New Helm");
  });

  it("enforces the paragon/level-70 rule", async () => {
    const ctx = contextFor("user-1", db);
    const created = await call(
      characterRouter.create,
      { name: "Lilith", class: "sorcerer" },
      { context: ctx },
    );
    await expect(
      call(
        characterRouter.update,
        { id: created.id, level: 50, paragon: 10 },
        { context: ctx },
      ),
    ).rejects.toThrow(ORPCError);
  });

  it("clears paragon when level drops below 70", async () => {
    const ctx = contextFor("user-1", db);
    const created = await call(
      characterRouter.create,
      { name: "Lilith", class: "sorcerer" },
      { context: ctx },
    );
    await call(
      characterRouter.update,
      { id: created.id, level: 70, paragon: 20 },
      { context: ctx },
    );
    const dropped = await call(
      characterRouter.update,
      { id: created.id, level: 60 },
      { context: ctx },
    );
    expect(dropped.level).toBe(60);
    expect(dropped.paragon).toBeNull();
  });

  it("cascades item deletes when a character is deleted", async () => {
    const ctx = contextFor("user-1", db);
    const created = await call(
      characterRouter.create,
      { name: "Lilith", class: "sorcerer" },
      { context: ctx },
    );
    await call(
      characterRouter.upsertItem,
      { characterId: created.id, slot: "helm", name: "Helm", lines: [] },
      { context: ctx },
    );
    await call(characterRouter.delete, { id: created.id }, { context: ctx });
    await expect(
      call(characterRouter.byId, { id: created.id }, { context: ctx }),
    ).rejects.toThrow(ORPCError);
  });
});
