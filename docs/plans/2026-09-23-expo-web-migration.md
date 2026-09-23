# Expo Web Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Replace `apps/web` (Vite SPA) with a web target on `apps/expo` (Expo Router + Metro + react-native-web), preserving the home/post/reset-password/auth functionality, then delete `apps/web`.

**Architecture:** `apps/expo/src/app/*` already uses Expo Router file-based routing with cross-platform React Native primitives (View/Text/Pressable) styled with NativeWind, which render to real DOM via `react-native-web` when Metro bundles for the `web` platform — so the existing `index.tsx` and `post/[id].tsx` screens work on web largely unchanged. The pieces that genuinely differ between native and web (auth client config, API base URL, cookie handling) get split into `.native.ts`/`.web.ts` files resolved automatically by Metro's platform-extension resolution — no `Platform.OS` branches. A new `reset-password.tsx` screen is added (native has no equivalent today). Web deploys as static Worker assets via its own `wrangler.jsonc`, mirroring how `apps/web` deploys today.

**Tech Stack:** Expo Router, Metro (`bundler: "metro"`, web output), react-native-web, NativeWind, Better Auth, oRPC, Cloudflare Workers (static assets).

---

## Task 1: Add the web platform to Expo config

**Files:**
- Modify: `apps/expo/app.config.ts`
- Modify: `apps/expo/package.json`

**Step 1: Install web deps**

Run: `pnpm -F @acme/expo add react-native-web @expo/metro-runtime`

Expected: `react-native-web` and `@expo/metro-runtime` added to `apps/expo/package.json` dependencies. (`react-dom` is already present.)

**Step 2: Add web config to `app.config.ts`**

Add a `web` key alongside the existing `ios`/`android` keys in `apps/expo/app.config.ts`:

```ts
  web: {
    bundler: "metro",
    output: "static",
  },
```

**Step 3: Verify web export works with the existing (unported) app**

Run: `pnpm -F @acme/expo exec expo export -p web`
Expected: exits 0, produces `apps/expo/dist/` with an `index.html` and JS bundle. It's fine that `index.tsx` still uses native-only pieces at this point — later tasks fix those; this step just proves the web bundler/platform wiring is in place. If it fails on `expo-secure-store`/`expo-build-properties`-style native module resolution, note the failing import for Task 2/3.

**Step 4: Commit**

```bash
git add apps/expo/app.config.ts apps/expo/package.json pnpm-lock.yaml
git commit -m "feat: add web platform target to Expo app"
```

---

## Task 2: Split `utils/base-url.ts` into native/web variants

**Files:**
- Create: `apps/expo/src/utils/base-url.web.ts`
- Modify: `apps/expo/src/utils/base-url.ts` → rename to `apps/expo/src/utils/base-url.native.ts`

**Step 1: Rename the existing file**

```bash
git mv apps/expo/src/utils/base-url.ts apps/expo/src/utils/base-url.native.ts
```

**Step 2: Write `base-url.web.ts`**

Mirrors `apps/web/src/lib/api.ts`'s `getApiUrl()`, but using Expo's public-env convention (`EXPO_PUBLIC_` prefix, inlined by Metro at build time) instead of Vite's `import.meta.env`:

```ts
export const getBaseUrl = () => {
  const url = process.env.EXPO_PUBLIC_API_URL;
  if (!url) {
    throw new Error("EXPO_PUBLIC_API_URL is not set");
  }
  return url;
};
```

**Step 3: Add env files**

Create `apps/expo/.env.example`:
```
EXPO_PUBLIC_API_URL=http://localhost:8787
```

Ask the user for the production API URL value (matches `apps/web/.env.production`'s `VITE_API_URL`, i.e. `https://diablo-4-character-scanner-api.ytwater.workers.dev`) and create `apps/expo/.env.production` with it — do not guess or commit a placeholder into a tracked example file's production sibling without confirming.

**Step 4: Typecheck**

Run: `pnpm -F @acme/expo typecheck`
Expected: no new errors related to `base-url`.

**Step 5: Commit**

```bash
git add apps/expo/src/utils/base-url.native.ts apps/expo/src/utils/base-url.web.ts apps/expo/.env.example
git commit -m "feat: split Expo API base URL resolution into native/web variants"
```

(Commit `.env.production` separately only if the user confirms it should be tracked — check how `apps/web/.env.production` was handled; it shows as untracked `??` in git status, so likely `.gitignore`d. Verify with `git check-ignore apps/web/.env.production` before adding `apps/expo/.env.production` to git.)

---

## Task 3: Split `utils/auth.ts` into native/web variants

**Files:**
- Create: `apps/expo/src/utils/auth.web.ts`
- Modify: `apps/expo/src/utils/auth.ts` → rename to `apps/expo/src/utils/auth.native.ts`

**Step 1: Rename**

```bash
git mv apps/expo/src/utils/auth.ts apps/expo/src/utils/auth.native.ts
```

**Step 2: Write `auth.web.ts`**

Mirrors `apps/web/src/lib/auth.ts` — plain browser cookie-based session, no `expoClient`/`SecureStore`:

```ts
import { createAuthClient } from "better-auth/react";

import { getBaseUrl } from "./base-url";

export const authClient = createAuthClient({
  baseURL: getBaseUrl(),
  fetchOptions: {
    credentials: "include",
  },
});
```

**Step 3: Typecheck**

Run: `pnpm -F @acme/expo typecheck`
Expected: no new errors. Confirm every importer of `~/utils/auth` (currently `apps/expo/src/app/index.tsx`) resolves through the extensionless `~/utils/auth` import — Metro/TS pick `.native.ts` or `.web.ts` per platform automatically since `tsconfig.json` already sets `"moduleSuffixes": [".ios", ".android", ".native", ""]`. Web resolution needs `.web` added too — see Task 3a below if TS can't resolve it.

**Step 3a: Fix tsconfig moduleSuffixes if needed**

If `pnpm -F @acme/expo typecheck` reports it can't find `~/utils/auth` when only `.native.ts`/`.web.ts` exist (no bare `.ts`), add `.web` to `moduleSuffixes` in `apps/expo/tsconfig.json`:

```json
"moduleSuffixes": [".ios", ".android", ".native", ".web", ""],
```

**Step 4: Commit**

```bash
git add apps/expo/src/utils/auth.native.ts apps/expo/src/utils/auth.web.ts apps/expo/tsconfig.json
git commit -m "feat: split Expo auth client into native/web variants"
```

---

## Task 4: Split `utils/api.ts` into native/web variants

**Files:**
- Create: `apps/expo/src/utils/api.web.ts`
- Modify: `apps/expo/src/utils/api.tsx` (confirm actual extension — Read it first) → rename to `apps/expo/src/utils/api.native.ts`

**Step 1: Check the current file's exact extension and rename**

```bash
ls apps/expo/src/utils/api.*
git mv apps/expo/src/utils/api.ts apps/expo/src/utils/api.native.ts   # adjust extension if .tsx
```

**Step 2: Write `api.web.ts`**

Same shape as `apps/web/src/lib/api.ts`, using `credentials: "include"` instead of a manual `Cookie` header (browsers handle cookies automatically), source header updated for provenance:

```ts
import type { RouterClient } from "@orpc/server";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { QueryClient } from "@tanstack/react-query";

import type { AppRouter } from "@acme/api";

import { getBaseUrl } from "./base-url";

export const queryClient = new QueryClient();

const link = new RPCLink({
  url: `${getBaseUrl()}/api/rpc`,
  fetch(request, init) {
    return globalThis.fetch(request, {
      ...init,
      credentials: "include",
    });
  },
  headers() {
    return {
      "x-orpc-source": "expo-web",
    };
  },
});

export const client: RouterClient<AppRouter> = createORPCClient(link);

export const orpc = createTanstackQueryUtils(client);

export type { RouterInputs, RouterOutputs } from "@acme/api";
```

**Step 3: Typecheck**

Run: `pnpm -F @acme/expo typecheck`
Expected: no new errors. `_layout.tsx` imports `queryClient` from `~/utils/api` — confirm it still resolves on both platforms.

**Step 4: Commit**

```bash
git add apps/expo/src/utils/api.native.ts apps/expo/src/utils/api.web.ts
git commit -m "feat: split Expo oRPC client into native/web variants"
```

---

## Task 5: Add the reset-password screen

**Files:**
- Create: `apps/expo/src/app/reset-password.tsx`

Native has no equivalent screen today (password reset is inherently a web-link flow), but the file is a normal cross-platform route — no `.native`/`.web` split needed since it uses only `expo-router` + RN primitives + `authClient`, all of which already resolve correctly per platform.

**Step 1: Write the screen**, adapted from `apps/web/src/routes/reset-password.tsx` using RN primitives and `expo-router`'s `useLocalSearchParams`/`Link` instead of `react-router-dom`:

```tsx
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link, Stack, useLocalSearchParams } from "expo-router";

import { authClient } from "~/utils/auth";

export default function ResetPasswordScreen() {
  const { token, error } = useLocalSearchParams<{
    token?: string;
    error?: string;
  }>();

  const [newPassword, setNewPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  if (!token || error) {
    return (
      <SafeAreaView className="bg-background">
        <Stack.Screen options={{ title: "Reset password" }} />
        <View className="h-full w-full items-center justify-center gap-4 p-4">
          <Text className="text-destructive text-center">
            This reset link is invalid or has expired.
          </Text>
          <Link href="/" className="text-primary">
            Back to home
          </Link>
        </View>
      </SafeAreaView>
    );
  }

  const submit = async () => {
    setStatus("idle");
    setMessage(null);
    const res = await authClient.resetPassword({ newPassword, token });
    if (res.error) {
      setStatus("error");
      setMessage(res.error.message ?? "Failed to reset password");
      return;
    }
    setStatus("success");
  };

  if (status === "success") {
    return (
      <SafeAreaView className="bg-background">
        <Stack.Screen options={{ title: "Reset password" }} />
        <View className="h-full w-full items-center justify-center gap-4 p-4">
          <Text className="text-foreground">Your password has been reset.</Text>
          <Link href="/" className="text-primary">
            Sign in
          </Link>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="bg-background">
      <Stack.Screen options={{ title: "Reset password" }} />
      <View className="h-full w-full gap-2 p-4">
        <Text className="text-foreground pb-2 text-center text-2xl font-bold">
          Reset your password
        </Text>
        <TextInput
          className="border-input bg-background text-foreground items-center rounded-md border px-3 text-lg leading-tight"
          value={newPassword}
          onChangeText={setNewPassword}
          placeholder="New password"
          secureTextEntry
        />
        {message && <Text className="text-destructive">{message}</Text>}
        <Pressable
          onPress={submit}
          className="bg-primary items-center rounded-sm p-2"
        >
          <Text>Reset password</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
```

**Step 2: Verify the route is reachable**

Run: `pnpm -F @acme/expo exec expo export -p web` (or `pnpm -F @acme/expo dev` and open the web target)
Expected: `dist/reset-password/index.html` (or equivalent) is generated / the route loads.

**Step 3: Commit**

```bash
git add apps/expo/src/app/reset-password.tsx
git commit -m "feat: add reset-password screen to Expo app"
```

---

## Task 6: Manual verification against apps/web parity

Not a scripted test — run the Expo web dev server and click through it against what `apps/web` does today, per the design doc.

**Step 1:** Run `pnpm -F @acme/workers-api dev` in one terminal (API), `pnpm -F @acme/expo dev` in another, press `w` to open web.

**Step 2:** Verify:
- Home screen loads, shows title, post list, create-post form.
- Google sign-in redirect flow works (uses `WEB_APP_URL`/`AUTH_PRODUCTION_URL` trusted-origin config already in `packages/auth`/`apps/workers-api` — confirm the local dev web origin, e.g. `http://localhost:8081`, is trusted; add it to `apps/workers-api/.dev.vars` `WEB_APP_URL` if the sign-in redirect is rejected).
- Email/password sign in, sign up, sign out all work.
- "Forgot password" sends a reset email; the link opens `reset-password` screen with a valid token and completes successfully.
- Creating and deleting a post works and invalidates the list.
- Visiting a post detail route (`/post/[id]`) shows the right content.

**Step 3:** Fix anything broken before proceeding to Task 7. Do not delete `apps/web` until this step passes.

---

## Task 7: Set up web deploy for `apps/expo`

**Files:**
- Create: `apps/expo/wrangler.jsonc`
- Modify: `apps/expo/package.json` (add `deploy`/`build:web` scripts)

**Step 1: Write `wrangler.jsonc`**, mirroring `apps/web/wrangler.jsonc`:

```jsonc
{
	"$schema": "./node_modules/wrangler/config-schema.json",
	"name": "diablo-4-character-scanner",
	"compatibility_date": "2025-09-17",
	"assets": {
		"directory": "./dist",
		"not_found_handling": "single-page-application"
	}
}
```

**Step 2: Add scripts** to `apps/expo/package.json`:

```json
"build:web": "expo export -p web",
"deploy": "pnpm build:web && wrangler deploy"
```

Also add `wrangler` as a devDependency (matching `apps/web`'s `"wrangler": "^4.38.0"`):
Run: `pnpm -F @acme/expo add -D wrangler@^4.38.0`

**Step 3: Verify deploy build locally**

Run: `pnpm -F @acme/expo build:web && pnpm -F @acme/expo exec wrangler deploy --dry-run`
Expected: dry run succeeds, no config errors.

**Step 4: Commit**

```bash
git add apps/expo/wrangler.jsonc apps/expo/package.json pnpm-lock.yaml
git commit -m "feat: add Cloudflare Workers static deploy for Expo web"
```

**Step 5: Confirm with the user before actually deploying** — this creates/updates a Cloudflare Worker (`diablo-4-character-scanner`, same name as the current `apps/web` Worker). Don't run `pnpm -F @acme/expo deploy` without explicit go-ahead, since it affects the live production origin `apps/web`'s Worker currently serves.

---

## Task 8: Delete `apps/web` and clean up workspace references

**Files:**
- Delete: `apps/web/` (entire directory)
- Modify: root `package.json` (remove `dev:web` script or repoint it)
- Modify: `turbo.json` if `VITE_API_URL` is now unused in `globalEnv`

**Step 1: Remove the directory**

```bash
git rm -r apps/web
```

**Step 2: Update root `package.json`**

Change:
```json
"dev:web": "turbo watch dev -F @acme/web...",
```
to:
```json
"dev:web": "turbo watch dev -F @acme/expo...",
```

**Step 3: Update `turbo.json` `globalEnv`**

Remove `"VITE_API_URL"` from `globalEnv` (no longer referenced anywhere) — grep first to confirm:
Run: `grep -rn "VITE_API_URL" apps packages --include="*.ts*" --include="*.json*"`
Expected: no remaining references outside `turbo.json` itself.

**Step 4: Workspace-wide checks**

Run: `pnpm install` (updates lockfile for the removed workspace package), then `pnpm lint:ws`
Expected: `pnpm install` succeeds, `sherif` reports no new issues (e.g. no dangling workspace references to `@acme/web`).

Run: `pnpm -w typecheck` and `pnpm -w lint`
Expected: pass across the workspace with `apps/web` gone.

**Step 5: Update README**

`README.md` references `apps/web` in the repo-layout section and setup instructions — check current content and update:
```
apps
  ├─ expo           Expo SDK 54 (oRPC + Better Auth clients, native + web)
  └─ workers-api    Cloudflare Worker (Hono) → /api/rpc, /api/auth
```
Remove any Vite-specific setup steps (`VITE_API_URL` env var mention, `pnpm -F @acme/web dev`, etc.), replace with Expo web equivalents (`EXPO_PUBLIC_API_URL`, `pnpm dev:web`).

**Step 6: Commit**

```bash
git add -A
git commit -m "chore: remove apps/web, Expo web is now the web client"
```

---

## Task 9: Final full-workspace verification

**Step 1:** Run `pnpm -w build && pnpm -w typecheck && pnpm -w lint && pnpm -w test`
Expected: all pass.

**Step 2:** Re-run Task 6's manual click-through one more time against the final state (post-deletion) to catch anything the deletion broke (e.g. a stray import of something that lived in `apps/web`).

**Step 3:** Report done. Deploying to production (Task 7 Step 5) remains a separate, explicitly-confirmed action.
