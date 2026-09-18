# D4 OCR Phase 1 — Frame Processor Build Risk Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prove that `react-native-vision-camera` 4.7.3 and `react-native-worklets-core`
can install, prebuild, build, and run a live frame processor on this app's actual
stack (Expo SDK 54, RN 0.81, Reanimated 4, `react-native-worklets@0.5.1`) — with
**no OCR involved yet**. This is the design doc's top-ranked build risk: two
separate worklet runtimes (Reanimated's `react-native-worklets` and VisionCamera's
`react-native-worklets-core`) living in one app. Phase 0 already answered whether
ML Kit can read the sheet at all; Phase 1 answers whether the camera stack builds
and runs at all. If it doesn't, the design doc's fallback (`expo-camera` +
`@react-native-ml-kit/text-recognition` over captured stills) gets evaluated
instead — that fallback is out of scope for this plan and only happens if Task 3
fails outright.

**Non-goals:** no custom native OCR plugin (`apps/expo/modules/d4-ocr/`), no
`anchor.ts`/`fields.ts`/`voting.ts`, no real scan screen. Those are Phase 2. This
phase's only deliverable is a throwaway screen proving a frame processor
`'worklet'` function executes per-frame and can get a value back to JS-visible
React state without the app crashing or the build failing.

Design reference: `docs/plans/2026-09-17-d4-character-scan-spike-design.md`

---

### Task 0: Pin and install the dependencies

**Files:**
- Modify: `apps/expo/package.json`

**Step 1: Confirm current stack versions**

```bash
cd apps/expo
grep -E "\"expo\"|react-native\"|reanimated|worklets|gesture-handler" package.json
```

Expected (as of Phase 0): `expo ~54.0.20`, `react-native ~0.81.5`,
`react-native-reanimated ~4.1.3`, `react-native-worklets ~0.5.1`. If these have
drifted since Phase 0, note it — the version matrix below assumes these.

**Step 2: Install VisionCamera and worklets-core**

`react-native-vision-camera@5.x` is built against RN 0.85 and is too far ahead
per the design doc's dependency findings — pin the 4.x line explicitly, do not
let a bare `install` pick up latest:

```bash
npx expo install react-native-vision-camera@4.7.3
npx expo install react-native-worklets-core@1.6.3
```

`expo install` (not raw npm/pnpm add) so Expo can flag any known incompatibility
against the installed SDK/RN version before you've sunk time into prebuild.

**Step 3: Read what actually installed**

```bash
grep -E "vision-camera|worklets-core" package.json
cat node_modules/react-native-vision-camera/package.json | grep -A5 '"peerDependencies"'
```

Confirm no peer dependency warnings printed during install that mention
`react-native-worklets` (Reanimated's package) or `react-native-reanimated`
version mismatches. If `expo install` silently changed the pinned version away
from `4.7.3` or `1.6.3`, stop and check why before continuing — the whole point
of this phase is testing this exact matrix.

**Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add react-native-vision-camera and worklets-core"
```

---

### Task 1: Configure the VisionCamera plugin and camera permission

**Files:**
- Modify: `apps/expo/app.config.ts`

**Step 1: Read the plugin's actual config options**

Don't guess the plugin options from memory — VisionCamera's Expo config plugin
options have changed across versions. Read them directly:

```bash
cat apps/expo/node_modules/react-native-vision-camera/app.plugin.js 2>/dev/null | head -50
find apps/expo/node_modules/react-native-vision-camera -iname "*.md" | xargs grep -l "cameraPermissionText\|withVisionCamera" 2>/dev/null
```

Look for the plugin's expected options (typically a camera usage-description
string and toggles for microphone/code-scanner permissions). Confirm the actual
option names/defaults from this installed copy rather than from general
knowledge, since minor versions have renamed fields before.

**Step 2: Add the plugin entry**

Edit `apps/expo/app.config.ts`, adding the VisionCamera plugin to the `plugins`
array (after `expo-build-properties`, order doesn't matter but keep it
consistent with the rest of the list):

```ts
[
  "react-native-vision-camera",
  {
    cameraPermissionText: "$(PRODUCT_NAME) needs camera access to scan your Diablo 4 character sheet.",
    enableMicrophonePermission: false,
    enableCodeScanner: false,
  },
],
```

Adjust the exact keys to match what Step 1 found. If the installed plugin
doesn't support `enableCodeScanner` (older/newer versions vary), drop it — extra
unrecognized keys can cause a silent no-op or a hard config error depending on
version, so match it exactly rather than including options defensively.

**Step 3: Add the Android camera permission explicitly if the plugin doesn't**

Some versions of the config plugin only add the iOS `Info.plist` string and
expect Android's `CAMERA` permission to already be declared. If the plugin's
source (from Step 1) shows it only touches `ios`, add to `app.config.ts`:

```ts
android: {
  package: "your.bundle.identifier",
  permissions: ["android.permission.CAMERA"],
  // ...existing adaptiveIcon, edgeToEdgeEnabled
},
```

**Step 4: Commit**

```bash
git add apps/expo/app.config.ts
git commit -m "chore: configure VisionCamera plugin and camera permission"
```

---

### Task 2: Prebuild and confirm a clean native build

This is the moment of truth for the two-worklet-runtimes risk — if
`react-native-worklets-core` and `react-native-worklets` collide at the native
build level (duplicate JSI symbols, Gradle/CocoaPods dependency resolution
conflicts), it shows up here, before any app code runs.

**Files:**
- Regenerates: `apps/expo/android/` (already tracked — see Phase 0's note in
  `.gitignore` about why; this phase's `android/` changes get committed too)

**Step 1: Prebuild**

```bash
cd apps/expo
npx expo prebuild --platform android
```

Expected: `Finished prebuild`, no dependency-conflict warnings mentioning
worklets. If prebuild reports "the android project is malformed" and offers to
clear it, that's fine here (Phase 0 already established `android/` is
regenerable and only its custom `androidTest` additions are hand-maintained —
`character-sheets/` and `OcrPhase0Test.kt`). Confirm those two didn't get wiped
after prebuild finishes:

```bash
ls android/app/src/androidTest/assets/character-sheets/ | wc -l   # expect 14
ls android/app/src/androidTest/java/expo/modules/d4ocr/OcrPhase0Test.kt
```

If prebuild wiped them, restore from git (`git checkout -- android/app/src/androidTest`)
before continuing — don't let this phase's churn silently regress Phase 0's
fixtures again.

**Step 2: Build**

```bash
cd android && ./gradlew :app:assembleDebug
```

Expected: `BUILD SUCCESSFUL`. If it fails with something like "duplicate class"
or a JSI/Hermes symbol collision naming both `worklets` packages, that is the
top risk materializing — stop and record the exact error in the design doc's
risk section before attempting any workaround. Don't spend more than one retry
cycle patching Gradle exclude rules blind; a real conflict here is signal that
the fallback path (design doc's `expo-camera` + `@react-native-ml-kit`
alternative) is the right call, not something to route around silently.

**Step 3: Commit the regenerated project**

```bash
cd ..
git add android/
git commit -m "chore: prebuild android project with VisionCamera and worklets-core"
```

---

### Task 3: Minimal frame-processor smoke screen

**Files:**
- Create: `apps/expo/src/app/scan-phase1-test.tsx`

**Step 1: Write the screen**

A throwaway route, not the real scan screen (that's Phase 2's `scan.tsx`).
Camera preview, permission request, and a `'worklet'` frame processor that
increments a shared frame counter and periodically hands a value to JS via
`runOnJS` — enough to prove the worklet runtime actually executes per-frame and
can cross back into the React JS thread without crashing:

```tsx
import { useCallback, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useFrameProcessor,
} from "react-native-vision-camera";
import { runOnJS } from "react-native-worklets-core";

export default function ScanPhase1Test() {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice("back");
  const [frameCount, setFrameCount] = useState(0);
  const [lastFrameSize, setLastFrameSize] = useState("");

  const updateFromJs = useCallback((count: number, size: string) => {
    setFrameCount(count);
    setLastFrameSize(size);
  }, []);

  const frameProcessor = useFrameProcessor((frame) => {
    "worklet";
    runOnJS(updateFromJs)(frame.timestamp, `${frame.width}x${frame.height}`);
  }, [updateFromJs]);

  if (!hasPermission) {
    requestPermission();
    return (
      <View style={styles.center}>
        <Text>Requesting camera permission…</Text>
      </View>
    );
  }

  if (!device) {
    return (
      <View style={styles.center}>
        <Text>No camera device found.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={true}
        frameProcessor={frameProcessor}
        pixelFormat="yuv"
      />
      <View style={styles.overlay}>
        <Text style={styles.overlayText}>frame ts: {frameCount}</Text>
        <Text style={styles.overlayText}>size: {lastFrameSize}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  overlay: {
    position: "absolute",
    top: 60,
    left: 16,
    backgroundColor: "rgba(0,0,0,0.6)",
    padding: 8,
    borderRadius: 8,
  },
  overlayText: { color: "white" },
});
```

Note `runOnJS` here is imported from `react-native-worklets-core`, not from
`react-native-reanimated` — that's the exact cross-runtime call this phase is
testing. If VisionCamera's frame processor worklet can't find or call this
`runOnJS`, or if it silently calls into the wrong worklet runtime and crashes,
that's the risk surfacing.

**Step 2: Confirm the route is reachable**

Since this is a throwaway diagnostic screen, wire it in the simplest way that
lets you open it — either a temporary link from `src/app/index.tsx`, or just
navigate to it directly via the dev menu / deep link
(`npx expo start` then open `/scan-phase1-test`). Don't spend time making this
polished; it gets deleted at the end of Phase 1 regardless of outcome (Task 5).

**Step 3: Commit**

```bash
git add apps/expo/src/app/scan-phase1-test.tsx
git commit -m "test: add frame processor smoke screen for phase 1"
```

---

### Task 4: Build and run on device

**Step 1: Start a dev build**

```bash
cd apps/expo
npx expo run:android
```

This builds and installs a debug dev-client build (not Expo Go — frame
processors and worklets-core need native code Expo Go can't provide). Expect it
to build on top of Task 2's already-proven Gradle setup.

**Step 2: Open the smoke screen on device**

Navigate to `/scan-phase1-test`. Grant the camera permission when prompted.

**Step 3: Observe and record, don't rubber-stamp**

Watch the on-screen overlay for at least 10–15 seconds. Answer explicitly:

1. Does the app launch without crashing?
2. Does the overlay's frame timestamp/size actually update (proving the
   frame processor worklet is running per-frame, not just installed)?
3. Does anything else on the app misbehave — do Reanimated-based animations
   elsewhere in the app (if any are visible/testable) still work while the
   camera screen is mounted, suggesting the two worklet runtimes aren't
   fighting over the JS thread?
4. Any crash log, ANR, or native crash in `adb logcat` during this test?

```bash
adb logcat -d | grep -iE "FATAL|AndroidRuntime|worklets" | tail -50
```

If it crashes or the overlay never updates, capture the exact logcat error
before touching anything — this is the top risk from the design doc, and the
exact failure mode (JSI symbol collision vs. permission issue vs. something
else) determines whether Phase 2 needs the custom plugin approach revisited or
whether the design doc's fallback plan should be triggered instead.

---

### Task 5: Record results, clean up, and decide

This is a decision point, not code — do not skip it.

**Step 1: Remove the throwaway screen**

Regardless of outcome, this screen was scaffolding for this phase only —
Phase 2 builds the real `scan.tsx` from scratch against the design doc's actual
component list (`useTextScanner.ts`, `anchor.ts`, `fields.ts`, `voting.ts`).
Keeping this file around invites confusion about which screen is "the" scanner.

```bash
git rm apps/expo/src/app/scan-phase1-test.tsx
git commit -m "chore: remove phase 1 frame processor smoke screen"
```

If any temporary link/nav entry was added in Task 3 Step 2 to reach the screen,
remove that too in the same commit.

**Step 2: Append results to the design doc**

```bash
cat >> docs/plans/2026-09-17-d4-character-scan-spike-design.md <<'EOF'

## Phase 1 results

<!-- Fill in from Task 4's observations: did it build, did it run, did the two
     worklet runtimes coexist without crashing, and the go/no-go for Phase 2. -->
EOF
```

Fill in:

1. Did `assembleDebug` succeed cleanly (Task 2), or was there a real
   dependency conflict? If there was one, quote the exact error.
2. Did the dev build launch and run without crashing (Task 4)?
3. Did the frame processor actually fire per-frame (overlay updating), proving
   `react-native-worklets-core`'s worklet runtime executes correctly alongside
   Reanimated's `react-native-worklets`?
4. Any secondary symptoms — dropped frame rate, jank elsewhere in the app,
   warnings in Metro/logcat worth flagging for Phase 2 even if not blocking?

```bash
git add docs/plans/2026-09-17-d4-character-scan-spike-design.md
git commit -m "docs: record phase 1 frame processor build results"
```

**Step 3: Decide**

If Task 2 built clean and Task 4's overlay updated without a crash, Phase 2 is
clear to proceed with VisionCamera + worklets-core as designed — the top risk
is retired. If Task 2 failed to build, or Task 4 crashed or hung, do not attempt
to patch around it inside Phase 2's scope. Escalate to picking the design doc's
fallback (`expo-camera` + `@react-native-ml-kit/text-recognition` over captured
stills, ~1–2fps) and write that as a new, separate implementation plan rather
than bolting a workaround onto this one.

---

## Out of scope for this plan

The native `D4OcrPlugin` (Kotlin/Swift), `anchor.ts`/`fields.ts`/`voting.ts`,
the real scan screen and its ROI overlay, unit tests for the JS layer, and any
tuning of fps/vote thresholds. Those are Phase 2 (and Phase 3) per the design
doc, and get their own implementation plan once Phase 1's go/no-go is decided.
