# D4 OCR Phase 3 — Tuning Pass Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Turn Phase 2's "flows end-to-end but locks onto wrong values, feels
slow" pipeline into one that's fast enough to measure honestly and accurate
enough on the real character-stats panel to be worth building the guided
overlay on top of. Fix the incidental low-contrast UI bug found during
Phase 2's on-device test along the way.

**Architecture:** No new components. This tunes `scannerConfig`, the
`D4OcrPlugin.kt` hot path, and `scan.tsx`'s styling — all informed by
Phase 2's on-device findings (`docs/plans/2026-09-17-d4-character-scan-spike-design.md`,
"Phase 2 results"). Every task ends in an on-device check via `adb`
screenshot/logcat, the same loop that produced Phase 2's findings, because
none of this is unit-testable — it's tuning against a live camera and a
real monitor.

**Tech Stack:** Same as Phase 2 — no new dependencies.

---

## Known state going in

- A physical Pixel 10 Pro is connected over USB (`adb devices` shows it) and
  the app is already installed (`your.bundle.identifier`) with Phase 2's
  code. `npx expo run:android`'s Metro dev server may or may not still be
  attached — check before assuming Fast Refresh works; if not, JS-only
  changes still need a Metro restart (not a full native rebuild) to land.
- Diablo 4 needs to be running on a monitor, on the CHARACTER stats panel
  (showing the level badge, name, and title), for Tasks 3 and 4's checks.

---

### Task 1: Fix invisible scan-screen text

**Files:**
- Modify: `apps/expo/src/app/index.tsx` (the `Link` added in Phase 2)
- Modify: `apps/expo/src/app/scan.tsx:52-54`

**Step 1: Reproduce and screenshot the current state**

```bash
adb shell screencap -p /sdcard/phase3_before.png
adb pull /sdcard/phase3_before.png /tmp/phase3_before.png
```

Confirm (as seen in Phase 2's on-device run) that "Scan character sheet" on
the home screen and "Level:"/"Title:"/"Name:" on `/scan` all render in a
color indistinguishable from the background, even though
`className="text-primary"` / `className="text-white"` is present.

**Step 2: Isolate whether this is a NativeWind resolution issue**

This app runs `nativewind@5.0.0-preview.2` (a preview release) with
`tailwindcss` v4 CSS variables defined via `@variant dark { ... }` nesting
in `tooling/tailwind/theme.css` — a newer, less common Tailwind v4 pattern.
Since `text-primary`/`text-foreground` render correctly elsewhere in the
exact same files (e.g. `index.tsx`'s "Scanner" span, "Not logged in" text),
this isn't a global theme-parsing failure — something about these specific
new elements isn't getting their className's color applied. Don't spend
more than one investigation cycle chasing the exact preview-library
mechanism; if a plain inline `style` color makes it render correctly, use
that as the fix rather than continuing to debug NativeWind's internals.

**Step 3: Apply the fix**

In `apps/expo/src/app/index.tsx`, change the Phase 2 `Link`:

```tsx
<Link href="/scan" className="py-2 text-center" style={{ color: "#ec4899" }}>
  Scan character sheet
</Link>
```

In `apps/expo/src/app/scan.tsx`, change the three field `Text` elements:

```tsx
<View className="absolute inset-x-4 bottom-16 rounded-lg bg-black/60 p-3">
  <Text className="mb-1 text-base" style={{ color: "#ffffff" }}>Level: {candidates.level ?? "—"}</Text>
  <Text className="mb-1 text-base" style={{ color: "#ffffff" }}>Title: {candidates.title ?? "—"}</Text>
  <Text className="text-base" style={{ color: "#ffffff" }}>Name: {candidates.name ?? "—"}</Text>
</View>
```

`#ec4899` matches the theme's light-mode `--primary` pink closely enough for
this affordance; it doesn't need to track dark/light mode exactly since the
scan screen and home-screen link are both meant to read clearly against a
dark camera-preview background regardless of system theme.

**Step 4: Verify on-device**

If Metro is still attached to the running app, save the files and let Fast
Refresh apply them; otherwise re-run:

```bash
cd apps/expo && npx expo run:android
```

Then re-screenshot both screens and confirm the text is now clearly pink
(home screen link) and white (scan screen fields) against their
backgrounds.

**Step 5: Commit**

```bash
git add apps/expo/src/app/index.tsx apps/expo/src/app/scan.tsx
git commit -m "fix: use explicit inline color for scan UI text

nativewind@5.0.0-preview.2 wasn't applying text-primary/text-white's
color on these specific elements even though the same utility
classes render correctly elsewhere in the same files - didn't chase
the preview library's internals further, since an inline style color
is a correct, low-risk fix for a one-line UI affordance either way."
```

---

### Task 2: Measure actual on-device frame rate

Phase 2's design doc flagged that the perceived slowness was never actually
measured — Phase 1's 34fps figure was for an empty frame processor, not one
doing NV21 conversion + JPEG compression + ML Kit recognition. Measure it
for real before deciding whether to optimize anything.

**Files:**
- Modify: `apps/expo/src/features/scanner/useTextScanner.ts`

**Step 1: Add temporary fps logging**

In `handleResult`, before the `if (!raw) return;` line, add a rolling
counter that logs every 2 seconds:

```ts
const frameCountRef = useRef(0);
const fpsWindowStartRef = useRef(Date.now());

const handleResult = (raw: PluginResult | undefined) => {
  frameCountRef.current += 1;
  const now = Date.now();
  const elapsedMs = now - fpsWindowStartRef.current;
  if (elapsedMs >= 2000) {
    const fps = (frameCountRef.current / elapsedMs) * 1000;
    console.log(`[useTextScanner] achieved fps: ${fps.toFixed(2)}`);
    frameCountRef.current = 0;
    fpsWindowStartRef.current = now;
  }

  if (!raw) return;
  // ... existing body
```

(`frameCountRef`/`fpsWindowStartRef` need `useRef` imported alongside the
existing `useRef`/`useState` import already in this file.)

**Step 2: Run on-device and capture the measurement**

```bash
cd apps/expo && npx expo run:android
```

Navigate to `/scan`, point at anything for at least 10 seconds, then:

```bash
adb logcat -d | grep "useTextScanner" | tail -20
```

Record the actual fps figures observed (expect several log lines from the
10+ second window).

**Step 3: Decide, don't guess**

- If achieved fps is reasonably close to the 8fps target (say, ≥ 6fps):
  the "felt slow" perception is likely about vote/lock latency or UI
  update batching, not the hot path — skip Task 3, note this in the design
  doc, and move to Task 4.
- If achieved fps is well below target (say, < 4fps): proceed to Task 3.

**Step 4: Remove the temporary logging**

Whichever branch Step 3 takes, remove the counter/log added in Step 1
before committing further work — it was diagnostic, not a permanent
feature.

**Step 5: Commit**

```bash
git add apps/expo/src/features/scanner/useTextScanner.ts
git commit -m "docs: no-op commit placeholder"
```

(Skip this commit if Step 1's diff was fully reverted in Step 4 and there's
nothing left to commit — check `git status` first.)

---

### Task 3: Remove the JPEG round-trip from the hot path (only if Task 2 found it slow)

**Files:**
- Modify: `apps/expo/modules/d4-ocr/android/src/main/java/expo/modules/d4ocr/D4OcrPlugin.kt`

**Step 1: Read what ML Kit's `InputImage` actually accepts**

```bash
find / -path /proc -prune -o -iname "InputImage.java" -print 2>/dev/null
```

Confirm `InputImage.fromByteArray(bytes, width, height, rotationDegrees,
imageFormat)` accepts `InputImage.IMAGE_FORMAT_NV21` directly — if so, the
current `YuvImage` → `compressToJpeg` → `BitmapFactory.decodeByteArray` →
`InputImage.fromBitmap` chain in `callback()` (lines ~40-51) can be replaced
by building the NV21 byte array (already produced by `imageToNv21`) and
passing it straight to `InputImage.fromByteArray`, skipping JPEG encode and
Bitmap decode entirely.

**Step 2: Handle the ROI crop without the JPEG step**

`YuvImage.compressToJpeg(roiRect, ...)` was doing double duty: JPEG encoding
*and* cropping to the ROI in one call. Without it, crop the NV21 buffer
itself before handing it to `InputImage.fromByteArray` — build a new NV21
byte array sized to `roiRect`'s dimensions, copying the Y-plane rows and
U/V bytes for just that sub-rectangle out of the full-frame `nv21` array
`imageToNv21` already produces. This is the same stride-aware copy pattern
already used in `imageToNv21`, applied to a sub-region instead of the full
frame.

**Step 3: Confirm it compiles**

```bash
cd apps/expo/android && ./gradlew :d4-ocr:compileDebugKotlin
```

**Step 4: Re-measure fps on-device**

Repeat Task 2's Steps 1-2 (temporarily re-add the counter) to confirm this
actually improved the achieved fps before trusting it. If it didn't move
the number, say so plainly in the design doc rather than assuming the
optimization worked because the code looks faster.

**Step 5: Commit**

```bash
git add apps/expo/modules/d4-ocr/android/src/main/java/expo/modules/d4ocr/D4OcrPlugin.kt
git commit -m "perf: skip JPEG round-trip in scanText hot path

Feeds ML Kit an NV21 InputImage built directly from the cropped YUV
buffer instead of YuvImage->compressToJpeg->BitmapFactory.decode.
Only worth doing because Task 2 measured achieved fps well under the
8fps target with the JPEG round-trip in place."
```

---

### Task 4: Tighten the ROI to match live camera framing

**Files:**
- Modify: `apps/expo/src/features/scanner/config.ts:6`

Phase 2's biggest accuracy finding: the live camera's ROI captures far more
surrounding context (monitor bezel, desktop chrome, browser UI) than the
fixture photos did, which is why field extraction locked onto garbage even
on the correct panel. This is iterative and visual — there's no shortcut
past looking at the actual framing.

**Step 1: Screenshot the current ROI overlay against the real panel**

With Diablo 4's CHARACTER stats panel on screen and the phone's camera
pointed at it (same setup as Phase 2's Task 12), screenshot:

```bash
adb shell screencap -p /sdcard/phase3_roi_before.png
adb pull /sdcard/phase3_roi_before.png /tmp/phase3_roi_before.png
```

Look at where the cyan ROI rectangle (from `scan.tsx`'s overlay `View`)
falls relative to the actual CHARACTER panel in the live preview. Note
concretely (e.g. "the panel only occupies the left third of the ROI box, and
extends below it") rather than guessing blind.

**Step 2: Adjust `scannerConfig.roi` to hug the panel**

Edit `apps/expo/src/features/scanner/config.ts`'s `roi` object based on
Step 1's observation. There's no single correct answer here — iterate:
change the values, reload (Fast Refresh handles this — it's a JS-only
change), re-screenshot, repeat until the cyan box in the live preview
tightly bounds just the CHARACTER panel content (header through the stat
rows) the way Phase 0's fixture photos did.

**Step 3: Confirm accuracy improved**

With the tightened ROI, watch `/scan`'s Level/Title/Name fields against the
real panel for at least 20 seconds (matching Phase 2 Task 12's protocol).
Screenshot the locked/settled values:

```bash
adb shell screencap -p /sdcard/phase3_roi_after.png
adb pull /sdcard/phase3_roi_after.png /tmp/phase3_roi_after.png
```

Record whether Level/Title/Name now lock to `93`/`UDAN`/`Demonic Defender`
(or close variants) rather than Phase 2's `3-9`/`PPED`/`ad`. If they still
don't, that's a real finding for the design doc, not a reason to keep
silently tweaking ROI numbers indefinitely — one more iteration of Step 2 is
reasonable, but if two tightening passes don't fix it, stop and record
that `fields.ts`'s geometric assumptions themselves need revisiting against
a real live block set (out of scope for this task - flag it, don't attempt
a rewrite here).

**Step 4: Commit**

```bash
git add apps/expo/src/features/scanner/config.ts
git commit -m "fix: tighten scan ROI to match live camera framing

Phase 2 found the live ROI captured far more surrounding context
(monitor bezel/desktop chrome) than the fixture photos did, causing
correct panel content to still lock onto wrong field values."
```

---

### Task 5: Record Phase 3 results

**Files:**
- Modify: `docs/plans/2026-09-17-d4-character-scan-spike-design.md`

**Step 1: Append results**

```bash
cat >> docs/plans/2026-09-17-d4-character-scan-spike-design.md <<'EOF'

## Phase 3 results

<!-- Fill in from Tasks 1-4's on-device observations: measured fps
     before/after (if Task 3 ran), whether the contrast fix is visually
     confirmed, whether the tightened ROI fixed field accuracy on the
     real CHARACTER panel, and what's still wrong if anything. -->
EOF
```

Fill in honestly, including if some task didn't fully resolve its problem
— this doc's job is the accurate record, not a success narrative.

**Step 2: Commit**

```bash
git add docs/plans/2026-09-17-d4-character-scan-spike-design.md
git commit -m "docs: record phase 3 tuning results"
```

---

## Out of scope for this plan

Rebuilding `fields.ts`'s fixtures from live (non-fixture-photo) captures,
the guided step-by-step overlay, item scanning, persistence, API/database
integration, iOS testing. If Task 4 finds `fields.ts` itself needs rework
against real live block sets, that becomes its own follow-up plan rather
than scope creep into this one.
