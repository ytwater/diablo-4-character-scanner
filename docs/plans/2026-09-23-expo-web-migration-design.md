# Phase 1: Migrate web app from Vite to Expo web

## Why

`apps/web` (Vite + React SPA) and `apps/expo` (Expo/React Native) are two separate UI
toolchains in the monorepo. `apps/web` is currently thin (auth showcase, posts demo,
password reset) with no scan feature yet. Consolidating onto Expo web
(`react-native-web` via Metro) removes a whole build toolchain and lets mobile and web
share screens, routes, and `packages/ui` components going forward — driven by wanting a
simpler monorepo, not by needing web-specific behavior today.

This phase is scoped to migrating the *existing* `apps/web` functionality onto Expo web.
It does not include the browser-upload OCR scan feature — see the follow-up design doc
for that (Phase 2, not yet started).

## Scope

- Add a web target to `apps/expo` (Metro web bundler, `react-native-web` + `react-dom`).
- Port existing `apps/web` routes/components into `apps/expo/src/app`:
  - `home.tsx`, `post.tsx`, `reset-password.tsx`
  - `auth-showcase.tsx`, `posts.tsx`
- Consolidate Better Auth client config into the one config already at
  `apps/expo/src/utils/auth.ts`, splitting into `.web.ts`/`.native.ts` only where the
  underlying storage mechanism actually differs (cookies vs. `expo-secure-store`) — not
  via `Platform.OS` branches inline.
- Set up web deploy: `expo export -p web` produces static output; deploy it via its own
  minimal `wrangler.jsonc` (assets-based Worker), mirroring the pattern the current
  `apps/web/wrangler.jsonc` already uses. Keep web on its own Worker origin, matching the
  existing `AUTH_PRODUCTION_URL` / `WEB_APP_URL` split in
  `apps/workers-api/wrangler.jsonc`.
- Delete `apps/web/` entirely (package, `wrangler.jsonc`, `.env*`, routes, components)
  once parity is confirmed, and remove its workspace references from the root
  `package.json` / `pnpm-workspace.yaml` / turbo config.

## Platform split approach

No `Platform.OS === 'web'` branching inline. Any file whose implementation must differ
between native and web is split via Metro's automatic platform-extension resolution
(`.native.tsx` / `.web.tsx`, falling back to bare `.tsx` for shared code), with both
variants exposing the same interface so the importing code stays platform-agnostic. This
pattern will also be used for the Phase 2 scan feature (`useScan.native.tsx` /
`useScan.web.tsx`).

`react-native-vision-camera`'s Expo config plugin only affects native builds; since no
`.web.tsx` file imports it, Metro's web bundle graph excludes it naturally — no manual
exclusion needed.

## Testing / validation

- Typecheck and existing test suites pass for the moved code.
- Run the Expo web dev server and manually exercise: sign in, password reset flow, the
  auth-showcase and posts screens — confirm parity with what `apps/web` does today
  before deleting it.
- Confirm the deployed static Worker serves the SPA correctly (`not_found_handling:
  single-page-application` equivalent for whatever routing Expo Router uses on web).

## Open items for implementation time

- Exact deploy target for the web static output (own `wrangler.jsonc` at the Expo app
  root vs. served from `apps/workers-api`) — leaning toward its own Worker to preserve
  today's origin split.
