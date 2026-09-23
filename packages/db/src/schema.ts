import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const ScanEvent = sqliteTable("scan_event", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export * from "./auth-schema";
