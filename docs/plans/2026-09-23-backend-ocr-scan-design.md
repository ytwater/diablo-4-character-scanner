# Phase 2: Backend OCR scan for web (upload/paste, no camera)

> Depends on Phase 1 (Expo web migration) being complete — this feature is built as the
> web variant of the Expo scan screen, not as a standalone Vite feature.

## Why

Web has no camera-capture flow; scanning on web means uploading or pasting a screenshot
instead. Since there's no native ML Kit available in a browser, web-side text
recognition happens server-side via Cloudflare Workers AI. Android keeps its existing
on-device `D4OcrModule`/ML Kit pipeline unchanged — this adds a second OCR path rather
than replacing the first, since native is fast, free, offline, and already tuned, while
backend OCR is untested for this use case and worth evaluating independently rather than
betting the whole app on it.

## Shared extraction logic

`findAnchor`, `extractFields`, `extractItemFields`, `classifyRarity`, and
`scannerConfig`/`itemConfig` (currently in `apps/expo/src/features/scanner/`) are pure
TypeScript with no RN dependency — only `useScan.ts` touches RN/camera APIs. Move the
pure logic into a new `packages/scanner-core` package (existing Vitest suites move with
it unchanged) so both the Android native path and the Worker OCR path consume the same
field-extraction code instead of duplicating it.

## Architecture

```
apps/expo/src/app/scan.tsx                # shared screen: mode toggle, results view
apps/expo/src/app/scan/
  useScan.native.tsx                       # existing: camera + D4Ocr.recognizeImage
  useScan.web.tsx                          # NEW: upload/paste, calls scan.recognize
  CaptureSurface.native.tsx                # camera viewfinder + shutter
  CaptureSurface.web.tsx                   # NEW: drop zone / file input / paste handler
```

Both `useScan` variants expose the same interface
(`{ candidates, status, photoPath, error, capture, retake }`) via Metro's platform-
extension resolution, so `scan.tsx` and the results UI stay fully shared.

**Server does the parsing** (not the client): the Worker returns fully-parsed
`CharacterCandidates` / `ItemCandidates`, not raw OCR blocks. `useScan.web.tsx` is pure
I/O — upload image, call the procedure, set `candidates` from the response. Only the
Worker imports `packages/scanner-core` on the backend side (native still imports it
directly for on-device parsing).

## Request flow

```
useScan.web.tsx
  → user selects/pastes an image
  → oRPC call: scan.recognize({ mode: "character" | "item", image: <blob> })
       (requires an authenticated session — signed-in only; characters always
        belong to a user, so anonymous scanning isn't meaningful here)
       ↓
Worker (packages/api, scan router)
  → auth-gate via existing Better Auth middleware
  → rate-limit per user (Workers AI + R2 writes cost money and are publicly reachable)
  → validate image (type/size)
  → write to R2 (STORAGE binding), call Workers AI vision model
  → normalize model output → OcrBlock[] (text, boundingBox, colorSample) —
    matching the shape D4Ocr.recognizeImage already returns
  → packages/scanner-core: findAnchor/extractFields (character) or
    extractItemFields/classifyRarity (item)
  → delete the R2 object immediately (finally block — runs on success or failure,
    nothing retained)
  → return CharacterCandidates | ItemCandidates
       ↓
useScan.web.tsx sets candidates, status: "done"
```

## Error handling

- **Upload/validation errors** (bad type, too large, missing image): rejected before
  calling Workers AI, typed oRPC error (e.g. `INVALID_IMAGE`) → specific message in
  `useScan.web.tsx`'s `error` state.
- **OCR/model errors** (Workers AI call fails or times out): caught in the Worker, R2
  object still deleted via `finally`, generic `OCR_FAILED` error propagates.
  `candidates` stays empty, `status: "error"` — same contract native already uses.
- **No anchor/fields found**: not an exception — same as native today, returns
  partial/empty candidates with `status: "done"`; existing results UI already handles
  missing-field display, no new empty-state UI needed.
- **Auth/rate-limit rejection**: standard oRPC auth error; unauthenticated requests
  never reach the OCR call.

## Testing

- `packages/scanner-core`: existing Vitest suites move as-is (already pure-function
  tests with fixtures).
- Worker `scan.recognize`: unit test the Workers AI response → `OcrBlock[]`
  normalization against recorded sample responses (mirrors
  `apps/expo/.../__fixtures__/ocr-blocks`); integration-test auth-gating, rate-limit
  rejection, and R2 cleanup-on-error against a mocked Workers AI binding
  (Miniflare/`wrangler dev`).
- `useScan.web.tsx`: unit test the upload/error/retry state machine against a mocked
  oRPC client (native has no equivalent unit tests today — validated via on-device
  testing instead — so web should get this coverage since it won't get that same manual
  iteration).
- End-to-end: run the web dev server, upload and paste a real D4 character-sheet and
  item-tooltip screenshot, confirm the full round trip (upload → Workers AI → parsed
  candidates → rendered results) before calling the feature done.

## Open items for implementation time

- Exact Workers AI model choice for OCR/vision (evaluate against real D4 screenshots).
- Per-user rate limit thresholds.
