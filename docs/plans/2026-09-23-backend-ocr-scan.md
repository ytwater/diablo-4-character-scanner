# Backend OCR Scan (Web) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Let web users upload or paste a Diablo 4 character-sheet or item-tooltip screenshot and get back parsed fields (level/title/name, or name/type/rarity/affixes), using a Cloudflare Workers AI vision model — without touching Android's existing ML Kit pipeline.

**Architecture:** A new authenticated oRPC procedure (`scan.recognize`) accepts an image + mode, writes it to R2 only for the duration of the Workers AI call, prompts the vision model for structured JSON matching `CharacterCandidates`/`ItemCandidates`, validates the response with Zod, and deletes the R2 object before returning. Per the design amendment (see `docs/plans/2026-09-23-backend-ocr-scan-design.md`), there is **no shared extraction logic** with native — Workers AI has no bounding-box OCR model, so the model is prompted for the final structured answer directly, unlike ML Kit + `apps/expo/src/features/scanner/*`'s geometric heuristics. Only the `CharacterCandidates`/`ItemCandidates` *type shapes* are shared, via `packages/validators`. On the client, `apps/expo/src/app/scan.web.tsx` (file picker + paste handler) pairs with a new `useScan.web.ts`, mirroring the existing native screen/hook split without any `Platform.OS` branching.

**Tech Stack:** Cloudflare Workers AI (vision model), R2, D1 (rate-limit counter), oRPC, Zod, Drizzle, Expo Router web.

---

## Task 1: Add the Workers AI binding

**Files:**
- Modify: `apps/workers-api/wrangler.jsonc`
- Modify: `apps/workers-api/worker-configuration.d.ts` (regenerated, not hand-edited)

**Step 1: Add the binding**

In `apps/workers-api/wrangler.jsonc`, add an `ai` key alongside the existing `d1_databases`/`r2_buckets`:

```jsonc
	"ai": {
		"binding": "AI"
	},
```

**Step 2: Regenerate types**

Run: `pnpm -F @acme/workers-api typegen`
Expected: `apps/workers-api/worker-configuration.d.ts` now includes `AI: Ai;` in `__BaseEnv_Env`, and exits 0.

**Step 3: Verify**

Run: `pnpm -F @acme/workers-api typecheck`
Expected: passes (nothing references `env.AI` yet, this just confirms the type generation didn't break anything).

**Step 4: Commit**

```bash
git add apps/workers-api/wrangler.jsonc apps/workers-api/worker-configuration.d.ts
git commit -m "feat: add Workers AI binding to workers-api"
```

> Note: `wrangler dev` calls Workers AI for real (it's not emulated locally) — every local test run in this plan that hits `scan.recognize` consumes real Workers AI usage against your Cloudflare account. That's expected and low-cost at this volume, just don't loop it.

---

## Task 2: Shared candidate types in `packages/validators`

**Files:**
- Create: `packages/validators/src/scan.ts`
- Modify: `packages/validators/src/index.ts`
- Modify: `apps/expo/src/features/scanner/useScan.ts` → rename to `useScan.native.ts`
- Modify: `apps/expo/package.json` (add `@acme/validators` dependency)

**Step 1: Write the shared schemas**

`packages/validators/src/scan.ts`:

```ts
import { z } from "zod/v4";

export const ScanModeSchema = z.enum(["character", "item"]);
export type ScanMode = z.infer<typeof ScanModeSchema>;

export const CharacterCandidatesSchema = z.object({
  level: z.string().optional(),
  title: z.string().optional(),
  name: z.string().optional(),
});
export type CharacterCandidates = z.infer<typeof CharacterCandidatesSchema>;

export const ItemCandidatesSchema = z.object({
  name: z.string().optional(),
  type: z.string().optional(),
  rarity: z.string().optional(),
  affixes: z.array(z.string()).default([]),
});
export type ItemCandidates = z.infer<typeof ItemCandidatesSchema>;
```

**Step 2: Export from the package root**

In `packages/validators/src/index.ts`, add:

```ts
export * from "./scan";
```

(Leave the existing `unused` export alone — not part of this task.)

**Step 3: Add the dependency to `apps/expo`**

Run: `pnpm -F @acme/expo add @acme/validators@workspace:*`

**Step 4: Rename the native hook and use the shared types**

```bash
git mv apps/expo/src/features/scanner/useScan.ts apps/expo/src/features/scanner/useScan.native.ts
```

In `apps/expo/src/features/scanner/useScan.native.ts`, replace the locally-defined
`CharacterCandidates`/`ItemCandidates` interfaces with imports from `@acme/validators`:

```ts
import type { CharacterCandidates, ItemCandidates, ScanMode } from "@acme/validators";
```

Remove the old `export type ScanMode = "character" | "item";` and the two local
`export interface CharacterCandidates`/`ItemCandidates` blocks — keep everything else
(the `useScan` function body, `ScanStatus`, etc.) unchanged. Re-export `ScanMode`,
`CharacterCandidates`, `ItemCandidates` from this file too (`export type { ... }`) so
existing importers (`apps/expo/src/app/scan.native.tsx`) don't need their import paths
changed.

**Step 5: Fix importers**

`apps/expo/src/app/scan.native.tsx` imports `useScan` and types from
`~/features/scanner/useScan` — since the file is now `.native.ts` and TS/Metro resolve
that automatically for a `.native.tsx` importer, no import path change should be needed.
Confirm with typecheck.

**Step 6: Typecheck and test**

Run: `pnpm -F @acme/validators typecheck && pnpm -F @acme/expo typecheck && pnpm -F @acme/expo test`
Expected: all pass. (`anchor.test.ts`/`fields.test.ts`/`itemFields.test.ts`/`rarity.test.ts` are untouched by this rename and should still pass; `index.test.tsx` is unaffected.)

**Step 7: Commit**

```bash
git add packages/validators/src/scan.ts packages/validators/src/index.ts apps/expo/package.json pnpm-lock.yaml apps/expo/src/features/scanner/useScan.native.ts
git commit -m "feat: share scan candidate types via packages/validators"
```

---

## Task 3: `ScanEvent` table for per-user rate limiting

**Files:**
- Modify: `packages/db/src/schema.ts`
- Create: `packages/db/drizzle/0001_<generated-name>.sql` (via `drizzle-kit generate`, name auto-assigned)

**Step 1: Add the table**

In `packages/db/src/schema.ts`, add below `Post`:

```ts
export const ScanEvent = sqliteTable("scan_event", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});
```

No `createInsertSchema` needed — this table isn't user-facing, just an internal counter.

**Step 2: Generate the migration**

Run: `pnpm -F @acme/db generate`
Expected: a new file appears under `packages/db/drizzle/` (e.g.
`0001_something.sql`) containing `CREATE TABLE scan_event (...)`.

**Step 3: Apply it locally**

Run: `pnpm -F @acme/workers-api db:migrate:local`
Expected: exits 0, applies the new migration to the local D1 (`.wrangler` sqlite file).

**Step 4: Typecheck**

Run: `pnpm -F @acme/db typecheck`
Expected: passes.

**Step 5: Commit**

```bash
git add packages/db/src/schema.ts packages/db/drizzle
git commit -m "feat: add scan_event table for scan rate limiting"
```

---

## Task 4: Extend the oRPC context with AI + STORAGE bindings

**Files:**
- Modify: `packages/api/src/orpc.ts`
- Modify: `apps/workers-api/src/index.ts`

**Step 1: Extend `createORPCContext`**

In `packages/api/src/orpc.ts`, add an `env` field to the context opts and passthrough
(keep everything else — `authApi`, `session`, `db` — unchanged):

```ts
export const createORPCContext = async (opts: {
  headers: Headers;
  auth: Auth;
  db: DB;
  env: { AI: Ai; STORAGE: R2Bucket };
}) => {
  const authApi = opts.auth.api;
  const session = await authApi.getSession({
    headers: opts.headers,
  });
  return {
    authApi,
    session,
    db: opts.db,
    env: opts.env,
  };
};
```

`Ai` and `R2Bucket` are ambient global types from the Cloudflare Workers runtime types
already pulled into `worker-configuration.d.ts` — no new import needed in this file, but
confirm `packages/api`'s `tsconfig.json` can see them (it currently type-checks
`context.db`'s D1-derived types fine, so the ambient Workers types should already be in
scope via whatever `@acme/tsconfig` base does; if `Ai`/`R2Bucket` are unresolved, check
`apps/workers-api/tsconfig.json`'s `types`/`include` for how the ambient global types
reach `packages/api` and mirror that — report back if this needs a structural change
rather than guessing).

**Step 2: Pass the bindings from the Worker**

In `apps/workers-api/src/index.ts`, update the `createORPCContext` call inside
`app.all("/api/rpc/*", ...)`:

```ts
context: await createORPCContext({
  headers: c.req.raw.headers,
  auth: c.var.auth,
  db: c.var.db,
  env: { AI: c.env.AI, STORAGE: c.env.STORAGE },
}),
```

**Step 3: Typecheck**

Run: `pnpm -F @acme/api typecheck && pnpm -F @acme/workers-api typecheck`
Expected: passes.

**Step 4: Commit**

```bash
git add packages/api/src/orpc.ts apps/workers-api/src/index.ts
git commit -m "feat: expose AI and STORAGE bindings on the oRPC context"
```

---

## Task 5: `scan.recognize` procedure

**Files:**
- Create: `packages/api/src/router/scan.ts`
- Create: `packages/api/src/router/scan.test.ts`
- Modify: `packages/api/src/root.ts`
- Modify: `packages/api/package.json` (add `@acme/validators`, `zod` already present via catalog — confirm)

**Step 1: Write the failing test for the JSON-extraction helper**

The trickiest part of this procedure is turning a vision model's raw text response
(which may be clean JSON, JSON wrapped in prose/markdown fences, or garbage) into a
validated `CharacterCandidates`/`ItemCandidates`. Test that in isolation first, in
`packages/api/src/router/scan.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { parseCandidatesFromModelText } from "./scan";

describe("parseCandidatesFromModelText", () => {
  it("parses clean JSON", () => {
    const result = parseCandidatesFromModelText(
      '{"level":"50","title":"Slayer","name":"Aldric"}',
      "character",
    );
    expect(result).toEqual({ level: "50", title: "Slayer", name: "Aldric" });
  });

  it("parses JSON wrapped in a markdown code fence", () => {
    const result = parseCandidatesFromModelText(
      '```json\n{"level":"50","title":"Slayer","name":"Aldric"}\n```',
      "character",
    );
    expect(result).toEqual({ level: "50", title: "Slayer", name: "Aldric" });
  });

  it("parses JSON preceded by prose", () => {
    const result = parseCandidatesFromModelText(
      'Here is the extracted data:\n{"level":"50","title":"Slayer","name":"Aldric"}',
      "character",
    );
    expect(result).toEqual({ level: "50", title: "Slayer", name: "Aldric" });
  });

  it("returns empty candidates for unparseable text", () => {
    const result = parseCandidatesFromModelText("I cannot read this image.", "character");
    expect(result).toEqual({});
  });

  it("defaults affixes to an empty array for item mode", () => {
    const result = parseCandidatesFromModelText(
      '{"name":"Doombringer","type":"Rare Sword"}',
      "item",
    );
    expect(result).toEqual({ name: "Doombringer", type: "Rare Sword", affixes: [] });
  });

  it("throws on malformed JSON that isn't recoverable", () => {
    expect(() => parseCandidatesFromModelText("{not json", "character")).toThrow();
  });
});
```

**Step 2: Run it to confirm it fails**

Run: `pnpm -F @acme/api test -- scan.test.ts`
Expected: FAIL — `Cannot find module './scan'` or similar (the file doesn't exist yet).

**Step 3: Write `packages/api/src/router/scan.ts`**

```ts
import { z } from "zod/v4";

import { ORPCError } from "@orpc/server";
import {
  CharacterCandidatesSchema,
  ItemCandidatesSchema,
  ScanModeSchema,
  type CharacterCandidates,
  type ItemCandidates,
  type ScanMode,
} from "@acme/validators";
import { count, gt } from "@acme/db";
import { ScanEvent } from "@acme/db/schema";

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
    "Extract the item's name, type line (e.g. \"Rare Helm\"), rarity (common, magic, rare, legendary, or unique — read it from the text color), and its list of affix/aspect lines.",
    'Respond with ONLY a JSON object of this exact shape, no other text: {"name": string, "type": string, "rarity": string, "affixes": string[]}.',
    "If a field isn't visible in the image, omit that key entirely; affixes defaults to an empty array if there are none.",
  ].join(" ");
}

/** Exported for unit testing — extracts and validates the model's JSON response. */
export function parseCandidatesFromModelText(
  text: string,
  mode: ScanMode,
): CharacterCandidates | ItemCandidates {
  const jsonMatch = /\{[\s\S]*\}/.exec(text);
  if (!jsonMatch) {
    return mode === "item" ? { affixes: [] } : {};
  }

  const parsed: unknown = JSON.parse(jsonMatch[0]);
  const schema = mode === "character" ? CharacterCandidatesSchema : ItemCandidatesSchema;
  return schema.parse(parsed);
}

async function assertUnderRateLimit(db: import("@acme/db/client").DB, userId: string) {
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
  const [row] = await db
    .select({ value: count() })
    .from(ScanEvent)
    .where(gt(ScanEvent.createdAt, since));

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
        throw new ORPCError("BAD_REQUEST", { message: "Unsupported image type" });
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

        const text =
          typeof result === "object" && result !== null && "response" in result
            ? String((result as { response: unknown }).response)
            : String(result);

        try {
          return parseCandidatesFromModelText(text, input.mode);
        } catch {
          throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "OCR_FAILED" });
        }
      } catch (err) {
        if (err instanceof ORPCError) throw err;
        throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "OCR_FAILED" });
      } finally {
        await context.env.STORAGE.delete(key);
      }
    }),
};
```

> Implementation-time note: confirm the exact `env.AI.run(...)` input shape (`image` as
> a byte array vs. base64 vs. a different key name) against the actual Workers AI
> binding types for whichever model you land on — the snippet above is the documented
> shape at plan-writing time but Workers AI's per-model input schemas vary and this
> hasn't been run against a real image yet. Task 8's manual verification is where this
> gets proven out; expect to iterate on `buildPrompt` and the `AI.run` call together.

Check `@acme/db`'s exports for `count`/`gt` — if `packages/db/src/index.ts` doesn't
re-export drizzle-orm helpers, import them from `"drizzle-orm"` directly instead of
`"@acme/db"`; check `packages/db/src/index.ts` before assuming.

**Step 4: Run the test again**

Run: `pnpm -F @acme/api test -- scan.test.ts`
Expected: PASS (all 6 cases).

**Step 5: Wire into the app router**

In `packages/api/src/root.ts`:

```ts
import { authRouter } from "./router/auth";
import { postRouter } from "./router/post";
import { scanRouter } from "./router/scan";

export const appRouter = {
  auth: authRouter,
  post: postRouter,
  scan: scanRouter,
};
```

**Step 6: Add the `@acme/validators` dependency to `packages/api`**

Run: `pnpm -F @acme/api add @acme/validators@workspace:*`

**Step 7: Typecheck and full test run**

Run: `pnpm -F @acme/api typecheck && pnpm -F @acme/api test`
Expected: both pass.

**Step 8: Commit**

```bash
git add packages/api/src/router/scan.ts packages/api/src/router/scan.test.ts packages/api/src/root.ts packages/api/package.json pnpm-lock.yaml
git commit -m "feat: add scan.recognize oRPC procedure"
```

---

## Task 6: `useScan.web.ts` hook

**Files:**
- Create: `apps/expo/src/features/scanner/useScan.web.ts`

**Step 1: Write the hook**

Mirrors `useScan.native.ts`'s public shape (`candidates`, `status`, `error`, `retake`)
but replaces camera capture with accepting an already-selected `File`/`Blob`:

```ts
import { useState } from "react";

import type { CharacterCandidates, ItemCandidates, ScanMode } from "@acme/validators";

import { orpc } from "~/utils/api";

export type ScanStatus = "idle" | "processing" | "done" | "error";

export function useScan(mode: ScanMode) {
  const [candidates, setCandidates] = useState<CharacterCandidates | ItemCandidates>(
    mode === "item" ? { affixes: [] } : {},
  );
  const [status, setStatus] = useState<ScanStatus>("idle");
  const [error, setError] = useState<string | undefined>();

  const scanFile = async (file: File) => {
    setStatus("processing");
    setError(undefined);
    try {
      const result = await orpc.scan.recognize.call({ mode, image: file });
      setCandidates(result);
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  };

  const retake = () => {
    setCandidates(mode === "item" ? { affixes: [] } : {});
    setError(undefined);
    setStatus("idle");
  };

  return { candidates, status, error, scanFile, retake };
}
```

> Check whether `orpc.scan.recognize.call(...)` is the right invocation form for a
> non-query/mutation-hook direct call in this codebase's oRPC + TanStack Query setup —
> `apps/expo/src/utils/api.web.ts`'s `orpc` is built via `createTanstackQueryUtils`,
> which is designed around `.queryOptions()`/`.mutationOptions()` for use with
> `useQuery`/`useMutation`, not a bare imperative call. Likely fix: use
> `useMutation(orpc.scan.recognize.mutationOptions())` inside this hook instead (matching
> the pattern `apps/web`'s old `CreatePostForm`/`useScan.native.ts`-equivalent used for
> `post.create`), and drive `scanFile` through `mutate`/`mutateAsync`. Adjust this hook
> to whichever form actually typechecks and works — don't force the sketch above if it
> doesn't fit oRPC's actual API.

**Step 2: Typecheck**

Run: `pnpm -F @acme/expo typecheck`
Expected: passes once the invocation form above is corrected to match actual oRPC usage.

**Step 3: Commit**

```bash
git add apps/expo/src/features/scanner/useScan.web.ts
git commit -m "feat: add useScan.web hook for upload-based scanning"
```

---

## Task 7: `scan.web.tsx` screen — file picker + paste

**Files:**
- Create: `apps/expo/src/app/scan.web.tsx`

This is a `.web.tsx`-only file (Metro resolves it only for the web platform, mirroring
`scan.native.tsx`'s native-only resolution — no `Platform.OS` check needed since nothing
imports both). Since it's web-only, plain HTML elements (`<input>`) are fine — Expo web
renders through react-dom directly.

**Step 1: Write the screen**

```tsx
import { useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Stack } from "expo-router";

import { itemConfig } from "~/features/scanner/config";
import { useScan } from "~/features/scanner/useScan";
import type { CharacterCandidates, ItemCandidates, ScanMode } from "@acme/validators";

export default function ScanWebScreen() {
  const [mode, setMode] = useState<ScanMode>("character");
  const { candidates, status, error, scanFile, retake } = useScan(mode);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File | null | undefined) => {
    if (file) void scanFile(file);
  };

  const characterCandidates = candidates as CharacterCandidates;
  const itemCandidates = candidates as ItemCandidates;

  return (
    <View className="bg-background h-full w-full items-center justify-center p-4">
      <Stack.Screen options={{ title: "Scan" }} />
      <Text className="text-foreground pb-4 text-2xl font-bold">Scan a screenshot</Text>

      <View className="mb-4 flex-row gap-2">
        {(["character", "item"] as const).map((m) => (
          <Pressable
            key={m}
            onPress={() => setMode(m)}
            className="rounded-full px-4 py-2"
            style={{ backgroundColor: mode === m ? "#22d3ee" : "rgba(0,0,0,0.2)" }}
          >
            <Text className="text-sm font-semibold capitalize">{m}</Text>
          </Pressable>
        ))}
      </View>

      <div
        onPaste={(e) => {
          const item = Array.from(e.clipboardData?.items ?? []).find((i) =>
            i.type.startsWith("image/"),
          );
          handleFile(item?.getAsFile());
        }}
        style={{
          border: "2px dashed #888",
          borderRadius: 8,
          padding: 32,
          textAlign: "center",
          width: "100%",
          maxWidth: 480,
        }}
      >
        <p>Paste a screenshot here, or</p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </div>

      {status === "processing" && <Text className="mt-4">Scanning…</Text>}

      {status === "done" && mode === "character" && (
        <View className="mt-4">
          <Text>Level: {characterCandidates.level ?? "—"}</Text>
          <Text>Title: {characterCandidates.title ?? "—"}</Text>
          <Text>Name: {characterCandidates.name ?? "—"}</Text>
          <Pressable onPress={retake} className="mt-2 rounded-full bg-cyan-400 px-6 py-3">
            <Text>Scan another</Text>
          </Pressable>
        </View>
      )}

      {status === "done" && mode === "item" && (
        <View className="mt-4">
          <Text>Name: {itemCandidates.name ?? "—"}</Text>
          <Text>Rarity: {itemCandidates.rarity ?? "—"}</Text>
          <Text>Type: {itemCandidates.type ?? "—"}</Text>
          <Text>Affixes:</Text>
          {itemCandidates.affixes.length === 0 ? (
            <Text>—</Text>
          ) : (
            itemCandidates.affixes.map((affix, i) => <Text key={i}>{affix}</Text>)
          )}
          <Pressable onPress={retake} className="mt-2 rounded-full bg-cyan-400 px-6 py-3">
            <Text>Scan another</Text>
          </Pressable>
        </View>
      )}

      {status === "error" && (
        <View className="mt-4">
          <Text className="text-destructive">Error: {error}</Text>
          <Pressable onPress={retake} className="mt-2 rounded-full bg-cyan-400 px-6 py-3">
            <Text>Try again</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
```

`itemConfig` is imported but unused above if you don't end up needing it here (it was
only relevant to native's ROI overlay) — remove the import if the linter flags it
unused.

**Step 2: Link to it from the home screen on web**

In `apps/expo/src/components/scan-link.web.tsx` (currently returns `null` — see the
Expo web migration's Task 5-equivalent fix), replace the stub with a real link now that
the web route exists:

```tsx
import { Link } from "expo-router";

export function ScanLink() {
  return (
    <Link href="/scan" className="py-2 text-center" style={{ color: "#ec4899" }}>
      Scan character sheet
    </Link>
  );
}
```

Note `scan-link.native.tsx` needed an `as Href` cast because expo-router's generated
route types are produced by whichever platform's dev-server watcher last ran and don't
reliably include platform-suffixed routes — apply the same cast here if `pnpm -F
@acme/expo typecheck` flags `"/scan"` as an invalid `Href` for the web variant too.

**Step 3: Typecheck**

Run: `pnpm -F @acme/expo typecheck`
Expected: passes.

**Step 4: Commit**

```bash
git add apps/expo/src/app/scan.web.tsx apps/expo/src/components/scan-link.web.tsx
git commit -m "feat: add web scan screen with file upload and paste"
```

---

## Task 8: Manual verification against real screenshots

Not scripted — this is where the vision model/prompt actually gets proven out or fixed.

**Step 1:** Run `pnpm -F @acme/workers-api dev` and `pnpm -F @acme/expo dev` (press `w`
for web).

**Step 2:** Take (or find) a real Diablo 4 character-sheet screenshot and a real item
tooltip screenshot — reusing images from `apps/expo/src/features/scanner/__fixtures__/`
if any raw screenshots (not just OCR-block JSON fixtures) exist there, otherwise capture
fresh ones from the game or ask the user for sample images.

**Step 3:** On the web scan screen: upload the character screenshot in character mode,
confirm level/title/name come back reasonably correct. Switch to item mode, upload the
item screenshot, confirm name/type/rarity/affixes come back reasonably correct
(rarity in particular — the model is reading color visually, unlike native's measured
RGB-distance classifier, so expect this to need prompt iteration).

**Step 4:** Test the paste path (copy an image to the clipboard, paste into the drop
zone) — confirms the `onPaste` handler works, not just file-input.

**Step 5:** Test error paths: upload a non-image file (should reject with a clear
message), upload a screenshot of something unrelated (should return empty/partial
candidates without crashing), sign out and confirm `scan.recognize` is unreachable
(oRPC auth error, not a raw 500).

**Step 6:** Trigger the rate limit: call `scan.recognize` more than
`RATE_LIMIT_MAX_SCANS` times within a minute (a quick loop of file uploads works) and
confirm it's rejected with `TOO_MANY_REQUESTS` rather than silently succeeding forever.

**Step 7:** Iterate on `buildPrompt`/`VISION_MODEL` in `packages/api/src/router/scan.ts`
based on what Steps 3–4 show, re-testing after each change. Don't move on until both
modes return usably-accurate results on the test screenshots.

**Step 8:** Once satisfied, commit any prompt/model tuning changes:

```bash
git add packages/api/src/router/scan.ts
git commit -m "fix: tune scan.recognize prompt against real D4 screenshots"
```

---

## Task 9: Final workspace verification

**Step 1:** Run `pnpm -w typecheck && pnpm -w lint && pnpm -w test`
Expected: passes (the two pre-existing unrelated lint failures from the Expo web
migration — `workers-api/src/index.ts`, `anchor.ts` — may still be present if not yet
fixed separately; everything touched by this plan should be clean).

**Step 2:** Report done, and flag that `RATE_LIMIT_MAX_SCANS`/`RATE_LIMIT_WINDOW_MS`
and the exact vision model/prompt are tuned defaults, not final — revisit after real
usage.
