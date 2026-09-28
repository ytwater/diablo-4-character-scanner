import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { user } from "./auth-schema";

export const ScanEvent = sqliteTable("scan_event", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const Character = sqliteTable("character", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  // Nullable: class is picked after creation, when the player adds their
  // first item (see character router's `assertValidSlot`).
  class: text("class"),
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

export * from "./auth-schema";
