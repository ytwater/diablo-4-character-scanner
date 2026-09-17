# D4 OCR Phase 0 — Capture Reality Check Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prove that ML Kit's on-device text recognizer can read Class, Level, and
Name off a phone photo of the Diablo 4 character sheet, before any camera or
VisionCamera code exists.

**Architecture:** Run `expo prebuild` once to get a native Android project, add the
ML Kit Text Recognition Gradle dependency directly (no React Native wrapper — this
phase never touches JS), and drive it with an Android instrumented test that loads
a folder of real phone photos from test assets and prints/asserts what came back.
No frame processor, no VisionCamera, no live camera — this is the offline
"is it even possible" check called out in the design doc.

**Tech Stack:** Expo prebuild (bare Android project), Kotlin, ML Kit Text
Recognition (`com.google.mlkit:text-recognition:16.0.1`), AndroidX Test /
Espresso instrumented tests.

Design reference: `docs/plans/2026-09-17-d4-character-scan-spike-design.md`

---

### Task 0: Capture the source photos

This has no code, but every later task depends on it — do it first.

**Step 1: Shoot the photos**

With Diablo 4 running on your monitor and the character sheet open, take ~15 phone
photos, varying:
- angle (straight-on, and ~20-30° off to each side)
- distance (close crop of the header, and a wider shot)
- lighting (normal, and a pass with monitor brightness way up to induce glare)
- background (a bright zone background, and a dark one, since the sheet overlays
  the game world)

Save them as `character-sheet-01.jpg` through `character-sheet-15.jpg` (or however
many you end up with).

**Step 2: Note ground truth**

In a plain text file, write down what the sheet actually says for each photo —
class, level, name — so later steps have something to compare against. Class and
level are checkable against real values; name is just recorded for eyeballing.

**Step 3: Place the files**

```
apps/expo/android/app/src/androidTest/assets/character-sheets/character-sheet-01.jpg
apps/expo/android/app/src/androidTest/assets/character-sheets/character-sheet-02.jpg
...
apps/expo/android/app/src/androidTest/assets/ground-truth.txt
```

(The `android/` directory doesn't exist yet — that's Task 1. Come back and drop
the files in after prebuild runs.)

**Step 4: Commit the photos**

```bash
git add apps/expo/android/app/src/androidTest/assets/character-sheets/
git commit -m "test: add character sheet photos for OCR phase 0"
```

Note: these are personal screenshots of your own gameplay, not copyrighted game
assets being redistributed — fine to commit to your own private repo. Skip this
step if you'd rather keep them untracked; add the folder to `.gitignore` instead
and just keep them on disk locally.

---

### Task 1: Prebuild the native Android project

**Files:**
- Creates: `apps/expo/android/` (generated, not hand-written)
- Modify: `apps/expo/.gitignore` (check `android/` isn't already ignored — Expo's
  default ignores it since it's normally regenerated; for this spike we need to
  keep hand-edits, so we'll partially un-ignore it in Task 2)

**Step 1: Run prebuild**

```bash
cd apps/expo
npx expo prebuild --platform android
```

Expected: generates `android/` with a Gradle project, no errors. This reads
`app.config.ts` and the installed plugins list (currently `expo-router`,
`expo-secure-store`, `expo-web-browser`, `expo-splash-screen`) to configure the
native project.

**Step 2: Verify it builds clean before touching anything**

```bash
cd android && ./gradlew :app:assembleDebug
```

Expected: `BUILD SUCCESSFUL`. If this fails, stop and fix the base prebuild before
adding ML Kit — don't debug two things at once.

**Step 3: Commit the generated project**

Check what Expo's `.gitignore` did:

```bash
cd apps/expo && git status --short android/ | head -5
```

If `android/` is fully ignored, add a narrow exception so this spike's native
changes are tracked (normally you'd let CI regenerate it, but this spike lives and
dies by its native code, so we want it in git):

```bash
cat .gitignore | grep -n "^/android"
```

Edit `apps/expo/.gitignore` to remove or scope down the `/android` ignore line if
present, then:

```bash
git add android/ .gitignore
git commit -m "chore: prebuild native android project for ocr spike"
```

---

### Task 2: Add the ML Kit dependency

**Files:**
- Modify: `apps/expo/android/app/build.gradle`

**Step 1: Add the dependency**

Open `apps/expo/android/app/build.gradle`, find the `dependencies { ... }` block,
add:

```gradle
dependencies {
    // ... existing entries ...
    implementation("com.google.mlkit:text-recognition:16.0.1")
}
```

**Step 2: Add instrumented test dependencies**

In the same file's `dependencies` block:

```gradle
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.test:runner:1.6.2")
    androidTestImplementation("androidx.test:core:1.6.1")
```

**Step 3: Sync and verify**

```bash
cd android && ./gradlew :app:assembleDebugAndroidTest
```

Expected: `BUILD SUCCESSFUL`. This just confirms the dependencies resolve; no test
code exists yet.

**Step 4: Commit**

```bash
git add android/app/build.gradle
git commit -m "chore: add ML Kit text recognition dependency"
```

---

### Task 3: Write the OCR reader against a single known-good photo

**Files:**
- Create: `apps/expo/android/app/src/androidTest/assets/character-sheets/` (photos
  from Task 0)
- Create: `apps/expo/android/app/src/androidTest/java/expo/modules/d4ocr/OcrPhase0Test.kt`

**Step 1: Write the failing test**

Pick your clearest, most straight-on photo (say `character-sheet-01.jpg`) and its
recorded ground truth. Write a test asserting the class comes back somewhere in
the recognized text:

```kotlin
package expo.modules.d4ocr

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class OcrPhase0Test {

    private fun recognizeAsset(fileName: String): String {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val stream = context.assets.open("character-sheets/$fileName")
        val bitmap = android.graphics.BitmapFactory.decodeStream(stream)
        val image = InputImage.fromBitmap(bitmap, 0)
        val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
        val result = Tasks.await(recognizer.process(image))
        return result.text
    }

    @Test
    fun recognizesClassOnClearPhoto() {
        val text = recognizeAsset("character-sheet-01.jpg")
        // Replace "Sorcerer" with whatever class your ground truth photo actually shows.
        assertTrue(
            "Expected a class name in recognized text, got:\n$text",
            text.contains("Sorcerer", ignoreCase = true),
        )
    }
}
```

Adjust the asserted class string to match your actual Task 0 ground truth for that
photo.

**Step 2: Run it and confirm it fails for the right reason first**

Before the asset even exists, or before ML Kit is wired right, expect a clear
failure (missing asset, not a silent false pass):

```bash
cd android && ./gradlew :app:connectedDebugAndroidTest --tests "expo.modules.d4ocr.OcrPhase0Test"
```

Expected: FAIL — either `FileNotFoundException` (asset missing, add the photo) or
an assertion failure showing what ML Kit actually read.

**Step 3: Make it pass**

Ensure the photo is in place at
`android/app/src/androidTest/assets/character-sheets/character-sheet-01.jpg`, and
that a physical Android device or emulator is connected (`adb devices` shows one).
Re-run the same command.

Expected: PASS, or a failure whose printed `text` shows you what ML Kit actually
read — which is itself the answer this phase exists to get. If it fails, this is
real signal: read the printed text, see how far off it is (garbled string vs.
completely empty vs. right characters wrong case), and note it — don't just tweak
the test until it's green.

**Step 4: Commit**

```bash
git add android/app/src/androidTest/java/expo/modules/d4ocr/OcrPhase0Test.kt
git commit -m "test: add first OCR phase 0 test against a known-good photo"
```

---

### Task 4: Extend to the full photo set with per-photo results

**Files:**
- Modify: `apps/expo/android/app/src/androidTest/java/expo/modules/d4ocr/OcrPhase0Test.kt`

**Step 1: Write a parameterized-style test over every photo**

Rather than one assertion per photo (which gets unwieldy at 15 photos), add a test
that loops all assets and logs a pass/fail table without stopping at the first
failure — the goal here is a full picture of the read quality, not a single
green checkmark.

```kotlin
    data class ExpectedFields(val fileName: String, val expectedClass: String, val expectedLevel: String)

    // Fill in from your Task 0 ground-truth notes.
    private val samples = listOf(
        ExpectedFields("character-sheet-01.jpg", "Sorcerer", "47"),
        ExpectedFields("character-sheet-02.jpg", "Barbarian", "62"),
        // ... one entry per photo ...
    )

    @Test
    fun reportsRecognitionAcrossAllSamples() {
        val results = samples.map { sample ->
            val text = recognizeAsset(sample.fileName)
            val classFound = text.contains(sample.expectedClass, ignoreCase = true)
            val levelFound = text.contains(sample.expectedLevel)
            Triple(sample.fileName, classFound, levelFound) to text
        }

        val report = results.joinToString("\n") { (triple, text) ->
            val (fileName, classFound, levelFound) = triple
            "$fileName -> class=$classFound level=$levelFound\n  raw: ${text.replace("\n", " | ")}"
        }
        println(report)

        val classHitRate = results.count { it.first.second } .toDouble() / results.size
        assertTrue(
            "Class recognized in fewer than half of samples ($classHitRate). Report:\n$report",
            classHitRate >= 0.5,
        )
    }
```

The 0.5 threshold is a floor, not a target — it exists so a badly broken pipeline
fails loudly instead of silently passing with a 1-in-15 hit rate. The real
judgment call is reading the printed report.

**Step 2: Run against the full set**

```bash
cd android && ./gradlew :app:connectedDebugAndroidTest --tests "expo.modules.d4ocr.OcrPhase0Test" -i
```

Expected: PASS or FAIL on the threshold, plus (with `-i` for info-level logging) the
full per-photo report printed to console. Save that console output somewhere —
it's the actual deliverable of Phase 0.

**Step 3: Commit**

```bash
git add android/app/src/androidTest/java/expo/modules/d4ocr/OcrPhase0Test.kt
git commit -m "test: report OCR recognition rate across full photo set"
```

---

### Task 5: Read the results and decide

This is a decision point, not code — do not skip it or rubber-stamp it.

Look at the printed report from Task 4 and answer, in a short note appended to the
bottom of `docs/plans/2026-09-17-d4-character-scan-spike-design.md` under a new
`## Phase 0 results` heading:

1. What fraction of photos had the class recognized correctly?
2. What fraction had the level recognized correctly?
3. For the name field specifically (not asserted in code, judge by eye from the
   raw text in the report): is it close enough to be useful, close enough to
   need fuzzy correction, or unusable?
4. Did glare or off-angle shots fail dramatically worse than straight-on shots?
   If so, that becomes a user-facing instruction in the eventual guided overlay
   ("hold the phone flat to the screen"), not a code problem.

**Step 1: Append the results section**

```bash
cat >> docs/plans/2026-09-17-d4-character-scan-spike-design.md <<'EOF'

## Phase 0 results

<!-- Fill in from the Task 4 report: hit rates, name-field impression, and
     whether glare/angle mattered. This is the go/no-go for Phase 1. -->
EOF
```

Fill in the actual numbers and impressions, then:

```bash
git add docs/plans/2026-09-17-d4-character-scan-spike-design.md
git commit -m "docs: record phase 0 OCR results"
```

**Step 2: Decide**

If class/level recognition is reasonably reliable on decent photos (rough
guideline: better than 70% on the straight-on, non-glare shots), Phase 1
(VisionCamera + worklets-core install) is worth doing. If it's much worse than
that even on your best photos, stop and reconsider — either the ROI cropping
approach needs rethinking, or this needs a different capture technique (e.g.
requiring the user to photograph the sheet on a plain background) before more
app code is written.

---

## Out of scope for this plan

VisionCamera, worklets-core, the frame processor, the JS scanner layer, the scan
screen, and the anchor/fields/voting logic. Those are Phase 1 onward per the design
doc, and get their own implementation plan once Phase 0's go/no-go is decided.
