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

## Extraction: not shared between native and web

> **Amended 2026-09-23**, before implementation: Cloudflare Workers AI has no
> bounding-box/per-block OCR model equivalent to ML Kit — its vision models (e.g. Llama
> 3.2 Vision) take an image and a prompt and return free-form text. There's no
> `OcrBlock[]` (text + bounding box + color sample) to feed through the native
> `findAnchor`/`extractFields`/`extractItemFields`/`classifyRarity` pipeline. Originally
> this doc planned to move that logic into a shared `packages/scanner-core` and reuse it
> server-side; that's dropped.

Instead, the Worker prompts the vision model directly for structured JSON matching
`CharacterCandidates` / `ItemCandidates` — e.g. "Read this Diablo 4 character sheet
screenshot and return JSON: `{ level, title, name }`" (or the item-tooltip equivalent,
including rarity, which the model reads visually rather than us measuring RGB distance
against `itemConfig.rarityColors`).

This means:
- `apps/expo/src/features/scanner/*` (`anchor.ts`, `fields.ts`, `itemFields.ts`,
  `rarity.ts`, `config.ts`) **stays exactly where it is** — native-only, unmoved,
  unchanged. No new `packages/scanner-core` package.
- The `CharacterCandidates` / `ItemCandidates` *type shapes* are the only thing shared
  between native and web — both sides produce the same result shape via completely
  different means (ML Kit + geometric heuristics vs. a prompted vision model). Those
  types move to `packages/validators` (or a new small shared types file) so both
  `apps/expo/src/features/scanner/useScan.ts` and the new web oRPC procedure import the
  same definition instead of duplicating it.
- Extraction quality/reliability between native and web will genuinely differ (that's
  expected and fine per the earlier "keep both, compare" decision) — but there's no
  shared logic left to keep in sync, and no fixture-based unit tests transfer from native
  to the Worker; the Worker's tests are about prompt/response handling, not geometric
  block extraction.

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
`CharacterCandidates` / `ItemCandidates` by prompting the vision model for structured
JSON directly. `useScan.web.tsx` is pure I/O — upload image, call the procedure, set
`candidates` from the response.

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
  → write to R2 (STORAGE binding)
  → call Workers AI vision model with a mode-specific prompt requesting structured
    JSON output matching CharacterCandidates or ItemCandidates
  → parse/validate the model's JSON response against a Zod schema (models can return
    malformed JSON or prose around it — see Error handling)
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
- **OCR/model errors** (Workers AI call fails, times out, or returns JSON that fails
  schema validation): caught in the Worker, R2 object still deleted via `finally`,
  generic `OCR_FAILED` error propagates. `candidates` stays empty, `status: "error"` —
  same contract native already uses.
- **No fields found** (model returns valid JSON but with fields genuinely empty/null —
  e.g. an unrelated screenshot): not an exception — same as native today, returns
  partial/empty candidates with `status: "done"`; existing results UI already handles
  missing-field display, no new empty-state UI needed.
- **Auth/rate-limit rejection**: standard oRPC auth error; unauthenticated requests
  never reach the OCR call.

## Testing

- Worker `scan.recognize`: unit test the prompt-response → validated-JSON parsing
  against recorded sample model responses (well-formed JSON, JSON wrapped in prose,
  malformed JSON — all should be handled per the error-handling section above);
  integration-test auth-gating, rate-limit rejection, and R2 cleanup-on-error against a
  mocked Workers AI binding (Miniflare/`wrangler dev`).
- `useScan.web.tsx`: unit test the upload/error/retry state machine against a mocked
  oRPC client (native has no equivalent unit tests today — validated via on-device
  testing instead — so web should get this coverage since it won't get that same manual
  iteration).
- End-to-end: run the web dev server, upload and paste a real D4 character-sheet and
  item-tooltip screenshot, confirm the full round trip (upload → Workers AI → parsed
  candidates → rendered results) before calling the feature done.

## Open items for implementation time

- Exact Workers AI vision model choice and prompt wording (evaluate against real D4
  screenshots — accuracy on small stylized game-UI text and color-based rarity reading
  is unproven and is the main risk of this whole approach).
- Per-user rate limit thresholds.
