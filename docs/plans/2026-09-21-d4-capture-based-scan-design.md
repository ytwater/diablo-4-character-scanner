# Pivot to Capture-Based Scanning — Design

**Problem:** The continuous frame-processor scan (Phase 0-3) keeps the
camera preview slow/janky even after Phase 3's tuning (JPEG round-trip
removal, tightened ROI) because it's still running ML Kit text recognition
on every sampled frame while the preview is live. Instead of continuing to
chase per-frame performance, pivot to a single-shot flow: the user aligns
the character sheet/item in an on-screen box under a live (but *not*
scanning) preview, taps "Take Picture," and OCR runs once against that one
photo. This trades "live feedback while aiming" for "camera stays fully
responsive," and removes an entire class of noisy-sample-averaging
complexity (the vote/lock system) that existed only to cope with per-frame
OCR jitter.

**Scope:** Android only (matches existing project scope — iOS untested per
Phase 3's "out of scope"). No persistence, no item scanning, no
guided-overlay UX — same out-of-scope list as Phase 3, this is purely the
capture-vs-continuous pivot.

---

## What's kept

- `apps/expo/src/features/scanner/anchor.ts` (`findAnchor`) — unchanged.
  Still finds the "CHARACTER" header block by fuzzy/substring match.
- `apps/expo/src/features/scanner/fields.ts` (`extractFields`) — unchanged.
  Still derives level/title/name from blocks positioned below the anchor.
- `apps/expo/modules/d4-ocr/android/.../D4OcrRecognizer.kt` — unchanged.
  Already takes an `InputImage` and returns `List<D4OcrBlock>`; this was
  never coupled to the frame-processor path and is reused as-is.
- `scannerConfig.roi`, `.anchorText`, `.anchorFuzzyThreshold` — unchanged in
  meaning (normalized 0-1 box), reused as both the on-screen framing
  overlay position and the crop rect applied to the captured photo.

## What's removed

- `apps/expo/src/features/scanner/useTextScanner.ts` — replaced (see
  below).
- `apps/expo/src/features/scanner/voting.ts` +
  `voting.test.ts` — deleted. Voting existed to smooth per-frame OCR noise
  across many samples; with one photo there's nothing to vote across.
- `apps/expo/modules/d4-ocr/android/.../D4OcrPlugin.kt` — deleted, along
  with the `FrameProcessorPluginRegistry.addFrameProcessorPlugin("scanText",
  ...)` registration in `D4OcrModule.kt`. Its NV21 stride-aware
  crop/convert logic (`imageToNv21`, `cropNv21`) is YUV-frame-specific and
  has no equivalent needed once we're decoding a JPEG straight to a
  `Bitmap`.
- `scannerConfig.targetFps` and `scannerConfig.vote` — deleted, no longer
  meaningful concepts.
- `react-native-worklets-core` dependency, if nothing else in the app uses
  it (check before removing from `package.json`).

## What's added

**Native (`D4OcrModule.kt`):** a new `AsyncFunction("recognizeImage", uri:
String, roi: RoiParams)` that:
1. Decodes the photo file at `uri` into a `Bitmap`
   (`BitmapFactory.decodeFile`).
2. Converts the normalized ROI (same `{x, y, width, height}` shape as
   today, 0-1 range) into pixel bounds against the bitmap's actual
   width/height, clamped to the bitmap.
3. Crops via `Bitmap.createBitmap(bmp, x, y, w, h)` — plain bitmap
   cropping, no NV21/stride math needed since we're off the raw-frame path.
4. Wraps as `InputImage.fromBitmap(cropped, 0)` (rotation is 0 because
   vision-camera's `takePhoto()` already writes an upright JPEG).
5. Calls `D4OcrRecognizer.recognize()` and returns the same
   `{ blocks, width, height }` shape the old plugin returned, so
   `anchor.ts`/`fields.ts` need zero changes.

**JS (`useCharacterScan.ts`, replaces `useTextScanner.ts`):** exposes
`{ candidates, status, photoPath, capture, retake }`.

- `status: "idle" | "capturing" | "processing" | "done" | "error"`
- `capture()`: calls the `Camera` ref's `takePhoto()`, sets `photoPath` and
  `status = "processing"`, calls `D4Ocr.recognizeImage(photoPath,
  scannerConfig.roi)`, then runs `findAnchor` + `extractFields` once
  (no vote window) and sets `candidates` directly from that single result.
  `status = "done"` on success, `"error"` on any thrown exception (bad
  photo write, decode failure, etc).
- `retake()`: deletes the temp photo file if present, resets `candidates`
  to `{}`, `status = "idle"`.

**UI (`scan.tsx`):**
- `idle`: live `Camera` preview (no frame processor attached at all —
  plain preview), the cyan ROI box drawn as a static alignment guide
  (same position/size as today), and a "Take Picture" button.
- `capturing`/`processing`: the just-captured photo (`photoPath`)
  rendered as a still `Image`, with a spinner overlay — gives the user
  visual confirmation of exactly what was captured while OCR runs.
- `done`: same still photo, with Level/Title/Name (or `—` for any field
  `findAnchor`/`extractFields` couldn't resolve) and a "Retake" button.
- `error`: same still photo (or a plain message if no photo), an error
  string, and a "Retake" button — same recovery path as `done`, since a
  failed-to-find-anchor result isn't fatal, just empty.

---

## Data flow

1. `/scan` opens, live preview + static ROI box render, `status: "idle"`.
2. User aligns the sheet/item in the box, taps **Take Picture**.
   `status: "capturing"`.
3. `camera.takePhoto()` resolves with a file path. `status: "processing"`;
   screen swaps to the captured still + spinner.
4. `D4Ocr.recognizeImage(photo.path, scannerConfig.roi)` runs the native
   decode/crop/recognize pipeline described above.
5. JS runs `findAnchor` then `extractFields` once on the returned blocks.
   `status: "done"`, results shown.
6. **Retake** discards the temp photo and returns to `"idle"`.

## Error handling

- `takePhoto()` throws → `status: "error"`, message shown, Retake
  available.
- `recognizeImage` throws (bad file, decode failure) → same `"error"`
  treatment; the screen never crashes.
- Anchor not found in the still → **not** an error: `candidates: {}`,
  `status: "done"`, all three fields show `—`. The user sees immediately
  that nothing was found and can retake with better alignment.
- No auto-retry/auto-recapture — a single explicit user-driven Retake,
  per YAGNI.

## Testing

- `anchor.test.ts` / `fields.test.ts` — untouched, same pure functions and
  fixtures.
- `voting.ts` / `voting.test.ts` — deleted.
- No new JS unit tests: `useCharacterScan`'s capture flow is thin glue over
  `takePhoto()` and the native module call, better verified on-device
  (`adb`/screenshot loop, same pattern as Phase 2/3) than mocked.
- `D4OcrModule.kt`'s new `recognizeImage` path is native/on-device-only to
  verify, same as the old plugin was.

## Out of scope

Same list as Phase 3: item scanning, persistence, API/database
integration, iOS testing, the guided step-by-step overlay. Also
out of scope here: re-tuning `scannerConfig.roi` or
`anchorFuzzyThreshold` for the new single-shot accuracy characteristics —
worth its own on-device pass once this pivot is implemented and there's a
real captured-photo pipeline to tune against (photo JPEGs from
`takePhoto()` will differ in framing/quality from both the old live-frame
ROI crops and the Phase 0 fixture photos).
