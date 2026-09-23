import { ORPCError } from "@orpc/server";
import { z } from "zod/v4";

import type { DB } from "@acme/db/client";
import type {
  CharacterCandidates,
  ItemCandidates,
  ScanMode,
} from "@acme/validators";
import { and, count, eq, gt } from "@acme/db";
import { ScanEvent } from "@acme/db/schema";
import {
  CharacterCandidatesSchema,
  ItemCandidatesSchema,
  ScanModeSchema,
} from "@acme/validators";

import { protectedProcedure } from "../orpc";

const RATE_LIMIT_MAX_SCANS = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

// Workers AI vision model. Revisit after evaluating real D4 screenshots — see
// docs/plans/2026-09-23-backend-ocr-scan-design.md's open items.
const VISION_MODEL = "@cf/meta/llama-3.2-11b-vision-instruct";

function buildPrompt(mode: ScanMode): string {
  if (mode === "character") {
    return [
      "You are reading a screenshot of a Diablo 4 character sheet.",
      "Extract the character's level, title, and name.",
      'Respond with ONLY a JSON object of this exact shape, no other text: {"level": string, "title": string, "name": string}.',
      "If a field isn't visible in the image, omit that key entirely.",
    ].join(" ");
  }
  return [
    "You are reading a screenshot of a Diablo 4 item tooltip.",
    'Extract the item\'s name, type line (e.g. "Rare Helm"), rarity (common, magic, rare, legendary, or unique — read it from the text color), and its list of affix/aspect lines.',
    'Respond with ONLY a JSON object of this exact shape, no other text: {"name": string, "type": string, "rarity": string, "affixes": string[]}.',
    "If a field isn't visible in the image, omit that key entirely; affixes defaults to an empty array if there are none.",
  ].join(" ");
}

/** Exported for unit testing — extracts and validates the model's JSON response. */
export function parseCandidatesFromModelText(
  text: string,
  mode: ScanMode,
): CharacterCandidates | ItemCandidates {
  const start = text.indexOf("{");
  if (start === -1) {
    // No JSON-shaped content at all — the model didn't even attempt structured
    // output (e.g. "I cannot read this image."). Treat as empty candidates
    // rather than an error.
    return mode === "item" ? { affixes: [] } : {};
  }

  // Prefer a balanced-looking `{...}` slice (handles prose/fences around the
  // JSON); fall back to everything from the first `{` onward so malformed
  // JSON still surfaces as a parse error instead of silently vanishing.
  const jsonMatch = /\{[\s\S]*\}/.exec(text);
  const candidate = jsonMatch ? jsonMatch[0] : text.slice(start);

  const parsed: unknown = JSON.parse(candidate);
  const schema =
    mode === "character" ? CharacterCandidatesSchema : ItemCandidatesSchema;
  return schema.parse(parsed);
}

async function assertUnderRateLimit(db: DB, userId: string) {
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
  const [row] = await db
    .select({ value: count() })
    .from(ScanEvent)
    .where(and(eq(ScanEvent.userId, userId), gt(ScanEvent.createdAt, since)));

  if ((row?.value ?? 0) >= RATE_LIMIT_MAX_SCANS) {
    throw new ORPCError("TOO_MANY_REQUESTS");
  }
}

export const scanRouter = {
  recognize: protectedProcedure
    .input(
      z.object({
        mode: ScanModeSchema,
        image: z.instanceof(Blob),
      }),
    )
    .handler(async ({ context, input }) => {
      const userId = context.session.user.id;

      if (input.image.size === 0 || input.image.size > MAX_IMAGE_BYTES) {
        throw new ORPCError("BAD_REQUEST", { message: "Invalid image size" });
      }
      if (!ALLOWED_IMAGE_TYPES.has(input.image.type)) {
        throw new ORPCError("BAD_REQUEST", {
          message: "Unsupported image type",
        });
      }

      await assertUnderRateLimit(context.db, userId);
      await context.db.insert(ScanEvent).values({ userId });

      const key = `scan/${userId}/${crypto.randomUUID()}`;
      const bytes = new Uint8Array(await input.image.arrayBuffer());
      await context.env.STORAGE.put(key, bytes, {
        httpMetadata: { contentType: input.image.type },
      });

      try {
        const result = await context.env.AI.run(VISION_MODEL, {
          image: Array.from(bytes),
          prompt: buildPrompt(input.mode),
          max_tokens: 512,
        });

        const text = result.response ?? "";

        try {
          return parseCandidatesFromModelText(text, input.mode);
        } catch {
          throw new ORPCError("INTERNAL_SERVER_ERROR", {
            message: "OCR_FAILED",
          });
        }
      } catch (err) {
        if (err instanceof ORPCError) throw err;
        throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "OCR_FAILED" });
      } finally {
        await context.env.STORAGE.delete(key);
      }
    }),
};
