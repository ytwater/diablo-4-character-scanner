# D4 OCR Phase 2 — Native Plugin and Scan Pipeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the real scan pipeline: a native VisionCamera frame processor plugin
(`scanText`) that wraps ML Kit text recognition and returns text blocks with
bounding boxes, a pure-JS anchor/field-extraction/voting layer over those blocks,
and a real `scan.tsx` screen that shows live candidates solidifying into locked
values. Phase 0 proved ML Kit can read the sheet; Phase 1 proved VisionCamera +
`react-native-worklets-core` build and run alongside Reanimated. This phase wires
the two together into the actual product.

**Architecture:** The frame processor worklet calls the native plugin
synchronously (`plugin.call(frame, options)`), which crops the YUV frame to the
configured ROI, runs ML Kit, and returns `{ blocks, width, height }` as a plain
JS object (no JSON string marshaling — VisionCamera's JSI bridge supports nested
maps/arrays natively). The worklet then hops back to the JS thread via
`useRunOnJS` (from `react-native-worklets-core` — **not** `runOnJS`, which
doesn't exist as a top-level export in this version; see Phase 1's findings) and
hands the raw blocks to plain, fully synchronous TypeScript: `anchor.ts` finds
the "CHARACTER" panel header by fuzzy match, `fields.ts` extracts level/title/name
by their geometric position relative to that anchor, and `voting.ts` runs a
rolling-window vote to decide when a candidate is locked. None of that JS needs
to be a worklet — it all runs on the JS thread, which is what makes it plain,
synchronously testable Jest code with no camera or worklet machinery involved.

**Tech Stack:** Expo Modules API (`create-expo-module --local`) for the native
plugin, Kotlin + ML Kit `TextRecognition` on Android (Swift + Vision scaffolded,
untested, per the design doc), `react-native-vision-camera@4.7.3` +
`react-native-worklets-core@1.6.3` (already installed and proven in Phase 1),
Jest for the pure-function JS layer.

Design reference: `docs/plans/2026-09-17-d4-character-scan-spike-design.md`
(see "Components", "The anchor strategy", "Lock-in rule", and both phases'
results sections already appended to it).

---

## Known limitations to carry into this plan

- **ML Kit's per-block `confidence` is not real.** In `text-recognition:16.0.1`
  (the version already resolved in this repo, confirmed in Phase 0), the
  `confidence` field on `Text.Element`/`TextBlock` is deprecated and effectively
  always `1.0`. The native plugin still returns a `confidence` field (matching
  the design doc's shape), but `voting.ts` and `fields.ts` must not use it as a
  real reliability signal — only vote *counts* are meaningful.
- **The YUV→NV21 conversion in the plugin (Task 2) is stride-aware and correct**
  for the general case, but has only been checked by code review, not against
  every device's camera HAL. Task 12's on-device verification is where a
  garbled/striped OCR result would show up — if that happens, suspect this
  conversion first before suspecting ML Kit or the anchor/field logic.
- **`fields.ts`'s geometric offsets (Task 8) are a first-pass heuristic**, not
  measured against this app's real captured bounding boxes, because those boxes
  don't exist yet — Task 5 captures them. Task 8's Step 1 is a mandatory
  investigative step: open the real fixture JSON and confirm (or correct) the
  assumed layout before writing the extraction logic.

---

### Task 0: Scaffold the `d4-ocr` native module

**Files:**
- Create: `apps/expo/modules/d4-ocr/` (generated)

**Step 1: Run the Expo module generator**

```bash
cd apps/expo
npx create-expo-module@latest --local \
  --name D4Ocr \
  --package expo.modules.d4ocr \
  --description "VisionCamera frame processor plugin wrapping on-device OCR" \
  --platform android --platform apple \
  --no-example \
  modules/d4-ocr
```

This matches the Kotlin package Phase 0 already used
(`expo.modules.d4ocr`, see `android/app/src/androidTest/java/expo/modules/d4ocr/OcrPhase0Test.kt`).
If the CLI prompts interactively for any field not covered by a flag, accept the
shown default.

**Step 2: Confirm the generated layout**

```bash
find modules/d4-ocr -type f | sort
```

Expected: `modules/d4-ocr/expo-module.config.json`, `modules/d4-ocr/android/build.gradle`,
`modules/d4-ocr/android/src/main/java/expo/modules/d4ocr/D4OcrModule.kt`,
`modules/d4-ocr/ios/D4OcrModule.swift`, `modules/d4-ocr/src/index.ts`,
`modules/d4-ocr/package.json`. Exact filenames depend on the installed
`create-expo-module` version — adjust the paths used in later tasks if they
differ from these.

**Step 3: Confirm autolinking picks it up**

```bash
npx expo config --json | grep -A3 '"d4-ocr"' || npx expo-modules-autolinking resolve --platform android | grep d4-ocr
```

Expected: the module shows up in the autolinking output. `apps/expo/modules/`
is scanned by default — no `app.config.ts` changes needed.

**Step 4: Commit**

```bash
git add modules/d4-ocr
git commit -m "chore: scaffold d4-ocr native module"
```

---

### Task 1: Shared ML Kit recognizer (Android)

**Files:**
- Create: `apps/expo/modules/d4-ocr/android/src/main/java/expo/modules/d4ocr/D4OcrRecognizer.kt`

This is the single code path both the live frame-processor plugin (Task 2) and
the fixture-export instrumented test (Task 5) call, so fixture data is
guaranteed to match production behavior exactly — the same pattern Phase 0
established.

**Step 1: Write the recognizer**

```kotlin
package expo.modules.d4ocr

import android.graphics.Rect
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions

data class D4OcrBlock(
    val text: String,
    val x: Int,
    val y: Int,
    val width: Int,
    val height: Int,
    // ML Kit's per-block confidence is deprecated and always 1.0 in this API
    // version (text-recognition:16.0.1) - kept for shape parity with the
    // design doc, not a real reliability signal.
    val confidence: Double,
)

object D4OcrRecognizer {
    private val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)

    fun recognize(image: InputImage): List<D4OcrBlock> {
        val result = Tasks.await(recognizer.process(image))
        return result.textBlocks.map { block ->
            val box = block.boundingBox ?: Rect()
            D4OcrBlock(
                text = block.text,
                x = box.left,
                y = box.top,
                width = box.width(),
                height = box.height(),
                confidence = 1.0,
            )
        }
    }
}
```

**Step 2: Confirm it compiles**

```bash
cd android && ./gradlew :d4-ocr:compileDebugKotlin
```

Expected: `BUILD SUCCESSFUL`. (Module name in the Gradle task path may differ —
if this exact task doesn't exist, run `./gradlew :app:compileDebugKotlin`
instead, which will still catch compile errors in the linked module.)

**Step 3: Commit**

```bash
cd ..
git add modules/d4-ocr/android/src/main/java/expo/modules/d4ocr/D4OcrRecognizer.kt
git commit -m "feat: add shared ML Kit recognizer for d4-ocr module"
```

---

### Task 2: The `scanText` frame processor plugin (Android)

**Files:**
- Create: `apps/expo/modules/d4-ocr/android/src/main/java/expo/modules/d4ocr/D4OcrPlugin.kt`
- Modify: `apps/expo/modules/d4-ocr/android/src/main/java/expo/modules/d4ocr/D4OcrModule.kt`

**Step 1: Read VisionCamera's actual plugin base classes**

Already confirmed during planning (don't re-derive from memory — versions
change): `FrameProcessorPlugin` is an abstract class with
`callback(frame: Frame, params: Map<String, Object>?): Any?`, registered via
`FrameProcessorPluginRegistry.addFrameProcessorPlugin(name, initializer)`. The
Android JSI bridge accepts nested maps/arrays as a return value directly — no
manual JSON serialization needed for the plugin's return value. Confirm this
still matches the installed version before writing the plugin:

```bash
cat node_modules/react-native-vision-camera/android/src/main/java/com/mrousavy/camera/frameprocessors/FrameProcessorPlugin.java
cat node_modules/react-native-vision-camera/android/src/main/java/com/mrousavy/camera/frameprocessors/FrameProcessorPluginRegistry.java
```

**Step 2: Write the plugin**

```kotlin
package expo.modules.d4ocr

import android.graphics.ImageFormat
import android.graphics.Rect
import android.graphics.YuvImage
import android.media.Image
import com.google.mlkit.vision.common.InputImage
import com.mrousavy.camera.frameprocessors.Frame
import com.mrousavy.camera.frameprocessors.FrameProcessorPlugin
import com.mrousavy.camera.frameprocessors.VisionCameraProxy
import java.io.ByteArrayOutputStream

class D4OcrPlugin(proxy: VisionCameraProxy, options: Map<String, Any>?) : FrameProcessorPlugin() {

    override fun callback(frame: Frame, params: Map<String, Any>?): Any? {
        val image = frame.imageProxy.image ?: return null
        val width = image.width
        val height = image.height

        val roiX = ((params?.get("roiX") as? Number)?.toDouble() ?: 0.0).coerceIn(0.0, 1.0)
        val roiY = ((params?.get("roiY") as? Number)?.toDouble() ?: 0.0).coerceIn(0.0, 1.0)
        val roiWidth = ((params?.get("roiWidth") as? Number)?.toDouble() ?: 1.0).coerceIn(0.01, 1.0)
        val roiHeight = ((params?.get("roiHeight") as? Number)?.toDouble() ?: 1.0).coerceIn(0.01, 1.0)

        val roiRect = Rect(
            (roiX * width).toInt(),
            (roiY * height).toInt(),
            ((roiX + roiWidth) * width).toInt().coerceAtMost(width),
            ((roiY + roiHeight) * height).toInt().coerceAtMost(height),
        )

        val nv21 = imageToNv21(image)
        val yuvImage = YuvImage(nv21, ImageFormat.NV21, width, height, null)
        val jpegStream = ByteArrayOutputStream()
        yuvImage.compressToJpeg(roiRect, 90, jpegStream)
        val jpegBytes = jpegStream.toByteArray()

        val bitmap = android.graphics.BitmapFactory.decodeByteArray(jpegBytes, 0, jpegBytes.size)
            ?: return null
        val rotationDegrees = frame.imageProxy.imageInfo.rotationDegrees
        val inputImage = InputImage.fromBitmap(bitmap, rotationDegrees)

        val blocks = D4OcrRecognizer.recognize(inputImage)

        return mapOf(
            "blocks" to blocks.map { b ->
                mapOf(
                    "text" to b.text,
                    "confidence" to b.confidence,
                    "frame" to mapOf(
                        "x" to b.x,
                        "y" to b.y,
                        "width" to b.width,
                        "height" to b.height,
                    ),
                )
            },
            "width" to bitmap.width,
            "height" to bitmap.height,
        )
    }

    /**
     * Stride-aware YUV_420_888 -> NV21 conversion. Camera planes are not
     * guaranteed to be tightly packed (row/pixel stride can exceed
     * width/1 respectively), so this reads via each plane's actual strides
     * rather than assuming a packed buffer.
     */
    private fun imageToNv21(image: Image): ByteArray {
        val width = image.width
        val height = image.height
        val chromaWidth = width / 2
        val chromaHeight = height / 2
        val nv21 = ByteArray(width * height + chromaWidth * chromaHeight * 2)

        val yPlane = image.planes[0]
        val yBuffer = yPlane.buffer.duplicate()
        var pos = 0
        for (row in 0 until height) {
            yBuffer.position(row * yPlane.rowStride)
            yBuffer.get(nv21, pos, width)
            pos += width
        }

        val uPlane = image.planes[1]
        val vPlane = image.planes[2]
        val uBuffer = uPlane.buffer.duplicate()
        val vBuffer = vPlane.buffer.duplicate()

        for (row in 0 until chromaHeight) {
            for (col in 0 until chromaWidth) {
                val vIndex = row * vPlane.rowStride + col * vPlane.pixelStride
                val uIndex = row * uPlane.rowStride + col * uPlane.pixelStride
                nv21[pos++] = vBuffer.get(vIndex)
                nv21[pos++] = uBuffer.get(uIndex)
            }
        }

        return nv21
    }
}
```

**Step 3: Register the plugin at module init**

Open `modules/d4-ocr/android/src/main/java/expo/modules/d4ocr/D4OcrModule.kt` (as
generated by Task 0) and register the plugin inside the `definition {}` block's
`OnCreate {}` lifecycle hook — this runs once when Expo's autolinking
instantiates the module at app startup, guaranteeing the plugin is registered
before any JS code can call `VisionCameraProxy.initFrameProcessorPlugin`:

```kotlin
package expo.modules.d4ocr

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import com.mrousavy.camera.frameprocessors.FrameProcessorPluginRegistry

class D4OcrModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("D4Ocr")

    OnCreate {
      FrameProcessorPluginRegistry.addFrameProcessorPlugin("scanText") { proxy, options ->
        D4OcrPlugin(proxy, options)
      }
    }
  }
}
```

Remove any generated example code (constants, `hello()` functions, views) from
this file — this module has no JS-facing API of its own; its only job is
native-side plugin registration. `scanText` must be reachable via
`react-native-vision-camera` as a Gradle dependency of the `d4-ocr` module —
confirm `modules/d4-ocr/android/build.gradle` has
`implementation project(':react-native-vision-camera')` (or the equivalent
`compileOnly`/`api` dependency create-expo-module wired up); if VisionCamera
classes don't resolve when you compile in Step 4, add that dependency line
explicitly.

**Step 4: Confirm it compiles**

```bash
cd android && ./gradlew :app:compileDebugKotlin
```

Expected: `BUILD SUCCESSFUL`, no unresolved `com.mrousavy.camera...` imports.

**Step 5: Commit**

```bash
cd ..
git add modules/d4-ocr/android
git commit -m "feat: implement scanText frame processor plugin (Android)"
```

---

### Task 3: iOS scaffold (compile-only, not tested)

Per the design doc: "iOS is scaffolded and compiled but not tested" and "iOS
testing" is explicitly out of scope. Write real Swift, confirm it compiles, do
not attempt to run it on a simulator/device.

**Files:**
- Create: `apps/expo/modules/d4-ocr/ios/D4OcrPlugin.swift`
- Modify: `apps/expo/modules/d4-ocr/ios/D4OcrModule.swift`

**Step 1: Write the plugin**

```swift
import VisionCamera
import Vision
import UIKit

class D4OcrPlugin: FrameProcessorPlugin {
  public override init(proxy: VisionCameraProxyHolder, options: [AnyHashable: Any]! = [:]) {
    super.init(proxy: proxy, options: options)
  }

  public override func callback(_ frame: Frame, withArguments arguments: [AnyHashable: Any]?) -> Any? {
    guard let pixelBuffer = frame.buffer else { return nil }

    let roiX = (arguments?["roiX"] as? Double) ?? 0.0
    let roiY = (arguments?["roiY"] as? Double) ?? 0.0
    let roiWidth = (arguments?["roiWidth"] as? Double) ?? 1.0
    let roiHeight = (arguments?["roiHeight"] as? Double) ?? 1.0

    let ciImage = CIImage(cvPixelBuffer: pixelBuffer)
    let fullExtent = ciImage.extent
    let roiRect = CGRect(
      x: fullExtent.origin.x + roiX * fullExtent.width,
      y: fullExtent.origin.y + roiY * fullExtent.height,
      width: roiWidth * fullExtent.width,
      height: roiHeight * fullExtent.height
    )
    let croppedImage = ciImage.cropped(to: roiRect)

    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    let handler = VNImageRequestHandler(ciImage: croppedImage, options: [:])

    do {
      try handler.perform([request])
    } catch {
      return nil
    }

    let blocks = (request.results ?? []).compactMap { observation -> [String: Any]? in
      guard let candidate = observation.topCandidates(1).first else { return nil }
      let box = observation.boundingBox
      // Vision's boundingBox is normalized (0-1) with origin bottom-left;
      // convert to pixel coordinates with origin top-left to match Android's shape.
      let x = box.origin.x * roiRect.width
      let y = (1 - box.origin.y - box.height) * roiRect.height
      return [
        "text": candidate.string,
        "confidence": Double(candidate.confidence),
        "frame": [
          "x": Int(x),
          "y": Int(y),
          "width": Int(box.width * roiRect.width),
          "height": Int(box.height * roiRect.height),
        ],
      ]
    }

    return [
      "blocks": blocks,
      "width": Int(roiRect.width),
      "height": Int(roiRect.height),
    ]
  }
}
```

**Step 2: Register at module init**

Edit `modules/d4-ocr/ios/D4OcrModule.swift` (as generated by Task 0):

```swift
import ExpoModulesCore
import VisionCamera

public class D4OcrModule: Module {
  public func definition() -> ModuleDefinition {
    Name("D4Ocr")

    OnCreate {
      FrameProcessorPluginRegistry.addFrameProcessorPlugin("scanText") { proxy, options in
        D4OcrPlugin(proxy: proxy, options: options)
      }
    }
  }
}
```

**Step 3: Confirm it compiles (do not run)**

```bash
cd ios && pod install && xcodebuild -workspace *.xcworkspace -scheme "$(basename *.xcworkspace .xcworkspace)" -configuration Debug -sdk iphonesimulator build CODE_SIGNING_ALLOWED=NO 2>&1 | tail -60
```

Expected: `** BUILD SUCCEEDED **`. This confirms the Swift compiles against the
installed `react-native-vision-camera` iOS pods; it does not prove the plugin
works at runtime. If `pod install` or the build itself fails for reasons
unrelated to this file (e.g. missing Xcode, no macOS toolchain available in
this environment), note that in the design doc's Phase 2 results and move on —
per the design doc, iOS runtime testing is out of scope for this repo's current
target platform (Android).

**Step 4: Commit**

```bash
cd ..
git add modules/d4-ocr/ios
git commit -m "feat: scaffold scanText frame processor plugin (iOS, compile-only)"
```

---

### Task 4: Prebuild and build sanity check

Mirrors Phase 1's Task 2 — confirm the new local native module links cleanly
before investing in the JS layer on top of it.

**Step 1: Prebuild**

```bash
cd apps/expo
npx expo prebuild --platform android
```

Expected: `Finished prebuild`, no errors about the `d4-ocr` module failing to
autolink. Confirm Phase 0's fixtures survived (same check as Phase 1 Task 2):

```bash
ls android/app/src/androidTest/assets/character-sheets/ | wc -l   # expect 14
ls android/app/src/androidTest/java/expo/modules/d4ocr/OcrPhase0Test.kt
```

**Step 2: Build**

```bash
cd android && ./gradlew :app:assembleDebug
```

Expected: `BUILD SUCCESSFUL`. Watch specifically for the `d4-ocr` module's
Kotlin compiling clean and for no duplicate-registration errors (the assertion
in `FrameProcessorPluginRegistry.addFrameProcessorPlugin` throws if `"scanText"`
is somehow registered twice — shouldn't happen with one `OnCreate` block, but a
duplicate class definition would surface here).

**Step 3: Commit the regenerated project (if changed)**

```bash
cd ..
git add android/
git status --short   # only commit if there's an actual diff
git commit -m "chore: prebuild android project with d4-ocr module" --allow-empty-message 2>/dev/null || true
```

If `git status --short` shows nothing for `android/`, skip the commit.

---

### Task 5: Capture real ML Kit block+bbox fixtures

**Files:**
- Create: `apps/expo/android/app/src/androidTest/java/expo/modules/d4ocr/OcrFixtureExportTest.kt`
- Create (via `adb pull`, see Step 3): `apps/expo/src/features/scanner/__fixtures__/ocr-blocks/*.json`

The pure JS functions in Tasks 7–9 need real bounding-box data to test against.
This reuses `D4OcrRecognizer` from Task 1 against the same 14 photos Phase 0
already committed, so the fixtures match exactly what the live plugin would
produce for those images.

**Step 1: Write the export test**

```kotlin
package expo.modules.d4ocr

import android.graphics.BitmapFactory
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.google.mlkit.vision.common.InputImage
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

@RunWith(AndroidJUnit4::class)
class OcrFixtureExportTest {

    @Test
    fun exportOcrFixtures() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val outputDir = File(instrumentation.targetContext.getExternalFilesDir(null), "ocr-fixtures")
        outputDir.mkdirs()

        (1..14).map { "character-sheet-%02d.jpg".format(it) }.forEach { fileName ->
            val bytes = instrumentation.context.assets.open("character-sheets/$fileName").use { it.readBytes() }
            val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
            val inputImage = InputImage.fromBitmap(bitmap, 0)
            val blocks = D4OcrRecognizer.recognize(inputImage)

            val json = JSONObject().apply {
                put("width", bitmap.width)
                put("height", bitmap.height)
                put(
                    "blocks",
                    JSONArray(
                        blocks.map { b ->
                            JSONObject().apply {
                                put("text", b.text)
                                put("confidence", b.confidence)
                                put(
                                    "frame",
                                    JSONObject().apply {
                                        put("x", b.x)
                                        put("y", b.y)
                                        put("width", b.width)
                                        put("height", b.height)
                                    },
                                )
                            }
                        },
                    ),
                )
            }

            File(outputDir, fileName.replace(".jpg", ".json")).writeText(json.toString(2))
        }
    }
}
```

**Step 2: Run it on device**

```bash
cd apps/expo/android
./gradlew :app:connectedDebugAndroidTest -Pandroid.testInstrumentationRunnerArguments.class=expo.modules.d4ocr.OcrFixtureExportTest
```

Expected: `BUILD SUCCESSFUL`, 1 test passed.

**Step 3: Pull the fixtures**

```bash
cd ../..
mkdir -p apps/expo/src/features/scanner/__fixtures__/ocr-blocks
adb pull /sdcard/Android/data/your.bundle.identifier/files/ocr-fixtures/. apps/expo/src/features/scanner/__fixtures__/ocr-blocks/
ls apps/expo/src/features/scanner/__fixtures__/ocr-blocks/ | wc -l   # expect 14
```

**Step 4: Check the anchor assumption before moving on**

The whole pipeline hinges on the "CHARACTER" panel header being present
verbatim in at least most captures — this was never directly checked in Phase 0
(which only asserted on level/name/title strings). Check now:

```bash
grep -l "CHARACTER" apps/expo/src/features/scanner/__fixtures__/ocr-blocks/*.json | wc -l
grep -li "character" apps/expo/src/features/scanner/__fixtures__/ocr-blocks/*.json | wc -l
```

If the exact-case count is low but the case-insensitive count is high, that's
fine — `anchor.ts` (Task 7) fuzzy-matches case-insensitively. If **both** counts
are low (say, under 8 of 14), stop here and record it as a new finding in the
design doc before continuing — the anchor strategy itself would need
reconsidering, which is bigger than this task.

**Step 5: Commit**

```bash
git add apps/expo/android/app/src/androidTest/java/expo/modules/d4ocr/OcrFixtureExportTest.kt
git add apps/expo/src/features/scanner/__fixtures__/
git commit -m "test: capture ML Kit block+bbox fixtures for scanner unit tests"
```

---

### Task 6: `config.ts`

**Files:**
- Create: `apps/expo/src/features/scanner/config.ts`

**Step 1: Write the config**

```typescript
export const scannerConfig = {
  targetFps: 8,
  // Normalized (0-1) region of interest, relative to the cropped/captured
  // frame. Placeholder values - tune against real device framing in Phase 3.
  roi: { x: 0.1, y: 0.15, width: 0.8, height: 0.5 },
  anchorText: "CHARACTER",
  // Similarity threshold (1 - normalizedLevenshteinDistance) to accept a
  // block as the anchor. Tune in Phase 3 against Task 5's fixtures.
  anchorFuzzyThreshold: 0.75,
  vote: {
    windowSize: 8,
    thresholds: {
      level: 3,
      title: 3,
      name: 5,
    },
  },
} as const;

export type ScannerConfig = typeof scannerConfig;
```

**Step 2: Commit**

```bash
cd apps/expo
git add src/features/scanner/config.ts
git commit -m "feat: add scanner config"
```

---

### Task 7: `anchor.ts`

**Files:**
- Create: `apps/expo/src/features/scanner/anchor.ts`
- Test: `apps/expo/src/features/scanner/anchor.test.ts`

**Step 1: Write the failing test**

Use one of Task 5's real fixtures. Adjust the fixture filename/expected text in
this test once you've looked at the actual JSON (Task 5 Step 4 already told you
whether "CHARACTER" appears verbatim or needs case-insensitive matching):

```typescript
import fixture from "./__fixtures__/ocr-blocks/character-sheet-01.json";
import { findAnchor } from "./anchor";
import { scannerConfig } from "./config";

describe("findAnchor", () => {
  it("finds the CHARACTER panel header in a real capture", () => {
    const anchor = findAnchor(
      fixture.blocks,
      scannerConfig.anchorText,
      scannerConfig.anchorFuzzyThreshold,
    );

    expect(anchor).toBeDefined();
    expect(anchor?.text.toUpperCase()).toContain("CHARACTER");
  });

  it("returns undefined when no block is close enough", () => {
    const anchor = findAnchor(
      [{ text: "totally unrelated", confidence: 1, frame: { x: 0, y: 0, width: 10, height: 10 } }],
      scannerConfig.anchorText,
      scannerConfig.anchorFuzzyThreshold,
    );

    expect(anchor).toBeUndefined();
  });
});
```

**Step 2: Run it to verify it fails**

```bash
cd apps/expo
npx jest src/features/scanner/anchor.test.ts
```

Expected: FAIL — `anchor.ts` (and `tsconfig.json`'s `resolveJsonModule`, check
it's enabled) don't exist yet.

**Step 3: Write the implementation**

```typescript
export interface OcrBlock {
  text: string;
  confidence: number;
  frame: { x: number; y: number; width: number; height: number };
}

function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = 0; i <= a.length; i++) dp[i]![0] = i;
  for (let j = 0; j <= b.length; j++) dp[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + cost,
      );
    }
  }
  return dp[a.length]![b.length]!;
}

function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

export function findAnchor(
  blocks: OcrBlock[],
  anchorText: string,
  threshold: number,
): OcrBlock | undefined {
  let best: OcrBlock | undefined;
  let bestScore = 0;

  for (const block of blocks) {
    const score = similarity(block.text.trim().toUpperCase(), anchorText.toUpperCase());
    if (score >= threshold && score > bestScore) {
      best = block;
      bestScore = score;
    }
  }

  return best;
}
```

If `character-sheet-01.json`'s "CHARACTER" block has other text on the same
line (e.g. "CHARACTER LEVEL 93" all merged into one block by ML Kit), a strict
whole-block-equals-"CHARACTER" fuzzy match won't score high enough — switch
`similarity` to compare against `anchorText` as a substring check first
(`block.text.toUpperCase().includes(anchorText.toUpperCase())`) before falling
back to fuzzy whole-string comparison. Check the real fixture before assuming
either shape.

**Step 4: Run it to verify it passes**

```bash
npx jest src/features/scanner/anchor.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/features/scanner/anchor.ts src/features/scanner/anchor.test.ts
git commit -m "feat: add anchor.ts fuzzy header matching"
```

---

### Task 8: `fields.ts`

**Files:**
- Create: `apps/expo/src/features/scanner/fields.ts`
- Test: `apps/expo/src/features/scanner/fields.test.ts`

**Step 1: Investigate the real layout (mandatory before writing the test)**

Open `apps/expo/src/features/scanner/__fixtures__/ocr-blocks/character-sheet-01.json`
and, using the anchor block's `frame` (found by Task 7) as a reference point,
manually find:

- Which block contains `"93"` (the known level for this photo, per Phase 0's
  `OcrPhase0Test.recognizesLevelOnClearPhoto`) and its position relative to the
  anchor.
- Which block contains `"UDAN"` (name) and which contains `"Demonic Defender"`
  (title), and their relative positions.

Record what you find (e.g. "level renders as a short block directly below the
header; name renders below level; title renders below name") — this determines
the extraction order in Step 3. If the actual layout differs from what's
written there, use what you observed, not what's written.

**Step 2: Write the failing test using the real fixture data**

```typescript
import fixture from "./__fixtures__/ocr-blocks/character-sheet-01.json";
import { findAnchor } from "./anchor";
import { extractFields } from "./fields";
import { scannerConfig } from "./config";

describe("extractFields", () => {
  it("extracts level, name, and title from a real capture", () => {
    const anchor = findAnchor(
      fixture.blocks,
      scannerConfig.anchorText,
      scannerConfig.anchorFuzzyThreshold,
    );
    if (!anchor) throw new Error("Anchor not found in fixture - fix Task 7 first");

    const fields = extractFields(fixture.blocks, anchor);

    expect(fields.level?.text).toContain("93");
    expect(fields.name?.text.toUpperCase()).toContain("UDAN");
    expect(fields.title?.text).toContain("Demonic Defender");
  });
});
```

**Step 3: Run it to verify it fails, then implement**

```bash
npx jest src/features/scanner/fields.test.ts   # expect FAIL, fields.ts missing
```

Write `fields.ts` using the layout confirmed in Step 1. This starting point
assumes level renders as a short numeric string closest to the anchor, with
name and title further below in that order — **adjust the `remaining` split in
Step 1's findings if the real order differs**:

```typescript
import type { OcrBlock } from "./anchor";

export interface FieldCandidates {
  level?: OcrBlock;
  title?: OcrBlock;
  name?: OcrBlock;
}

export function extractFields(blocks: OcrBlock[], anchor: OcrBlock): FieldCandidates {
  const below = blocks
    .filter((b) => b !== anchor && b.frame.y > anchor.frame.y + anchor.frame.height)
    .sort((a, b) => a.frame.y - b.frame.y);

  const level = below.find((b) => /\d{1,3}/.test(b.text.trim()));
  const remaining = below.filter((b) => b !== level);
  const [name, title] = remaining;

  return { level, name, title };
}
```

**Step 4: Run it to verify it passes**

```bash
npx jest src/features/scanner/fields.test.ts
```

Expected: PASS. If it doesn't pass after one iteration on the extraction
logic, stop and re-check Step 1's findings rather than guessing further
adjustments blind.

**Step 5: Commit**

```bash
git add src/features/scanner/fields.ts src/features/scanner/fields.test.ts
git commit -m "feat: add fields.ts geometric field extraction"
```

---

### Task 9: `voting.ts`

**Files:**
- Create: `apps/expo/src/features/scanner/voting.ts`
- Test: `apps/expo/src/features/scanner/voting.test.ts`

Pure state machine, no fixtures needed — synthetic inputs are sufficient and
clearer.

**Step 1: Write the failing tests**

```typescript
import { castVote, createVoteState } from "./voting";

describe("castVote", () => {
  it("locks once a candidate reaches the threshold within the window", () => {
    let state = createVoteState<string>();
    state = castVote(state, "93", 8, 3);
    expect(state.locked).toBeUndefined();
    state = castVote(state, "93", 8, 3);
    expect(state.locked).toBeUndefined();
    state = castVote(state, "93", 8, 3);
    expect(state.locked).toBe("93");
  });

  it("survives a single bad frame without resetting the count", () => {
    let state = createVoteState<string>();
    state = castVote(state, "93", 8, 3);
    state = castVote(state, "9E", 8, 3); // one blurred/misread frame
    state = castVote(state, "93", 8, 3);
    state = castVote(state, "93", 8, 3);
    expect(state.locked).toBe("93");
  });

  it("keeps only the last windowSize votes", () => {
    let state = createVoteState<string>();
    // 3 votes for "A", then enough "B" votes to push "A" out of an 8-wide window
    for (let i = 0; i < 3; i++) state = castVote(state, "A", 8, 5);
    for (let i = 0; i < 5; i++) state = castVote(state, "B", 8, 5);
    expect(state.locked).toBe("B");
  });

  it("does not vote when the candidate is undefined", () => {
    let state = createVoteState<string>();
    state = castVote(state, "93", 8, 1);
    state = castVote(state, undefined, 8, 1);
    expect(state.window).toEqual(["93"]);
  });

  it("stays locked once locked, ignoring further votes", () => {
    let state = createVoteState<string>();
    for (let i = 0; i < 3; i++) state = castVote(state, "93", 8, 3);
    state = castVote(state, "77", 8, 3);
    expect(state.locked).toBe("93");
  });
});
```

**Step 2: Run to verify it fails**

```bash
npx jest src/features/scanner/voting.test.ts
```

**Step 3: Implement**

```typescript
export interface VoteState<T> {
  window: T[];
  locked?: T;
}

export function createVoteState<T>(): VoteState<T> {
  return { window: [] };
}

export function castVote<T>(
  state: VoteState<T>,
  candidate: T | undefined,
  windowSize: number,
  threshold: number,
  isEqual: (a: T, b: T) => boolean = (a, b) => a === b,
): VoteState<T> {
  if (state.locked !== undefined) return state;
  if (candidate === undefined) return state;

  const window = [...state.window, candidate].slice(-windowSize);

  const groups: { value: T; count: number }[] = [];
  for (const item of window) {
    const existing = groups.find((g) => isEqual(g.value, item));
    if (existing) existing.count++;
    else groups.push({ value: item, count: 1 });
  }

  const winner = groups.find((g) => g.count >= threshold);
  return { window, locked: winner?.value };
}
```

**Step 4: Run to verify it passes**

```bash
npx jest src/features/scanner/voting.test.ts
```

Expected: PASS, all 5 cases.

**Step 5: Commit**

```bash
git add src/features/scanner/voting.ts src/features/scanner/voting.test.ts
git commit -m "feat: add voting.ts rolling-window lock-in"
```

---

### Task 10: `useTextScanner.ts`

**Files:**
- Create: `apps/expo/src/features/scanner/useTextScanner.ts`

Not unit-tested (it's a hook wiring together a native frame processor call with
React state — no pure logic left to test here that isn't already covered by
Tasks 7–9). Verified on-device in Task 12.

**Step 1: Write the hook**

```typescript
import { useRef, useState } from "react";
import { useFrameProcessor } from "react-native-vision-camera";
import { useRunOnJS, useSharedValue, VisionCameraProxy } from "react-native-worklets-core";

import type { OcrBlock } from "./anchor";
import { findAnchor } from "./anchor";
import { extractFields } from "./fields";
import { scannerConfig } from "./config";
import { castVote, createVoteState } from "./voting";

const plugin = VisionCameraProxy.initFrameProcessorPlugin("scanText", {});

export interface ScanCandidates {
  level?: string;
  title?: string;
  name?: string;
}

interface PluginResult {
  blocks: OcrBlock[];
  width: number;
  height: number;
}

export function useTextScanner() {
  const [candidates, setCandidates] = useState<ScanCandidates>({});
  const levelVotes = useRef(createVoteState<string>());
  const titleVotes = useRef(createVoteState<string>());
  const nameVotes = useRef(createVoteState<string>());

  const handleResult = (raw: PluginResult | undefined) => {
    if (!raw) return;
    const anchor = findAnchor(
      raw.blocks,
      scannerConfig.anchorText,
      scannerConfig.anchorFuzzyThreshold,
    );
    if (!anchor) return;

    const fields = extractFields(raw.blocks, anchor);
    const { thresholds, windowSize } = scannerConfig.vote;

    levelVotes.current = castVote(levelVotes.current, fields.level?.text, windowSize, thresholds.level);
    titleVotes.current = castVote(titleVotes.current, fields.title?.text, windowSize, thresholds.title);
    nameVotes.current = castVote(nameVotes.current, fields.name?.text, windowSize, thresholds.name);

    setCandidates({
      level: levelVotes.current.locked ?? fields.level?.text,
      title: titleVotes.current.locked ?? fields.title?.text,
      name: nameVotes.current.locked ?? fields.name?.text,
    });
  };

  const handleResultWorklet = useRunOnJS(handleResult, [handleResult]);
  const lastProcessedAt = useSharedValue(0);

  if (plugin == null) {
    throw new Error("Failed to load scanText frame processor plugin - is the d4-ocr module linked?");
  }

  const frameIntervalNs = 1_000_000_000 / scannerConfig.targetFps;

  const frameProcessor = useFrameProcessor(
    (frame) => {
      "worklet";
      if (frame.timestamp - lastProcessedAt.value < frameIntervalNs) return;
      lastProcessedAt.value = frame.timestamp;

      const result = plugin.call(frame, {
        roiX: scannerConfig.roi.x,
        roiY: scannerConfig.roi.y,
        roiWidth: scannerConfig.roi.width,
        roiHeight: scannerConfig.roi.height,
      }) as unknown as PluginResult | undefined;

      handleResultWorklet(result);
    },
    [handleResultWorklet, lastProcessedAt, frameIntervalNs],
  );

  return { frameProcessor, candidates };
}
```

**Step 2: Typecheck**

```bash
cd apps/expo
npx tsc --noEmit
```

Expected: no new errors from this file.

**Step 3: Commit**

```bash
git add src/features/scanner/useTextScanner.ts
git commit -m "feat: add useTextScanner hook"
```

---

### Task 11: The real `scan.tsx` screen

**Files:**
- Create: `apps/expo/src/app/scan.tsx`
- Modify: `apps/expo/src/app/index.tsx`

**Step 1: Write the screen**

```tsx
import { StyleSheet, Text, View } from "react-native";
import { Camera, useCameraDevice, useCameraPermission } from "react-native-vision-camera";

import { scannerConfig } from "~/features/scanner/config";
import { useTextScanner } from "~/features/scanner/useTextScanner";

export default function ScanScreen() {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice("back");
  const { frameProcessor, candidates } = useTextScanner();

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
      <View
        style={[
          styles.roi,
          {
            left: `${scannerConfig.roi.x * 100}%`,
            top: `${scannerConfig.roi.y * 100}%`,
            width: `${scannerConfig.roi.width * 100}%`,
            height: `${scannerConfig.roi.height * 100}%`,
          },
        ]}
      />
      <View style={styles.fields}>
        <Text style={styles.fieldText}>Level: {candidates.level ?? "—"}</Text>
        <Text style={styles.fieldText}>Title: {candidates.title ?? "—"}</Text>
        <Text style={styles.fieldText}>Name: {candidates.name ?? "—"}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  roi: {
    position: "absolute",
    borderWidth: 2,
    borderColor: "#22d3ee",
  },
  fields: {
    position: "absolute",
    bottom: 60,
    left: 16,
    right: 16,
    backgroundColor: "rgba(0,0,0,0.6)",
    padding: 12,
    borderRadius: 8,
  },
  fieldText: { color: "white", fontSize: 16, marginBottom: 4 },
});
```

**Step 2: Add a permanent nav entry**

Unlike Phase 1's throwaway smoke screen, this is the real feature — add a
normal link from the home screen:

```tsx
// apps/expo/src/app/index.tsx, near MobileAuth, same spot Phase 1's temp link used:
<Link href="/scan" className="text-primary py-2 text-center">
  Scan character sheet
</Link>
```

**Step 3: Commit**

```bash
git add src/app/scan.tsx src/app/index.tsx
git commit -m "feat: add scan screen"
```

---

### Task 12: Build, run on device, verify against a real character sheet, decide

This is the pass/fail moment for the whole phase — don't skip straight to
"looks done," actually point the camera at a running Diablo 4 character sheet
(same setup Phase 0's photos came from) and watch it.

**Step 1: Build and install**

```bash
cd apps/expo
npx expo run:android
```

**Step 2: Point the camera at a character sheet**

Navigate to `/scan`. Grant the camera permission. Frame the character panel
inside the cyan ROI rectangle, roughly matching how Phase 0's photos were
angled/distanced.

**Step 3: Observe and record, don't rubber-stamp**

Watch for at least 15–20 seconds. Answer explicitly:

1. Do the three field rows update at all (proving blocks are flowing from the
   native plugin through anchor/fields/voting into React state)?
2. Does Level lock to the correct value? Given Phase 0's 36% raw hit rate on
   level, do NOT expect this to lock reliably yet — record what actually
   happens rather than assuming it matches Phase 0's number, since ROI
   cropping and ML Kit's confidence within a cropped panel-region-only image
   may behave differently than Phase 0's full-frame test photos.
3. Do Title and Name lock to plausible values?
4. Any crash, ANR, or native error in `adb logcat`?

```bash
adb logcat -d | grep -iE "FATAL|AndroidRuntime|d4ocr|scanText" | tail -80
```

5. Does the YUV→NV21 conversion look correct (image content is legible when
   you can infer it from what's being read), or does the OCR read garbage
   consistent with a striped/corrupted buffer? If the latter, the stride
   handling in Task 2's `imageToNv21` is the first suspect.

**Step 4: Record results in the design doc**

```bash
cat >> ../../docs/plans/2026-09-17-d4-character-scan-spike-design.md <<'EOF'

## Phase 2 results

<!-- Fill in from Task 12's on-device observations: did the native plugin
     deliver blocks, did anchor/field extraction work, did any field lock,
     and what's the honest assessment against Phase 0's baseline hit rates. -->
EOF
```

Fill in:

1. Whether the pipeline flows end-to-end (native plugin → JS → locked
   candidates) at all.
2. Per-field outcome (level/title/name): locked correctly, locked incorrectly,
   or never locked — and what you observed instead.
3. Whether `imageToNv21`'s stride handling produced legible frames.
4. Any crash/ANR.
5. What Phase 3's tuning priorities should be, based on what you saw (ROI
   rectangle placement, fuzzy threshold, vote thresholds, or field-extraction
   geometry in `fields.ts` if the assumed layout from Task 8 turned out
   wrong).

```bash
git add ../../docs/plans/2026-09-17-d4-character-scan-spike-design.md
git commit -m "docs: record phase 2 scan pipeline results"
```

**Step 5: Decide**

If the pipeline flows end-to-end and at least Name/Title lock plausibly
(matching Phase 0's stronger baseline hit rates on those two fields), Phase 2
is a qualified success — proceed to Phase 3's tuning pass. If nothing locks or
the app crashes, don't patch blindly inside this plan's scope: identify which
layer failed (native plugin returning no/garbled blocks, anchor not matching,
or field geometry wrong) using Step 3's observations, and write that up as a
blocker in the design doc rather than guessing fixes live.

---

## Out of scope for this plan

Tuning `config.ts`'s constants against real play sessions, A/B testing the vote
thresholds, item scanning, the guided step-by-step overlay, scroll handling,
persistence, API/database integration, and iOS runtime testing. Those are
Phase 3 or explicitly out of scope per the design doc.
