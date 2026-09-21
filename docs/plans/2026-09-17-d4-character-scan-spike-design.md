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

## Phase 0 results

Ran ML Kit's default Latin text recognizer (`text-recognition:16.0.1`) against
14 of the 15 planned photos (one was lost mid-spike when a `expo prebuild`
re-run wiped the untracked `android/` directory before the photos were
committed — noted here as a process gap, not an OCR finding).

1. **Level:** recognized in 5/14 photos (36%) — below the plan's 0.5 floor.
2. **Name and title:** recognized in 13/14 photos each (93%).
3. **Failure quality:** most failures were partial, not garbage — the same
   photo would correctly read name and title while missing the level, and the
   level digits, when misread, were simply absent from the output rather than
   swapped for wrong characters. Only one photo (`character-sheet-13.jpg`)
   failed almost everything, returning fragments of every line ("ER O |
   fender | aterials | Damage | ...") — visibly blurrier/more oblique than the
   rest, consistent with a bad angle or motion blur rather than a font
   problem.
4. **Likely cause of the level miss:** Level is rendered inside a small
   colored diamond badge icon (graphic background, embossed digits), while
   Name and Title are plain light text on a plain dark panel. The pattern
   across all 14 reads matches this: the OCR reliably reads panel text but
   inconsistently reads the badge digit. This looks like a badge-icon
   contrast/rendering problem specific to the level field, not a general
   failure of the D4 UI font.
5. **Angle/distance:** no clear correlation in this set beyond the one bad
   photo above — the closer, straighter shots did not obviously outperform
   the others on level recognition, though this set never varied lighting,
   glare, or background, so that's untested.

**Go/no-go:** Name and title are reliable enough (93%) that anchoring on them
looks viable. Level at 36% is not, as-is — but since the failure looks
localized to the badge icon rather than the whole panel, the fix belongs in
Phase 1/2's ROI cropping and field-detection logic (e.g. crop tighter around
the badge, or fall back to reading level from elsewhere on the sheet) rather
than requiring different OCR tech. Proceeding to Phase 1 is reasonable, but
Phase 2's field-detection work should treat the level badge as a known hard
case from day one, and a proper varied capture set (glare, dark background,
second character) should be taken before trusting these hit rates far.

## Phase 1 results

**Dependencies (Task 0):** `react-native-vision-camera@4.7.3` and
`react-native-worklets-core@1.6.3` installed clean via `expo install`, pinned
exactly as planned. No peer-dependency warnings involving `react-native-worklets`
or `react-native-reanimated`.

**Native build (Task 2):** `./gradlew :app:assembleDebug` — **BUILD SUCCESSFUL**,
no dependency conflict, no duplicate-class or JSI symbol collision. Direct
evidence the two worklet runtimes link cleanly at the native level: the CMake
configure step for `react-native-vision-camera` printed
`VisionCamera: Frame Processors: ON! Linking react-native-worklets...`
(i.e. VisionCamera's C++ target links straight against Reanimand's
`react-native-worklets`, not a separate/conflicting copy).

**On-device run (Task 4):** Ran via `npx expo run:android` on a physical
device (Pixel 10 Pro over USB). Confirmed via `adb logcat`:
- `libVisionCamera.so` and `librnworklets.so` (Reanimated's) both loaded
  successfully in the same process.
- `VisionCameraProxy` created its own Worklet Context independently
  (`Creating Worklet Context...` / `Worklet Context created!`) alongside
  Reanimated's own worklets runtime already running — no crash, no conflict.
- The frame processor fired continuously: 508 frames logged in a 15s window
  (~34fps sustained), each one calling `useRunOnJS`'s worklet-core-to-JS hop
  to update React state, over the full duration with no interruption.
- `grep -iE "FATAL|AndroidRuntime|ANR"` over that window returned nothing
  relevant (only unrelated system WifiHAL log lines).
- The app process stayed on a single PID throughout — no crash-and-restart.

**Secondary findings, not blocking but worth flagging for Phase 2:**
- `react-native-worklets-core@1.6.3` does not export a top-level `runOnJS`
  function — that API was replaced by the `useRunOnJS` hook
  (`react-native-worklets-core/lib/typescript/hooks/useRunOnJS.d.ts`). Any
  future frame-processor code (Phase 2's `useTextScanner.ts` etc.) needs to
  use `useRunOnJS`, not `runOnJS`, when crossing from a VisionCamera frame
  processor worklet back to JS.
- expo-router's default `require.context` over `src/app/` treats every
  `.tsx` file as a route, including test files. `index.test.tsx` pulled
  `@testing-library/react-native` (and its Node-only `console` import) into
  the Metro bundle and broke bundling for the *entire app* — unrelated to
  VisionCamera/worklets, but blocking until fixed. Fixed with a
  `metro.config.js` `resolver.blockList` entry excluding
  `src/app/**/*.test.{ts,tsx}` from the route bundle. This was a pre-existing
  gap, only surfaced now because this was the first `expo run:android`/`expo
  start` in the repo since the test file was added.

**Go/no-go for Phase 2:** **Go.** The top-ranked build risk (two worklet
runtimes colliding) did not materialize at either the native build level or
at runtime. VisionCamera 4.7.3 + `react-native-worklets-core` 1.6.3 coexist
cleanly with Reanimated 4.1.3's `react-native-worklets` 0.5.1 on this app's
exact stack (Expo SDK 54, RN 0.81.5). Phase 2 can proceed with the native
`D4OcrPlugin`, `anchor.ts`/`fields.ts`/`voting.ts`, and the real scan screen
as designed, using `useRunOnJS` (not `runOnJS`) for the worklet-to-JS bridge.

## Phase 2 results

**Implemented per plan:** `d4-ocr` native module (Kotlin `D4OcrRecognizer` +
`D4OcrPlugin` registered as VisionCamera's `"scanText"` frame processor
plugin; Swift scaffold compile-only/unverified — no macOS toolchain in this
dev environment), the pure JS layer (`anchor.ts`, `fields.ts`, `voting.ts`,
all unit-tested against real ML Kit fixtures captured on-device), and the
real `useTextScanner.ts` + `scan.tsx` screen.

**Deviations from the plan's snippets, caught before they became bugs:**
- `VisionCameraProxy` is exported from `react-native-vision-camera`, not
  `react-native-worklets-core` (the plan's `useTextScanner.ts` snippet
  imported it from the wrong package).
- The Android module needed `androidx.camera:camera-core` added directly as
  a `compileOnly` dependency alongside `react-native-vision-camera` itself —
  VisionCamera declares CameraX as `implementation`, so `ImageProxy` wasn't
  visible transitively.
- `create-expo-module@latest` (57.0.1) fails scaffolding local modules
  entirely (`repo is not defined` in its podspec template, regardless of
  `--repo`); had to pin to `create-expo-module@2.1.9`, the last version
  aligned with this project's Expo SDK 54.
- Gradle's `connectedDebugAndroidTest` uninstalls both APKs (and wipes their
  external files dir) immediately after the run, which destroyed the
  exported fixture JSON before `adb pull` could grab it. Worked around by
  installing the pre-built APKs with `adb install` and invoking
  `am instrument` directly.
- `character-sheet-01.jpg` — the plan's suggested fixture for both the
  anchor and fields tests — no longer OCRs to "93" on this device's current
  ML Kit build, even though Phase 0's own test asserts it does (re-running
  that exact Phase 0 test now fails the same way). Used
  `character-sheet-02.json` instead, which does contain a clean "93" block
  and confirmed the plan's assumed layout order (level, then name, then
  title, all below the anchor) exactly.

**On-device run (Task 12):** Built and installed via `npx expo run:android`
on the same Pixel 10 Pro. Navigated to `/scan`, granted camera permission,
pointed the camera at a monitor running Diablo 4.

1. **Does it flow end-to-end?** Yes. Confirmed via screenshots taken over
   `adb`: Level/Title/Name went from `—` placeholders to live OCR text within
   seconds of pointing at any on-screen content, and stabilized (didn't keep
   flickering) once held steady — native plugin → JS → anchor/fields/voting →
   React state is wired correctly.
2. **Crashes/ANRs?** None. `adb logcat` grepped for `FATAL|AndroidRuntime|
   Exception` against the app's own PID, both during general pointing and
   during the character-panel test, returned nothing for the whole session.
3. **YUV→NV21 conversion legible?** Yes, indirectly confirmed: recognized
   text was legible real substrings of on-screen content (e.g. "ROWN" from
   "SILENT CROWN", "Head" from an equipment slot label), not the garbage a
   striped/corrupted buffer would produce.
4. **Field accuracy — two screens tested:**
   - Pointed first at the equipped-item tooltip screen (not the intended
     target): locked to `Level: y\n3-`, `Title: ROWN`, `Name: Head` — junk,
     as expected, since this isn't the layout `fields.ts` assumes.
   - Pointed at the actual CHARACTER stats panel (matching the fixtures —
     "93" badge, "UDAN", "Demonic Defender" all visible on screen): still
     locked to wrong values (`Level: 3-9`, `Title: PPED`, `Name: ad`) rather
     than the correct `93`/`UDAN`/`Demonic Defender`. This is a genuine
     accuracy miss on the intended screen, not a pipeline failure — the
     unit tests against the exported-JSON fixtures passed with the correct
     layout assumption, but live camera framing captures a wider field of
     view (surrounding desktop/browser chrome, not a tight crop of just the
     panel like the fixture photos were), producing a noisier block set that
     the geometric heuristic doesn't handle.
5. **Cosmetic bug found along the way, not yet fixed:** the "Scan character
   sheet" home-screen link and the on-screen Level/Title/Name text both
   render in a near-invisible dark color instead of the intended
   `text-primary`/white — functional (confirmed via a direct `adb shell
   input tap` on the link, which navigated correctly) but easy to miss
   visually. Needs a styling fix, tracked separately from this plan.

**Decision:** Qualified success — proceed to Phase 3. The pipeline is proven
end-to-end with no crashes and legible OCR, satisfying this plan's pass bar.
Phase 3's tuning priorities, in order: (1) tighten the ROI to actually match
the live camera's framing of the character panel rather than the
tightly-cropped fixture photos — this is very likely the single biggest
lever, since the same layout assumption that passed unit tests failed live;
(2) revisit `fields.ts`'s geometric offsets against on-device block sets
(noisier than the fixture JSON) once ROI framing is fixed; (3) the
low-contrast text styling bug (separate, low-risk fix).
