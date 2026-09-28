import { ORPCError } from "@orpc/server";
import { z } from "zod/v4";

import type { DB } from "@acme/db/client";
import type { ItemSlot } from "@acme/validators";
import { and, count, eq } from "@acme/db";
import { Character, Item } from "@acme/db/schema";
import {
  CharacterClassSchema,
  ItemLineSchema,
  ItemRaritySchema,
  ItemSlotSchema,
  slotsForClass,
} from "@acme/validators";

import { protectedProcedure } from "../orpc";

async function requireOwnedCharacter(db: DB, userId: string, id: string) {
  const character = await db.query.Character.findFirst({
    where: eq(Character.id, id),
  });
  if (character?.userId !== userId) {
    throw new ORPCError("NOT_FOUND");
  }
  return character;
}

function assertValidSlot(cls: string | null, slot: ItemSlot) {
  if (!cls) {
    throw new ORPCError("BAD_REQUEST", {
      message: "Set a class before adding items",
    });
  }
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
    .input(
      z.object({
        name: z.string().min(1).max(64).optional(),
        // Picked later, when the player adds their first item — see
        // `assertValidSlot`.
        class: CharacterClassSchema.optional(),
      }),
    )
    .handler(async ({ context, input }) => {
      return context.db
        .insert(Character)
        .values({
          userId: context.session.user.id,
          // Header scan (Task 8) fills in the real name; this default holds
          // it until then since `name` is NOT NULL.
          name: input.name ?? "New Character",
          class: input.class ?? null,
        })
        .returning()
        .get();
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(64).optional(),
        class: CharacterClassSchema.optional(),
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
      let nextParagon =
        input.paragon !== undefined ? input.paragon : character.paragon;
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
          class: input.class ?? character.class,
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
      await requireOwnedCharacter(
        context.db,
        context.session.user.id,
        input.characterId,
      );
      await context.db
        .delete(Item)
        .where(
          and(eq(Item.characterId, input.characterId), eq(Item.slot, input.slot)),
        );
    }),
};
