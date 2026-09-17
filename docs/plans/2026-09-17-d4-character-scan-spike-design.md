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

Ran ML Kit's default Latin text recognizer against 15 real phone photos of the
character sheet (same character, "UDAN" / "Demonic Defender" / level 93), via an
Android instrumented test on a physical Pixel 10 Pro. Full per-photo output is in
the test history at commit `b717faf` on `spike/d4-ocr-phase0`.

**Name: 14/15 (93%). Title: 14/15 (93%). Level: 5/15 (33%).**

This is a better result than the numbers alone suggest, because the field that
actually matters for this spike's stated goal — the character *name* — is the
one that came back strongest. "UDAN" and "Demonic Defender" were read cleanly and
consistently across nearly every angle and distance in the set, with only one
photo (14, a distant/blurred shot) failing to read anything useful at all.

**Level underperformed independently of name/title,** and the raw text shows why:
on the 10 failing photos, "93" isn't present as a garbled near-miss — it's just
absent. The level lives in a small blue diamond badge, visually distinct from the
surrounding body text (different font, on an icon, low contrast against a busy
background), and at typical phone-to-monitor distance it's a much smaller target
in pixel terms than the name/title block. This reads as a distinct sub-problem —
"can OCR find and read a small isolated numeral badge" — rather than evidence
that OCR doesn't work here.

**Stray background text.** Several photos' raw output includes unrelated text —
desktop UI fragments, other players' names/levels visible in the game world
behind the character panel. This is the recognizer faithfully reading whatever
was in frame; it isn't a defect, but it confirms the ROI-cropping step in the
pipeline design isn't optional polish — without it, noise from the rest of the
photo competes with the fields we actually want.

**Gaps in this data set** (unchanged from the plan): no glare, no dark-background
variance, single character only. All 15 photos were shot in one lighting
condition at a monitor with a laptop visible in the background of some frames.

### Decision: proceed to Phase 1, with two adjustments

The spike's actual question — can a phone camera reliably read the character
name off the sheet — has a clear yes at 93%. That clears the bar to move forward.

Level, however, needs to be treated as unreliable in its current form. Two
follow-ups carried into Phase 1/2 rather than blocking on them now:

1. **ROI cropping matters more than the original design assumed.** Cropping to
   just the character panel before running recognition should cut background
   noise and may also help level, by giving the recognizer a smaller, less
   cluttered frame to search.
2. **The Level field likely needs its own handling** — a tighter crop specifically
   around the badge, or accepting that Level is a "best-effort" field rather than
   a hard self-verifying gate the way Class/Level was originally envisioned. Since
   Name and Title both read as literal text reliably, they're actually stronger
   anchor/verification candidates than a numeric badge — worth reconsidering
   whether Level needs to anchor anything at all, versus being read opportunistically.

Before broader capture-condition testing (glare, dark backgrounds, a second
character), it's worth confirming Phase 1's build (VisionCamera + worklets-core)
works at all — that's independent of these results and remains the top risk.

## Phase 1 results

**Pass.** Frames reach a worklet on a physical Pixel 10 Pro: logcat shows a
continuous stream of `frame 640x480 yuv` at roughly 30fps. Commits `78db26a`
through `fbd678d` on `spike/d4-ocr-phase0`.

### The predicted top risk did not materialize

`react-native-worklets-core@1.6.3` targets RN 0.76.1 while this app runs RN
0.81.5. That five-minor-version gap was the main remaining concern after the
Reanimated collision was designed away, and it simply did not bite — the build
log confirms `VisionCamera: Frame Processors: ON!` and
`VisionCamera: Linking react-native-worklets...`, and frames flow at runtime.

Removing Reanimated and `react-native-worklets` (Task 1) worked as intended:
nothing in the app used them, `expo-router`'s peer is optional, and NativeWind 5's
engine does not require them. With them gone, `babel.config.js` declares
`react-native-worklets-core/plugin` as the only worklet transform, so there is no
competing claim on the `'worklet'` directive.

### Two incidental findings, both costlier than the "top risk"

Neither was anticipated, and between them they consumed most of Phase 1:

1. **Config plugin manifest merges need an explicit prebuild.** Adding the
   `react-native-vision-camera` plugin to `app.config.ts` and then running
   `expo run:android` does *not* re-merge `AndroidManifest.xml` —
   `android.permission.CAMERA` was silently absent, so permission requests had
   nothing to request and the camera could never start. Re-running
   `expo prebuild --platform android` fixed it. Any future config plugin
   addition needs the same explicit step.

2. **NativeWind 5.0.0-preview.2 silently failed to size a flex container.** With
   `className="flex-1 bg-black"` on the camera's wrapper View, CameraX connected
   and enumerated devices normally but the preview rendered as a blank black
   screen — the container had collapsed to zero height. Swapping that one screen
   to `StyleSheet` inline styles fixed it immediately. This app uses NativeWind
   `className` throughout, so this is worth knowing about generally; the fix here
   was deliberately scoped to the scan screen rather than auditing app-wide.

A third red herring cost time and is recorded so it is not chased again: the
warning `Could not find generated setter for class
com.mrousavy.camera.react.CameraViewManager` is benign. It fires once for every
view manager in the app under the new architecture, including core React Native
components, and is unrelated to VisionCamera.

### Measurements that change Phase 2

**Frame rate: ~30fps.** The design doc's plan to throttle to a target 8fps stands,
but as a battery/thermal measure rather than a necessity to keep up.

**Frame size: 640x480, not the 720p the latency budget assumed.** This cuts two
ways. ML Kit will run faster than the estimated 30-80ms per frame on a smaller
image. But 640x480 is materially less detail than the ~12MP stills Phase 0 read
from, and Phase 0 already showed the level badge failing at 33% on those much
larger images. Reading a small numeral badge from a 640x480 frame is likely to be
worse, not better.

Phase 2 should therefore treat frame format selection as a real task, not a
default: VisionCamera's `useCameraFormat` can request a higher-resolution frame
processor output, and the ROI crop should be applied to the largest frame the
device will deliver at an acceptable rate. This reinforces the Phase 0 conclusion
that Level is best-effort and that Name/Title — larger, plainer text — are the
reliable fields.

## Phase 2 results

**Pass, with an open problem.** The spike's core question now has a live,
on-device demonstration rather than just Phase 0's offline proof: pointing the
camera at the character sheet, Name and Title both correctly lock in via the
rolling-window vote mechanism. Commits `d99d648` through `49603e0` on
`spike/d4-ocr-phase0`.

### What worked

- The local `d4-ocr` Expo module scaffolds, autolinks, and builds cleanly
  alongside VisionCamera's own autolinked Gradle project.
- ML Kit recognizes text correctly from live camera frames, not just stills:
  "UDAN", "CHARACTER", "Stats & Materials", "Weapon Damage" etc. all read
  cleanly in the majority of frames.
- The anchor/fields/voting pipeline works as designed against real fixture
  data: `findAnchor` fuzzy-matches "CHARACTER" even when OCR degrades it (e.g.
  "GARACTa" from an angled shot), and the vote lock-in correctly rejects
  transient bad reads without needing them to disappear entirely.
- The rotation mapping derived from `Frame.java`'s documented semantics
  (`PORTRAIT→0, LANDSCAPE_RIGHT→90, PORTRAIT_UPSIDE_DOWN→180, LANDSCAPE_LEFT→270`)
  is correct -- confirmed by high name/title read rates across multiple live
  sessions, not just a lucky one-off.

### Two bugs found and fixed, worth remembering for Phase 3+

1. **Nested `Map<String, Any>` returned from an Expo Modules `AsyncFunction`
   silently drops values.** `frame: {}` came back empty every time, even
   though `text` read correctly, until switched to typed `Record` classes
   (`@Field`-annotated). This is specific to Expo Modules' reflection-based
   bridge. VisionCamera's own frame processor bridge
   (`JSIJNIConversion.cpp`) is different machinery -- it recursively converts
   plain nested `Map`/`List` by runtime type inspection, not static reflection
   -- so the frame processor plugin correctly returns plain `mapOf(...)`
   without needing Records. **Know which bridge you're returning through
   before reaching for a fix; the two don't share a failure mode.**
2. **Android scoped storage blocks direct `file://` reads of
   `/sdcard/Download/`**, even for a world-readable file, with a silent
   `EACCES`. Fixed for manual testing by copying into the app's private
   internal storage (`/data/data/<pkg>/files/`) via `adb push` + `run-as cp`.
   Worth remembering if any future manual on-device testing needs to hand the
   app a file.

### An investigation that turned out to be a false lead

Early live testing showed alternating clean and garbled-looking reads (some
resembling 180°-rotated text) while `frame.orientation` and frame dimensions
both stayed constant. This looked like a rotation bug and cost real
investigation time. Broader sampling across a longer, deliberately steady
session showed the garbled entries were ordinary live-video OCR noise (dropped/
substituted characters from blur, autofocus, minor hand movement) -- the kind
of noise the vote lock-in exists to filter -- not a systematic rotation defect.
**Lesson: don't diagnose a rotation bug from 2-3 anecdotal "this looks flipped"
examples; tally a full session's output before concluding the pattern is
systematic.**

### Open problem: live preview performance

The `scanText` plugin's synchronous ML Kit call costs roughly 500-700ms per
frame -- far slower than the ~30fps camera frame delivery Phase 1 measured, and
also slower than Phase 0's assumption of 30-80ms per frame (that estimate was
based on ML Kit's typical cost on a cropped, in-memory bitmap; live YUV frame
conversion via `InputImage.fromMediaImage` evidently costs more). Two
mitigations were tried:

- `runAtTargetFps` throttling, to stop the frame processor from being invoked
  faster than the expensive call can complete.
- Lowering `scannerConfig.targetFps` from the original design's assumed 8 down
  to 2, closer to ML Kit's real sustained rate.

Neither fully resolved it. The reported on-device experience: smooth for
roughly a second, then visible lag/jitter, regardless of the target rate tried.
The leading hypothesis -- not confirmed -- is that the frame processor holds
each camera buffer for the full duration of the blocking ML Kit call, and the
underlying camera capture pipeline's buffer pool (typically only a handful of
buffers) exhausts after enough slow calls, stalling the preview itself rather
than just the OCR output rate. This needs actual profiling to confirm (native-
side timing around `Tasks.await`, buffer pool inspection, checking for thermal
throttling given how much continuous camera+ML testing this session involved)
rather than more guessing.

**This does not block the spike's core conclusion.** Name and Title do lock
correctly; the pipeline works. But a shippable version of this feature needs
the live performance problem solved -- likely via one of: running ML Kit
asynchronously off the frame processor thread (copying frame data rather than
holding the camera's buffer), cropping to a smaller ROI before recognition, or
accepting a deliberately low, buffer-pool-safe scan rate as a permanent design
constraint rather than a stopgap.

### Recommendation

Stop here for this spike. The original question -- can a phone camera reliably
read a Diablo 4 character's name -- is answered: yes, both from a still photo
(93%, Phase 0) and live from camera frames (Phase 2). Building the guided
step-by-step overlay, item scanning, or any other product feature on this
foundation should treat live-preview performance as a prerequisite piece of
work, not something to discover by surprise later.
