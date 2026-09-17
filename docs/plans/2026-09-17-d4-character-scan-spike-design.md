# Diablo 4 Character Scan Spike — Design

**Date:** 2026-09-17
**Status:** Approved, not yet implemented

## Goal

Answer one question: can a phone camera pointed at a monitor running Diablo 4 read
text off the character sheet, on-device and offline?

Everything else — the guided overlay, item scanning, persistence — is out of scope.

## Context

`apps/expo` is Expo SDK 54 / RN 0.81, expo-router, with `expo-dev-client` already
installed. Custom native modules are therefore available; there is no Expo Go
constraint. The spike targets Android for testing; iOS is scaffolded and compiled
but not tested.

## The anchor strategy

> **Revised after reviewing real capture photos (2026-09-17):** the character
> sheet does not display the class as text anywhere. It shows Name, a
> player-chosen flavor title (e.g. "Demonic Defender" — not the class), and
> Level. The class vocabulary anchor below was replaced with the "CHARACTER"
> panel header, which is fixed UI chrome present verbatim on every class's
> sheet. See "Phase 0 results" for the photos that prompted this.

Target fields, in priority order:

1. **Level** — a 1–3 digit integer in a known range. Self-verifying by range
   check, and a test of numeric glyph quality. This is the spike's pass/fail
   signal.
2. **Title** — free text from a large but enumerable list of unlockable
   titles. Not asserted against in Phase 0 (no vocabulary was built for it),
   but its presence/absence is a useful data point.
3. **Name** — free text, unverifiable, judged by eye.

The pipeline does not hunt for the name directly. It matches text blocks
against the literal string "CHARACTER" (the panel header); the matched block's
bounding box then **anchors every other field spatially** — Level, Title, and
Name all sit at known offsets below and beside that header.

This generalizes. The eventual guided overlay has the same problem for every item:
find a known landmark, read the unknown text positioned relative to it. Building
the anchor concept now yields a reusable primitive rather than a throwaway demo.

It also degrades gracefully. If the name read is mush but class and level come back
clean, the spike still answers its question — the OCR works, the name is just a
harder target.

## Pipeline and latency budget

Per frame: VisionCamera delivers a YUV frame → the plugin crops to the region of
interest → ML Kit `TextRecognition` runs on-device → text blocks with bounding
boxes return to JS.

ML Kit costs roughly **30–80ms per 720p frame** on a mid-range Android device, less
once cropped to an ROI. The frame processor is throttled to a **target 8fps**
(125ms budget) rather than running at capture rate; running flat-out burns battery
re-reading a frame that has not changed.

### Lock-in rule

Two deliberate departures from a flat "5 consecutive identical frames" threshold,
both to keep recognition fast:

**Per-field thresholds.** Class is validated against a six-word dictionary, so a
high-scoring fuzzy match is already strong evidence: it locks at **3 votes**. Level
locks at **3**. Only the name, which has nothing to check against, needs **5**.

**A rolling vote window, not a consecutive streak.** Keep the last 8 reads per
field; lock when a candidate reaches its threshold within that window. A single
blurred or glare-hit frame costs one vote instead of resetting to zero. Under a
strict-streak rule, hand shake alone can stall a lock indefinitely.

At 8fps: **~375ms to lock class and level, ~625ms for the name** in the good case.

**Perceived speed is handled separately.** Candidates render live from the first
frame, greyed out, and solidify on lock. The vote window is not dead time the user
waits through.

Target fps and vote thresholds stay in one exported config object. Real values
emerge from Phase 0. Keeping them in a single object also makes a future A/B test
of the tuning a one-line change — the experiment machinery itself is not built now.

## Components

### Native plugin — `apps/expo/modules/d4-ocr/`

A VisionCamera frame processor plugin registered as `scanText`.

- `android/.../D4OcrPlugin.kt` — wraps ML Kit `TextRecognition` (Latin script).
  Bundled model, no Play Services download, fully offline.
- `ios/D4OcrPlugin.swift` — wraps Vision `VNRecognizeTextRequest`, `.accurate`.
  Scaffolded and compiled, untested.
- Both return a uniform shape:
  `{ blocks: [{ text, confidence, frame: {x,y,w,h} }], width, height }`.
  Normalizing the platforms in native code keeps the JS layer platform-agnostic.

### JS layer — `apps/expo/src/features/scanner/`

| File | Responsibility |
| --- | --- |
| `useTextScanner.ts` | Frame processor hook; throttles to target fps, hands blocks to the resolver |
| `anchor.ts` | Fuzzy-matches blocks against the class vocabulary (normalized Levenshtein), returns the anchor box |
| `fields.ts` | Extracts level and name from blocks by geometric relationship to the anchor |
| `voting.ts` | Rolling window and per-field lock thresholds |
| `config.ts` | The single tunable object: target fps, thresholds, window size, fuzzy cutoff, ROI rect |

### Screen

`src/app/scan.tsx` — camera preview, an ROI rectangle to aim with, and three field
rows showing live candidates that solidify on lock.

### Config changes

Add `react-native-vision-camera@4.7.3` and `react-native-worklets-core` to
`apps/expo/package.json`; add the VisionCamera config plugin and camera permission
strings to `app.config.ts`. Requires `expo prebuild` and a fresh dev build.

Nothing touches `@acme/api`, `@acme/db`, or auth. The spike stays sealed inside the
Expo app.

## Dependency findings

Checked against npm on 2026-09-17:

- **expo-camera has no raw-frame API.** A live loop would mean repeated
  `takePictureAsync` at ~1–2fps with shutter latency. Not viable for this design.
- **VisionCamera 5.x** (current, 5.2.3) moved to Nitro modules and is built against
  RN 0.85. Too far ahead of RN 0.81.
- **VisionCamera 4.7.3** is the realistic version for Expo 54, but requires
  `react-native-worklets-core`, which sits alongside the `react-native-worklets@0.5.1`
  that Reanimated 4 installs. Two worklet runtimes in one app.
- **`react-native-vision-camera-text-recognition@3.1.1`** was last built against
  VisionCamera 4.5 / RN 0.74. Rejected in favour of our own plugin: we need
  bounding boxes in a shape the overlay can consume, and this is the layer the
  product depends on long-term.

## Phases

**Phase 0 — capture reality check, no camera code.**
Shoot ~15 photos of the character sheet off the monitor: varied angle, distance,
glare, and both bright and dark game backgrounds. Evaluate with ML Kit *without*
building the camera stack — write only the ~40 lines of Kotlin that call
`TextRecognition` and drive it from an Android instrumented test over the photo set.

This separates the two independent risks instead of hitting them together: **can
ML Kit read a photographed monitor at all** (Phase 0) versus **can VisionCamera and
worklets build on RN 0.81** (Phase 1). If Phase 0 fails, no camera plumbing rescues
it. The photo set then remains as a regression corpus.

**Phase 1** — VisionCamera + worklets-core install, prebuild, dev build. Prove a
frame processor runs at all before adding OCR to it.

**Phase 2** — Wire the plugin in; land `anchor.ts`, `fields.ts`, `voting.ts`; build
the screen.

**Phase 3** — Tune the config constants against real play.

## Testing

`anchor.ts`, `fields.ts`, and `voting.ts` are pure functions over block arrays.
Unit-test them against fixtures captured from Phase 0's real ML Kit output,
including deliberately bad frames. The native plugin keeps the Phase 0 instrumented
test. No E2E — camera behaviour is judged on device by eye.

## Risks, ranked

1. **Worklets-core alongside Reanimated 4's `react-native-worklets`.** Top build
   risk. Phase 1 exists to hit it early. Fallback: expo-camera plus
   `@react-native-ml-kit/text-recognition` over captured stills, accepting ~1–2fps
   and the loss of the live-stream model.
2. **Moiré and refresh banding** at certain camera-to-monitor distances. May be a
   user-instruction problem rather than a code one.
3. **D4's stylized font on ornate backgrounds.** This is what Phase 0 measures.

## Out of scope

The guided step-by-step overlay, item scanning, scroll handling, persistence, API
and database integration, iOS testing, A/B testing of tuning constants.
